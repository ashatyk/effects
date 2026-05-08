/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

// Frozen ContourSamples source: bake step (player/baking.ts) replaces
// segmentation/contourResample subgraphs with this at config export. Hands the
// payload back as a reference-stable object so downstream identity-caches
// (contourResample, sdfFromContour, engine outputsEqual diff) don't re-render.
export const constantContourDef: ProcessorDef = {
    pure: true,
    hidden: true,
    type: 'constantContour',
    title: 'Constant Contour',
    category: 'contour',
    inputs: [],
    outputs: [{ name: 'contour', type: SLOT.CONTOUR }],
    defaultParams: {
        // Inline ContourSamples; Float32Array fields are stored as number[] for JSON
        // round-trip and rehydrated on first execute. Empty default — bake overwrites.
        version: 1,
        closed: true,
        count: 0,
        totalLength: 0,
        aabb: [0, 0, 0, 0],
        positions: [],
        tangents: [],
        arcS: [],
    },
}

export class ConstantContourProcessor extends BaseProcessor {
    readonly def = constantContourDef

    // Reference-stable cache: rehydrated only when `params` reference changes.
    private cached: ContourSamples | null = null
    private cachedFrom: Record<string, any> | null = null

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        if (this.cached && this.cachedFrom === params) {
            return { contour: this.cached }
        }

        const count = Number(params.count) | 0
        if (count < 3) {
            this.cached = null
            this.cachedFrom = params
            return { contour: null }
        }

        const positions = toFloat32(params.positions, count * 2)
        const tangents = toFloat32(params.tangents, count * 2)
        const arcS = toFloat32(params.arcS, count)
        const aabb = (Array.isArray(params.aabb) && params.aabb.length === 4
            ? params.aabb.map(Number)
            : [0, 0, 0, 0]) as [number, number, number, number]

        this.cached = {
            version: 1,
            closed: params.closed !== false,
            count,
            totalLength: Number(params.totalLength) || 0,
            aabb,
            positions,
            tangents,
            arcS,
        }
        this.cachedFrom = params
        return { contour: this.cached }
    }
}

function toFloat32(src: unknown, expectedLength: number): Float32Array {
    if (!Array.isArray(src) || src.length !== expectedLength) {
        return new Float32Array(expectedLength)
    }
    const out = new Float32Array(expectedLength)
    for (let i = 0; i < expectedLength; i++) out[i] = Number(src[i]) || 0
    return out
}
