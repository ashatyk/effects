/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import { buildCoordsTexture } from '../../pipeline/coords'
import type { CoordsTexture } from '../../pipeline/types'

export const polygonDef: ProcessorDef = {
    type: 'polygon',
    title: 'Polygon',
    category: 'input',
    inputs: [
        { name: 'polygon', type: SLOT.POLYGON },
    ],
    outputs: [
        { name: 'coords_tex', type: SLOT.TEXTURE },
        { name: 'aabb', type: SLOT.VEC },
        { name: 'polygon', type: SLOT.POLYGON },
        { name: 'point_count', type: SLOT.NUMBER },
        { name: 'tex_dim', type: SLOT.VEC },
    ],
    defaultParams: { width: 0, height: 0 },
}

export class PolygonProcessor extends BaseProcessor {
    readonly def = polygonDef

    private coordsResult: CoordsTexture | null = null
    private contourData: number[] = []
    private lastInputPolygon: number[] | null = null
    private dirty = true
    private building = false
    private cachedAabb: number[] = [0, 0, 0, 0]
    private cachedTexDim: number[] = [0, 0]
    private lastResW = 0
    private lastResH = 0

    setContour(data: number[], engine: IDataflowEngine): void {
        this.contourData = data
        this.lastInputPolygon = null
        this.dirty = true
        this.coordsResult = null
        engine.markDirty(this.nodeId)
    }

    private arraysEqual(a: number[], b: number[]): boolean {
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
        return true
    }

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const inputPolygon = inputs.polygon as number[] | null
        if (inputPolygon && inputPolygon.length >= 6) {
            if (!this.lastInputPolygon || !this.arraysEqual(inputPolygon, this.lastInputPolygon)) {
                this.contourData = inputPolygon
                this.lastInputPolygon = [...inputPolygon]
                this.dirty = true
                this.coordsResult = null
            }
        }

        const [w, h] = this.resolveRes(inputs, params, engine)
        if (w !== this.lastResW || h !== this.lastResH) {
            this.lastResW = w; this.lastResH = h
            this.dirty = true
            this.coordsResult = null
        }

        if ((this.dirty || !this.coordsResult) && !this.building) {
            if (this.contourData.length < 6) return this.emptyOutputs()
            this.building = true
            buildCoordsTexture({ json: this.contourData }, w, h)
                .then(result => {
                    if (result) {
                        this.coordsResult = result
                        this.dirty = false
                    }
                    this.building = false
                    engine.markDirty(this.nodeId)
                })
                .catch(() => { this.building = false })
            if (!this.coordsResult) return this.emptyOutputs()
        }

        if (!this.coordsResult) return this.emptyOutputs()

        const c = this.coordsResult
        this.cachedAabb[0] = c.minX; this.cachedAabb[1] = c.minY
        this.cachedAabb[2] = c.maxX; this.cachedAabb[3] = c.maxY
        this.cachedTexDim[0] = c.w; this.cachedTexDim[1] = c.h

        return {
            coords_tex: c.tex.source,
            aabb: this.cachedAabb,
            polygon: this.contourData,
            point_count: c.count,
            tex_dim: this.cachedTexDim,
        }
    }

    private emptyOutputs(): Record<string, any> {
        return { coords_tex: null, aabb: null, polygon: null, point_count: null, tex_dim: null }
    }
}
