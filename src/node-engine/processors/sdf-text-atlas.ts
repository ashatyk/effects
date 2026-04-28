/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container, Sprite, Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const COLS = 4
const SLOT_COUNT = COLS * COLS
const CELL = 128
const SIZE = CELL * COLS
const SPREAD = 24

const DEFAULT_TEXT = 'Купи в комплекте'

export const sdfTextAtlasDef: ProcessorDef = {
    type: 'sdfTextAtlas',
    title: 'SDF Text Atlas',
    category: 'input',
    inputs: [],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { text: DEFAULT_TEXT },
}

export class SdfTextAtlasProcessor extends BaseProcessor {
    readonly def = sdfTextAtlasDef

    private generating = false
    private cachedText: string | null = null

    execute(_inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const text = String(params.text ?? DEFAULT_TEXT)
        if (this.cachedText === text) {
            return { texture: this.ensureRT(SIZE, SIZE).source }
        }

        if (!this.generating) {
            this.generating = true
            this.buildAtlas(text, engine)
        }

        return { texture: null }
    }

    private buildAtlas(text: string, engine: IDataflowEngine): void {
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')!

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, SIZE, SIZE)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `bold ${CELL * 0.72}px "Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif`

        const chars = Array.from(text).slice(0, SLOT_COUNT)
        for (let i = 0; i < chars.length; i++) {
            const col = i % COLS
            const row = Math.floor(i / COLS)
            ctx.fillText(chars[i], col * CELL + CELL / 2, row * CELL + CELL / 2)
        }

        const imgData = ctx.getImageData(0, 0, SIZE, SIZE)
        const binary = new Uint8Array(SIZE * SIZE)
        for (let i = 0; i < binary.length; i++) {
            binary[i] = imgData.data[i * 4] > 127 ? 1 : 0
        }

        const sdf = this.computeSdf(binary, SIZE, SIZE)

        const out = new Uint8ClampedArray(SIZE * SIZE * 4)
        for (let i = 0; i < sdf.length; i++) {
            const v = Math.round(sdf[i] * 255)
            out[i * 4] = v
            out[i * 4 + 1] = v
            out[i * 4 + 2] = v
            out[i * 4 + 3] = 255
        }
        ctx.putImageData(new ImageData(out, SIZE, SIZE), 0, 0)

        canvas.toBlob(blob => {
            if (!blob) { this.generating = false; return }
            const url = URL.createObjectURL(blob)
            const img = new Image()
            img.onload = () => {
                URL.revokeObjectURL(url)
                const rt = this.ensureRT(SIZE, SIZE)
                const tex = Texture.from(img)
                const sprite = new Sprite(tex)
                sprite.width = SIZE
                sprite.height = SIZE
                const container = new Container()
                container.addChild(sprite)
                engine.app.renderer.render({ container, target: rt, clear: true })
                container.destroy({ children: true })
                this.cachedText = text
                this.generating = false
                engine.markDirty(this.nodeId)
            }
            img.src = url
        }, 'image/png')
    }

    private computeSdf(binary: Uint8Array, w: number, h: number): Float32Array {
        const INF = 1e10
        const distOut = new Float32Array(w * h).fill(INF)
        const distIn = new Float32Array(w * h).fill(INF)

        for (let i = 0; i < w * h; i++) {
            if (binary[i] === 0) distOut[i] = 0
            if (binary[i] === 1) distIn[i] = 0
        }

        this.edt(distOut, w, h)
        this.edt(distIn, w, h)

        const result = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) {
            const outside = Math.sqrt(distOut[i])
            const inside = Math.sqrt(distIn[i])
            const sd = binary[i] === 1 ? outside : -inside
            result[i] = Math.max(0, Math.min(1, sd / SPREAD * 0.5 + 0.5))
        }
        return result
    }

    private edt(grid: Float32Array, w: number, h: number): void {
        const max = Math.max(w, h)
        const f = new Float32Array(max)
        const d = new Float32Array(max)
        const v = new Int32Array(max)
        const z = new Float32Array(max + 1)
        for (let y = 0; y < h; y++) this.edt1d(grid, y * w, 1, w, f, d, v, z)
        for (let x = 0; x < w; x++) this.edt1d(grid, x, w, h, f, d, v, z)
    }

    private edt1d(
        grid: Float32Array, offset: number, stride: number, length: number,
        f: Float32Array, d: Float32Array, v: Int32Array, z: Float32Array,
    ): void {
        for (let q = 0; q < length; q++) f[q] = grid[offset + q * stride]
        v[0] = 0; z[0] = -1e10; z[1] = 1e10
        let k = 0
        for (let q = 1; q < length; q++) {
            let s: number
            do {
                const r = v[k]
                s = (f[q] - f[r] + q * q - r * r) / (2 * q - 2 * r)
                if (s > z[k]) break
                k--
            } while (k >= 0)
            k++; v[k] = q; z[k] = s; z[k + 1] = 1e10
        }
        k = 0
        for (let q = 0; q < length; q++) {
            while (z[k + 1] < q) k++
            const dx = q - v[k]
            d[q] = dx * dx + f[v[k]]
        }
        for (let q = 0; q < length; q++) grid[offset + q * stride] = d[q]
    }
}
