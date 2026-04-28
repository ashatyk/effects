/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture, TextureSource } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import { b64ToTextureSource } from './marigold-common'

type QwenStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'

export const AVAILABLE_MODELS = [
    'qwen-image-edit',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview'
] as const

export const qwenImageEditDef: ProcessorDef = {
    type: 'qwenImageEdit',
    title: 'AI Image Edit',
    category: 'ai',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {
        model: 'qwen-image-edit' as string,
        prompt: 'Remove all text, letters, logos, and typography from this image, keep everything else unchanged',
        negative_prompt: 'text, letters, watermark, logo, typography, symbols, glyphs',
        seed: -1,
    },
    hidden: true,
}

export class QwenImageEditProcessor extends BaseProcessor {
    readonly def = qwenImageEditDef

    private engineRef: IDataflowEngine | null = null
    private lastImageSrc: any = null
    private lastParamsKey = ''
    private busy = false
    private outSrc: TextureSource | null = null

    status: QwenStatus = 'idle'
    statusText = 'Waiting for image...'
    onChange: (() => void) | null = null

    private paramsKey(params: Record<string, any>): string {
        const model = String(params.model ?? 'qwen-image-edit')
        const prompt = String(params.prompt ?? '')
        const negativePrompt = String(params.negative_prompt ?? '')
        const seed = Math.round(Number(params.seed ?? -1))
        return `${model}|${prompt}|${negativePrompt}|${seed}`
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
            this.statusText = 'Sending to Qwen API...'
            this.onChange?.()

            const blob = await (await fetch(imageDataUrl)).blob()
            const model = String(params.model ?? 'qwen-image-edit')
            const form = new FormData()
            form.append('image', blob, 'image.png')
            form.append('model', model)
            form.append('prompt', String(params.prompt ?? qwenImageEditDef.defaultParams.prompt))
            form.append('negative_prompt', String(params.negative_prompt ?? qwenImageEditDef.defaultParams.negative_prompt))
            form.append('seed', String(Math.round(Number(params.seed ?? -1))))

            this.status = 'processing'
            this.statusText = `${model} processing...`
            this.onChange?.()

            const resp = await fetch('/api/qwen/edit', { method: 'POST', body: form })
            if (!resp.ok) {
                const text = await resp.text()
                throw new Error(`Server ${resp.status}: ${text.slice(0, 120)}`)
            }
            const json = await resp.json()
            if (json.error) throw new Error(json.error)

            this.outSrc = await b64ToTextureSource(json.image)
            this.status = 'ready'
            this.statusText = `Done ${this.outSrc.width}x${this.outSrc.height}`
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
            this.outSrc = null
            this.status = 'idle'
            this.statusText = 'Waiting for image...'
        }

        return { texture: this.outSrc }
    }

    destroy(): void {
        super.destroy()
        this.onChange = null
    }
}
