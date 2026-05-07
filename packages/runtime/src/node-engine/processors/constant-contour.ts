/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

/**
 * Frozen-source processor for {@link ContourSamples}.
 *
 * The supplier app's bake step (`packages/player/src/baking.ts`)
 * pre-runs static contour-producing subgraphs (e.g.
 * `segmentation → contourResample`) once at config-export time and
 * embeds the resulting `ContourSamples` into `SupplierConfig.baked`.
 * On Tier-3 player mount, the original processors are **replaced**
 * with this one — the player never instantiates segmentation /
 * contourResample, never runs them per-tick, and never holds their
 * internal CPU state (resampled positions arrays, chaikin
 * intermediates, SAM polygon caches).
 *
 * This processor's only job is to hand its baked payload back to
 * downstream consumers as a stable reference. Reference equality
 * matters — contourResample / sdfFromContour cache by upstream
 * contour identity, and the engine's `outputsEqual` diff stops
 * spurious re-renders when nothing changed.
 *
 * Hidden from the editor's "Add Node" picker — it has no manual
 * authoring UX. It only exists as a bake-target.
 */
export const constantContourDef: ProcessorDef = {
    pure: true,
    hidden: true,
    type: 'constantContour',
    title: 'Constant Contour',
    category: 'contour',
    inputs: [],
    outputs: [{ name: 'contour', type: SLOT.CONTOUR }],
    defaultParams: {
        /* Serialised ContourSamples carried inline in the processor's
           params. Format mirrors `ContourSamples` exactly except
           Float32Array fields are stored as `number[]` for JSON
           round-tripping; we rehydrate them on first execute and cache
           the typed-array packet so downstream gets a normal
           `ContourSamples` object. Empty by default — bake step
           always overwrites. */
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

    /* Cached decoded contour. Rehydrated on first execute (or whenever
       params change), reference-stable across ticks until then. */
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
