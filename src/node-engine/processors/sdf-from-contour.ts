/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type ContourSamples } from '../types'
import SdfFragment from '../../pipeline/passes/sdf-pure'
import { buildCoordsTextureFromContour } from '../../pipeline/coords'
import type { CoordsTexture } from '../../pipeline/types'

/**
 * Renders an SDF map directly from a {@link ContourSamples} input — i.e. the
 * smoothed/offset contour produced by ContourResample. Unlike the generic
 * `SDF` node (which has a dual polygon/contour mode), this one has a single,
 * explicit contract: contour in → distance field out.
 *
 * The output texture stores the unsigned distance to the contour, packed in
 * RGB (24-bit fixed point, normalized by max(W,H)) with `inside`-flag in A,
 * exactly like the original SDF processor — so the same fragment shaders
 * (e.g. WavePingPong, glow effects) consume it transparently.
 */
export const sdfFromContourDef: ProcessorDef = {
    type: 'sdfFromContour',
    title: 'SDF from Contour',
    category: 'imageOp',
    inputs: [
        { name: 'contour', type: SLOT.CONTOUR, label: 'contour' },
    ],
    outputs: [{ name: 'sdf', type: SLOT.TEXTURE }],
    defaultParams: { width: 0, height: 0 },
}

export class SdfFromContourProcessor extends BaseProcessor {
    readonly def = sdfFromContourDef

    private cachedContour: ContourSamples | null = null
    private cachedW = 0
    private cachedH = 0
    private cachedCoords: CoordsTexture | null = null
    private cachedTexDim: [number, number] = [0, 0]

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const contour = inputs.contour as ContourSamples | null
        if (!contour || contour.count < 3) {
            this.releaseCoords()
            return { sdf: null }
        }

        const [w, h] = this.resolveRes(inputs, params, engine)

        if (
            this.cachedContour !== contour ||
            this.cachedW !== w ||
            this.cachedH !== h ||
            !this.cachedCoords
        ) {
            this.releaseCoords()
            const built = buildCoordsTextureFromContour(contour, w, h)
            if (!built) return { sdf: null }
            this.cachedCoords = built
            this.cachedContour = contour
            this.cachedW = w
            this.cachedH = h
            this.cachedTexDim = [built.w, built.h]
        }

        const rt = this.ensureRT(w, h)
        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uPointTexelCount: { value: this.cachedCoords.count, type: 'i32' },
            uPointTextureDim: { value: this.cachedTexDim, type: 'vec2<f32>' },
        } as any, { isStatic: true })

        engine.renderPassInto(rt, SdfFragment, {
            uniforms,
            uPointTexture: this.cachedCoords.tex.source,
        })
        return { sdf: rt.source }
    }

    private releaseCoords(): void {
        this.cachedCoords?.tex.destroy(true)
        this.cachedCoords = null
        this.cachedContour = null
        this.cachedW = 0
        this.cachedH = 0
    }

    destroy(): void {
        this.releaseCoords()
        super.destroy()
    }
}
