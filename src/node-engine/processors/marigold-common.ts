/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture, TextureSource } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import type { IDataflowEngine } from '../types'

export async function b64ToTextureSource(b64: string): Promise<TextureSource> {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    return Texture.from(img).source
}

export type MarigoldStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'

export abstract class MarigoldProcessor extends BaseProcessor {
    protected engineRef: IDataflowEngine | null = null
    protected lastImageSrc: any = null
    protected busy = false

    status: MarigoldStatus = 'idle'
    statusText = 'Waiting for image...'
    onChange: (() => void) | null = null

    protected abstract endpoint: string
    protected abstract handleResult(json: any): Promise<void>

    protected async runRequest(dataUrl: string): Promise<void> {
        if (this.busy) return
        this.busy = true

        try {
            this.status = 'uploading'
            this.statusText = 'Sending to Marigold backend...'
            this.onChange?.()

            const blob = await (await fetch(dataUrl)).blob()
            const form = new FormData()
            form.append('image', blob, 'input.jpg')

            this.status = 'processing'
            this.statusText = 'Running Marigold (may take 10-30s on first run)...'
            this.onChange?.()

            const resp = await fetch(this.endpoint, { method: 'POST', body: form })

            if (!resp.ok) {
                const text = await resp.text()
                throw new Error(`Server ${resp.status}: ${text.slice(0, 100)}`)
            }

            const json = await resp.json()
            await this.handleResult(json)

            this.status = 'ready'
            this.engineRef?.markDirty(this.nodeId)
        } catch (err: any) {
            this.status = 'error'
            this.statusText = (err?.message ?? 'Error').slice(0, 100)
        } finally {
            this.busy = false
            this.onChange?.()
        }
    }

    protected triggerFromInput(inputs: Record<string, any>, engine: IDataflowEngine): void {
        this.engineRef = engine
        const src = inputs.image ?? null

        if (src !== this.lastImageSrc && src != null) {
            this.lastImageSrc = src

            /* One-shot wrapper for extract; dropped in the `finally` so
               we don't leak one Texture per image change. */
            const texture = new Texture({ source: src })
            const renderer = engine.app.renderer as any
            Promise.resolve()
                .then(() => renderer.extract.canvas({ target: texture }))
                .then((canvas: HTMLCanvasElement) => {
                    // Preserve thin edges/text details for Marigold input.
                    this.runRequest(canvas.toDataURL('image/png'))
                })
                .catch(() => {
                    this.statusText = 'Failed to extract image'
                    this.status = 'error'
                    this.onChange?.()
                })
                .finally(() => { texture.destroy() })
        } else if (src == null) {
            this.lastImageSrc = null
        }
    }

    destroy(): void {
        super.destroy()
        this.onChange = null
    }
}
