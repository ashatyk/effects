/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture, TextureSource } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import { b64ToTextureSource } from './marigold-common'

type MaskStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'

export const textRemovalMaskDef: ProcessorDef = {
    type: 'textRemovalMask',
    title: 'Text OBB Mask',
    category: 'ai',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'mask', type: SLOT.TEXTURE }],
    defaultParams: {
        threshold: 0.35,
        dilate: 2,
        blur: 1,
        min_area: 32,
        box_padding: 0.08,
    },
    hidden: true,
}

export class TextRemovalMaskProcessor extends BaseProcessor {
    readonly def = textRemovalMaskDef

    private engineRef: IDataflowEngine | null = null
    private lastImageSrc: any = null
    private lastParamsKey = ''
    private busy = false
    private maskSrc: TextureSource | null = null

    status: MaskStatus = 'idle'
    statusText = 'Waiting for image...'
    onChange: (() => void) | null = null

    private paramsKey(params: Record<string, any>): string {
        const threshold = Number(params.threshold ?? 0.22)
        const dilate = Number(params.dilate ?? 2)
        const blur = Number(params.blur ?? 1)
        const minArea = Number(params.min_area ?? 32)
        const boxPadding = Number(params.box_padding ?? 0.08)
        return `${threshold}|${dilate}|${blur}|${minArea}|${boxPadding}`
    }

    private async sourceToDataUrl(src: any, engine: IDataflowEngine): Promise<string> {
        const texture = new Texture({ source: src })
        const renderer = engine.app.renderer as any
        const canvas = await renderer.extract.canvas({ target: texture })
        return canvas.toDataURL('image/png')
    }

    private async runRequest(imageDataUrl: string, params: Record<string, any>): Promise<void> {
        if (this.busy) return
        this.busy = true

        try {
            this.status = 'uploading'
            this.statusText = 'Sending image...'
            this.onChange?.()

            const blob = await (await fetch(imageDataUrl)).blob()
            const form = new FormData()
            form.append('image', blob, 'input.png')
            form.append('threshold', String(Number(params.threshold ?? 0.22)))
            form.append('dilate', String(Math.max(0, Math.round(Number(params.dilate ?? 2)))))
            form.append('blur', String(Math.max(0, Math.round(Number(params.blur ?? 1)))))
            form.append('min_area', String(Math.max(1, Math.round(Number(params.min_area ?? 32)))))
            form.append('box_padding', String(Math.max(0.0, Math.min(0.5, Number(params.box_padding ?? 0.08)))))

            this.status = 'processing'
            this.statusText = 'Detecting text OBB rectangles...'
            this.onChange?.()

            const resp = await fetch('/api/text/mask', { method: 'POST', body: form })
            if (!resp.ok) {
                const text = await resp.text()
                throw new Error(`Server ${resp.status}: ${text.slice(0, 100)}`)
            }

            const json = await resp.json()
            this.maskSrc = await b64ToTextureSource(json.mask)
            this.status = 'ready'
            this.statusText = `Mask ${this.maskSrc.width}x${this.maskSrc.height}`
            this.engineRef?.markDirty(this.nodeId)
        } catch (err: any) {
            this.status = 'error'
            this.statusText = (err?.message ?? 'Error').slice(0, 100)
        } finally {
            this.busy = false
            this.onChange?.()
        }
    }

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.engineRef = engine
        const src = inputs.image ?? null
        const key = this.paramsKey(params)
        const shouldRun = src != null && (src !== this.lastImageSrc || key !== this.lastParamsKey)

        if (shouldRun) {
            this.lastImageSrc = src
            this.lastParamsKey = key
            this.sourceToDataUrl(src, engine)
                .then((dataUrl) => this.runRequest(dataUrl, params))
                .catch(() => {
                    this.status = 'error'
                    this.statusText = 'Failed to extract image'
                    this.onChange?.()
                })
        } else if (src == null) {
            this.lastImageSrc = null
            this.lastParamsKey = ''
            this.maskSrc = null
            this.status = 'idle'
            this.statusText = 'Waiting for image...'
        }

        return { mask: this.maskSrc }
    }

    destroy(): void {
        super.destroy()
        this.onChange = null
    }
}
