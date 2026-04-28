import { Assets, Texture } from 'pixi.js'
import type { CoordsTexture } from './types'
import type { ContourSamples } from '../node-engine/types'

export interface CoordsSource {
    json: number[] | Record<string, unknown>
}

function findNumericArray(json: unknown): number[] | undefined {
    if (Array.isArray(json)) return json as number[]
    if (json && typeof json === 'object') {
        for (const value of Object.values(json as Record<string, unknown>)) {
            if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
                return value as number[]
            }
        }
    }
    return undefined
}

function normalizeCoords(coords: Float32Array, canvasW: number, canvasH: number) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const out = new Float32Array(coords.length)
    for (let i = 0; i < coords.length; i += 2) {
        const xn = Math.min(1, Math.max(0, coords[i] / canvasW))
        const yn = Math.min(1, Math.max(0, coords[i + 1] / canvasH))
        out[i] = xn
        out[i + 1] = yn
        
        if (minX > xn) minX = xn
        if (maxX < xn) maxX = xn
        if (minY > yn) minY = yn
        if (maxY < yn) maxY = yn
    }
    return { normalized: out, minX, minY, maxX, maxY }
}

function fitTextureWH(pointPairs: number) {
    const w = Math.ceil(Math.sqrt(pointPairs))
    const h = Math.ceil(pointPairs / w)
    return { w, h }
}

function packCoordsToDataUrl(normalized: Float32Array) {
    const nPairs = normalized.length / 2
    const { w, h } = fitTextureWH(nPairs)
    const imageData = new ImageData(w, h)
    const rgba = imageData.data
    for (let i = 0; i < nPairs; i++) {
        const xn = normalized[2 * i]
        const yn = normalized[2 * i + 1]
        const R = Math.max(0, Math.min(255, Math.round(xn * 255)))
        const G = Math.max(0, Math.min(255, Math.round(yn * 255)))
        const pi = i * 4
        rgba[pi + 0] = R
        rgba[pi + 1] = G
        rgba[pi + 2] = 0
        rgba[pi + 3] = 255
    }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = w
    canvas.height = h
    ctx.putImageData(imageData, 0, 0)
    return { dataUrl: canvas.toDataURL(), w, h, count: nPairs }
}

export async function buildCoordsTexture(
    coords: CoordsSource | undefined,
    canvasW: number,
    canvasH: number,
): Promise<CoordsTexture | undefined> {
    if (!coords?.json) return undefined
    const arr = findNumericArray(coords.json)
    if (!arr) throw new Error('JSON does not contain a numeric array')
    const evenArr = arr.length % 2 === 0 ? arr : arr.slice(0, arr.length - 1)
    const coordsArr = new Float32Array(evenArr)
    const { normalized, minX, minY, maxX, maxY } = normalizeCoords(coordsArr, canvasW, canvasH)
    const { dataUrl, w, h, count } = packCoordsToDataUrl(normalized)
    const tex = await Assets.load(dataUrl)
    return { tex, w, h, count, minX, minY, maxX, maxY }
}

/**
 * Synchronous variant of {@link buildCoordsTexture} that consumes a
 * platform-agnostic {@link ContourSamples} (sample positions in pixel space)
 * and packs them into an RGBA8 texture with the same layout the SDF fragment
 * expects (R = X / canvasW, G = Y / canvasH, both 8-bit).
 *
 * Returned `CoordsTexture.tex` is owned by the caller and must be destroyed
 * when the contour reference changes.
 */
export function buildCoordsTextureFromContour(
    contour: ContourSamples,
    canvasW: number,
    canvasH: number,
): CoordsTexture | undefined {
    const N = contour.count
    if (N < 3 || canvasW <= 0 || canvasH <= 0) return undefined

    const normalized = new Float32Array(N * 2)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < N; i++) {
        const xn = Math.min(1, Math.max(0, contour.positions[i * 2] / canvasW))
        const yn = Math.min(1, Math.max(0, contour.positions[i * 2 + 1] / canvasH))
        normalized[i * 2] = xn
        normalized[i * 2 + 1] = yn
        if (xn < minX) minX = xn
        if (xn > maxX) maxX = xn
        if (yn < minY) minY = yn
        if (yn > maxY) maxY = yn
    }

    const { w, h } = fitTextureWH(N)
    const imageData = new ImageData(w, h)
    const rgba = imageData.data
    for (let i = 0; i < N; i++) {
        const R = Math.max(0, Math.min(255, Math.round(normalized[2 * i] * 255)))
        const G = Math.max(0, Math.min(255, Math.round(normalized[2 * i + 1] * 255)))
        const pi = i * 4
        rgba[pi + 0] = R
        rgba[pi + 1] = G
        rgba[pi + 2] = 0
        rgba[pi + 3] = 255
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.putImageData(imageData, 0, 0)

    /* nearest sampling — the SDF fragment uses texelFetch, but keep nearest
       for any future code that might sample with uv. */
    const tex = Texture.from(canvas)
    tex.source.scaleMode = 'nearest'

    return { tex, w, h, count: N, minX, minY, maxX, maxY }
}
