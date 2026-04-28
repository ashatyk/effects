import { TextureSource } from 'pixi.js'

const CHARS = '0123456789ABCDEF'
const COLS = 4
const CELL = 128
const SIZE = CELL * COLS // 512

let cached: TextureSource | null = null

/**
 * Generates a single-channel SDF atlas for hex characters (0-F) arranged in a 4x4 grid.
 * Uses 2D canvas rendering + dead-reckoning distance transform.
 * Returns a Pixi TextureSource (RGBA where R=G=B=SDF value, A=1).
 */
export async function generateSdfAtlas(): Promise<TextureSource> {
    if (cached) return cached

    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, SIZE, SIZE)

    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${CELL * 0.72}px "JetBrains Mono", "SF Mono", "Roboto Mono", "Consolas", monospace`

    for (let i = 0; i < CHARS.length; i++) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const cx = col * CELL + CELL / 2
        const cy = row * CELL + CELL / 2
        ctx.fillText(CHARS[i], cx, cy)
    }

    const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
    const { data } = imageData

    const binary = new Uint8Array(SIZE * SIZE)
    for (let i = 0; i < binary.length; i++) {
        binary[i] = data[i * 4] > 127 ? 1 : 0
    }

    const sdf = computeSdf(binary, SIZE, SIZE)

    const outData = new Uint8Array(SIZE * SIZE * 4)
    for (let i = 0; i < sdf.length; i++) {
        const v = Math.round(sdf[i] * 255)
        outData[i * 4] = v
        outData[i * 4 + 1] = v
        outData[i * 4 + 2] = v
        outData[i * 4 + 3] = 255
    }

    const outImageData = new ImageData(new Uint8ClampedArray(outData.buffer), SIZE, SIZE)
    ctx.putImageData(outImageData, 0, 0)

    const blob = await new Promise<Blob>((r) => canvas.toBlob(b => r(b!), 'image/png'))
    const bitmap = await createImageBitmap(blob)

    cached = new TextureSource({ resource: bitmap, alphaMode: 'no-premultiply-alpha' })
    return cached
}

/**
 * Dead-reckoning distance transform.
 * Returns float array [0..1] where 0.5 = edge, >0.5 = inside, <0.5 = outside.
 */
function computeSdf(binary: Uint8Array, w: number, h: number): Float32Array {
    const INF = 1e10
    const spread = 24

    const distOut = new Float32Array(w * h).fill(INF)
    const distIn = new Float32Array(w * h).fill(INF)

    for (let i = 0; i < w * h; i++) {
        if (binary[i] === 0) distOut[i] = 0
        if (binary[i] === 1) distIn[i] = 0
    }

    edt(distOut, w, h)
    edt(distIn, w, h)

    const result = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) {
        const outside = Math.sqrt(distOut[i])
        const inside = Math.sqrt(distIn[i])
        const sd = binary[i] === 1 ? outside : -inside
        result[i] = Math.max(0, Math.min(1, sd / spread * 0.5 + 0.5))
    }
    return result
}

/** Squared Euclidean distance transform (Felzenszwalb & Huttenlocher) */
function edt(grid: Float32Array, w: number, h: number) {
    const f = new Float32Array(Math.max(w, h))
    const d = new Float32Array(Math.max(w, h))
    const v = new Int32Array(Math.max(w, h))
    const z = new Float32Array(Math.max(w, h) + 1)

    for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, d, v, z)
    for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, d, v, z)
}

function edt1d(
    grid: Float32Array, offset: number, stride: number, length: number,
    f: Float32Array, d: Float32Array, v: Int32Array, z: Float32Array,
) {
    for (let q = 0; q < length; q++) f[q] = grid[offset + q * stride]

    v[0] = 0
    z[0] = -1e10
    z[1] = 1e10
    let k = 0

    for (let q = 1; q < length; q++) {
        let s: number
        do {
            const r = v[k]
            s = (f[q] - f[r] + q * q - r * r) / (2 * q - 2 * r)
            if (s > z[k]) break
            k--
        } while (k >= 0)
        k++
        v[k] = q
        z[k] = s
        z[k + 1] = 1e10
    }

    k = 0
    for (let q = 0; q < length; q++) {
        while (z[k + 1] < q) k++
        const dx = q - v[k]
        d[q] = dx * dx + f[v[k]]
    }

    for (let q = 0; q < length; q++) grid[offset + q * stride] = d[q]
}
