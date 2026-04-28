/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const previewDef: ProcessorDef = {
    type: 'preview',
    title: 'Preview',
    category: 'output',
    inputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {},
}

export class PreviewProcessor extends BaseProcessor {
    readonly def = previewDef

    imgCanvas: HTMLCanvasElement | null = null
    private extracting = false
    private lastExtractTime = 0
    private static THROTTLE_MS = 33

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) {
            this.imgCanvas = null
            return { texture: null, _canvas: null }
        }

        /* The texture must ALWAYS pass through downstream regardless of whether
           we extract pixels this tick — otherwise a Preview placed mid-graph
           silently drops data on every throttled tick. */
        const passthrough = { texture: src, _canvas: this.imgCanvas }

        if (this.extracting) return passthrough

        const now = performance.now()
        if (this.imgCanvas && now - this.lastExtractTime < PreviewProcessor.THROTTLE_MS) {
            return passthrough
        }

        this.lastExtractTime = now
        this.extracting = true
        const texture = new Texture({ source: src })
        const renderer = engine.app.renderer as any

        Promise.resolve()
            .then(() => renderer.extract.pixels({ target: texture }))
            .then((result: any) => {
                const w: number = result.width
                const h: number = result.height
                const data: Uint8ClampedArray = result.pixels

                if (!this.imgCanvas) this.imgCanvas = document.createElement('canvas')
                this.imgCanvas.width = w
                this.imgCanvas.height = h

                const ctx = this.imgCanvas.getContext('2d')!
                const pixels = new Uint8ClampedArray(data.buffer)
                for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
                ctx.putImageData(new ImageData(pixels as unknown as ImageDataArray, w, h), 0, 0)
                engine.markDirty(this.nodeId)
            })
            .catch(() => {})
            .finally(() => { this.extracting = false })

        return passthrough
    }

    destroy(): void {
        super.destroy()
        this.imgCanvas = null
    }
}
