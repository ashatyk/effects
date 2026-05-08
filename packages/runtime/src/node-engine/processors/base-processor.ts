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

    protected val(inputs: Record<string, any>, params: Record<string, any>, key: string, fallback?: number): number {
        if (inputs[key] != null) return inputs[key] as number
        if (params[key] != null) return params[key] as number
        return fallback ?? 0
    }

    // Priority: explicit width/height → source → sdf → any texture-like input → engine defaults.
    // Order avoids adopting auxiliary textures (e.g. glyph atlas) as the canvas resolution.
    protected resolveRes(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): [number, number] {
        const w = this.val(inputs, params, 'width', 0)
        const h = this.val(inputs, params, 'height', 0)
        if (w > 0 && h > 0) return [w, h]

        for (const key of ['source', 'sdf']) {
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

    // destroy(true) is mandatory: Pixi v8 defaults destroyTextureSource:false and would leak
    // the GPU TextureSource on every resize. Keep ensureRT/ensurePing/ensurePong/destroy in lockstep.
    protected ensureRT(w: number, h: number): RenderTexture {
        if (this._outputRT && this._outputRT.width === w && this._outputRT.height === h) {
            return this._outputRT
        }
        this._outputRT?.destroy(true)
        this._outputRT = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._outputRT
    }

    protected ensurePing(w: number, h: number): RenderTexture {
        if (this._rtPing && this._rtPing.width === w && this._rtPing.height === h) return this._rtPing
        this._rtPing?.destroy(true)
        this._rtPing = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._rtPing
    }

    protected ensurePong(w: number, h: number): RenderTexture {
        if (this._rtPong && this._rtPong.width === w && this._rtPong.height === h) return this._rtPong
        this._rtPong?.destroy(true)
        this._rtPong = RenderTexture.create({ width: w, height: h, scaleMode: 'linear' })
        return this._rtPong
    }

    destroy(): void {
        this._outputRT?.destroy(true)
        this._outputRT = null
        this._rtPing?.destroy(true)
        this._rtPing = null
        this._rtPong?.destroy(true)
        this._rtPong = null
    }
}
