/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type ContourSamples } from '../types'
import SdfFragment from '../../pipeline/passes/sdf-pure'
import { buildCoordsTextureFromContour } from '../../pipeline/coords'
import type { CoordsTexture } from '../../pipeline/types'

export const sdfDef: ProcessorDef = {
    type: 'sdf',
    title: 'SDF',
    category: 'imageOp',
    inputs: [
        { name: 'coords_tex', type: SLOT.TEXTURE },
        { name: 'point_count', type: SLOT.NUMBER },
        { name: 'tex_dim', type: SLOT.VEC },
        { name: 'contour', type: SLOT.CONTOUR, label: 'contour' },
    ],
    outputs: [{ name: 'sdf', type: SLOT.TEXTURE }],
    defaultParams: { width: 0, height: 0 },
    /* Hidden from the picker: superseded by SdfFromContour for the contour
       workflow and by Polygon → coords path for the legacy polygon workflow. */
    hidden: true,
}

export class SDFProcessor extends BaseProcessor {
    readonly def = sdfDef

    /* Cache for the contour-derived coords texture: rebuild only when the
       contour reference changes or the canvas size changes. */
    private cachedContour: ContourSamples | null = null
    private cachedW = 0
    private cachedH = 0
    private cachedCoords: CoordsTexture | null = null
    private cachedTexDim = [0, 0]

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const [w, h] = this.resolveRes(inputs, params, engine)

        const contour = inputs.contour as ContourSamples | null
        let coordsSrc: any = null
        let pointCount = 0
        let texDim: number[] | null = null

        if (contour && contour.count >= 3) {
            if (
                this.cachedContour !== contour ||
                this.cachedW !== w ||
                this.cachedH !== h ||
                !this.cachedCoords
            ) {
                this.cachedCoords?.tex.destroy(true)
                this.cachedCoords = buildCoordsTextureFromContour(contour, w, h) ?? null
                this.cachedContour = contour
                this.cachedW = w
                this.cachedH = h
                if (this.cachedCoords) {
                    this.cachedTexDim = [this.cachedCoords.w, this.cachedCoords.h]
                }
            }
            if (this.cachedCoords) {
                coordsSrc = this.cachedCoords.tex.source
                pointCount = this.cachedCoords.count
                texDim = this.cachedTexDim
            }
        } else {
            /* Fall back to upstream Polygon-derived coords texture. */
            coordsSrc = inputs.coords_tex
            pointCount = inputs.point_count as number
            texDim = inputs.tex_dim as number[] | null
            /* Drop the cached contour-coords if the contour was disconnected. */
            if (this.cachedCoords) {
                this.cachedCoords.tex.destroy(true)
                this.cachedCoords = null
                this.cachedContour = null
            }
        }

        if (!coordsSrc || !pointCount || !texDim) return { sdf: null }

        const rt = this.ensureRT(w, h)
        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uPointTexelCount: { value: pointCount, type: 'i32' },
            uPointTextureDim: { value: texDim, type: 'vec2<f32>' },
        } as any, { isStatic: true })

        engine.renderPassInto(rt, SdfFragment, { uniforms, uPointTexture: coordsSrc })
        return { sdf: rt.source }
    }

    destroy(): void {
        this.cachedCoords?.tex.destroy(true)
        this.cachedCoords = null
        this.cachedContour = null
        super.destroy()
    }
}
