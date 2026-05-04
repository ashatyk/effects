import { Texture } from 'pixi.js'
import type { CoordsTexture } from './types'
import type { ContourSamples } from '../node-engine/types'

function fitTextureWH(pointPairs: number) {
    const w = Math.ceil(Math.sqrt(pointPairs))
    const h = Math.ceil(pointPairs / w)
    return { w, h }
}

/**
 * Pack a {@link ContourSamples} ring (positions in pixel space) into an
 * RGBA8 texture: R = X / canvasW, G = Y / canvasH, both 8-bit. The shape
 * matches what the SDF fragment (`pipeline/passes/sdf-pure.ts`) reads
 * via `texelFetch(uPointTexture, ...).rg`.
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
