/* eslint-disable @typescript-eslint/no-explicit-any */
import { RenderTexture } from 'pixi.js'
import type { ProcessorDef, IDataflowEngine } from '../types'

export abstract class BaseProcessor {
    abstract readonly def: ProcessorDef
    nodeId = ''
    alwaysDirty = false

    protected _outputRT: RenderTexture | null = null
    private _rtPing: RenderTexture | null = null
    private _rtPong: RenderTexture | null = null

    abstract execute(
        inputs: Record<string, any>,
        params: Record<string, any>,
        engine: IDataflowEngine,
    ): Record<string, any>

    /** Get a value from connected input, else from params widget, else fallback. */
    protected val(inputs: Record<string, any>, params: Record<string, any>, key: string, fallback?: number): number {
        if (inputs[key] != null) return inputs[key] as number
        if (params[key] != null) return params[key] as number
        return fallback ?? 0
    }

    /**
     * Resolve rendering resolution.
     * Priority order (most specific first):
     *   1. explicit `width`/`height` NUMBER inputs (or params)
     *   2. dimensions of the `source` input (background image — the canvas of the effect)
     *   3. dimensions of `sdf` / `coords_tex` inputs (size of the segmentation field)
     *   4. dimensions of any other texture-like input (last resort)
     *   5. engine defaults
     *
     * This avoids accidentally adopting the size of a small auxiliary texture
     * (e.g. a 512×512 glyph atlas) as the canvas resolution.
     */
    protected resolveRes(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): [number, number] {
        const w = this.val(inputs, params, 'width', 0)
        const h = this.val(inputs, params, 'height', 0)
        if (w > 0 && h > 0) return [w, h]

        for (const key of ['source', 'sdf', 'coords_tex']) {
            const v = inputs[key]
            if (v && typeof v === 'object' && (v as any).width > 0 && (v as any).height > 0) {
                return [(v as any).width, (v as any).height]
            }
        }

        for (const v of Object.values(inputs)) {
            if (v && typeof v === 'object' && 'width' in v && (v as any).width > 0 && (v as any).height > 0) {
                return [(v as any).width, (v as any).height]
            }
        }
        return [engine.defaultWidth, engine.defaultHeight]
    }

    protected ensureRT(w: number, h: number): RenderTexture {
        if (this._outputRT && this._outputRT.width === w && this._outputRT.height === h) {
            return this._outputRT
        }
        this._outputRT?.destroy()
        this._outputRT = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._outputRT
    }

    protected ensurePing(w: number, h: number): RenderTexture {
        if (this._rtPing && this._rtPing.width === w && this._rtPing.height === h) return this._rtPing
        this._rtPing?.destroy()
        this._rtPing = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._rtPing
    }

    protected ensurePong(w: number, h: number): RenderTexture {
        if (this._rtPong && this._rtPong.width === w && this._rtPong.height === h) return this._rtPong
        this._rtPong?.destroy()
        this._rtPong = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._rtPong
    }

    destroy(): void {
        this._outputRT?.destroy()
        this._outputRT = null
        this._rtPing?.destroy()
        this._rtPing = null
        this._rtPong?.destroy()
        this._rtPong = null
    }
}
