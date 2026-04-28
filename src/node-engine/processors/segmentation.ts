/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import { createSamWorker } from '../../engine/sam/create-worker'
import type { SamPoint, SamWorkerResponse } from '../../engine/sam/types'

type Status = 'idle' | 'loading-model' | 'encoding' | 'ready' | 'decoding' | 'error'

export const segmentationDef: ProcessorDef = {
    type: 'segmentation',
    title: 'Segmentation',
    category: 'input',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'polygon', type: SLOT.POLYGON }],
    defaultParams: {},
}

export class SegmentationProcessor extends BaseProcessor {
    readonly def = segmentationDef

    private worker: Worker | null = null
    status: Status = 'idle'
    statusText = 'Waiting for image...'
    embeddingsReady = false
    polygon: number[] = []
    maskData: { mask: number[]; width: number; height: number } | null = null
    imageDataUrl: string | null = null
    points: SamPoint[] = []
    onChange: (() => void) | null = null

    private engineRef: IDataflowEngine | null = null
    private lastImageSrc: any = null

    private initSam(): void {
        if (this.worker) return
        this.worker = createSamWorker()
        this.worker.onmessage = (e: MessageEvent<SamWorkerResponse>) => this.onWorkerMsg(e.data)
        this.worker.onerror = () => {
            this.status = 'error'
            this.statusText = 'Worker error'
            this.onChange?.()
        }
        this.status = 'loading-model'
        this.statusText = 'Loading SAM model...'
        this.onChange?.()
        this.worker.postMessage({ type: 'load_model' })
    }

    private onWorkerMsg(msg: SamWorkerResponse): void {
        switch (msg.type) {
            case 'model_loading':
                this.statusText = msg.data.status
                break
            case 'model_ready':
                this.status = 'ready'
                this.statusText = 'Model ready, waiting for image...'
                if (this.imageDataUrl && !this.embeddingsReady) {
                    this.startEncode(this.imageDataUrl)
                }
                break
            case 'embeddings_ready':
                this.embeddingsReady = true
                this.status = 'ready'
                this.statusText = 'Ready — select points'
                if (this.points.length > 0) {
                    this.decode(this.points)
                }
                break
            case 'decode_result':
                this.status = 'ready'
                this.statusText = `Mask (score: ${msg.data.score.toFixed(2)})`
                this.polygon = msg.data.polygon
                this.maskData = { mask: msg.data.mask, width: msg.data.width, height: msg.data.height }
                this.engineRef?.markDirty(this.nodeId)
                break
            case 'error':
                this.status = 'error'
                this.statusText = msg.data.message.slice(0, 60)
                break
        }
        this.onChange?.()
    }

    private startEncode(dataUrl: string): void {
        if (!this.worker || this.status === 'loading-model') return
        this.status = 'encoding'
        this.statusText = 'Computing embeddings...'
        this.embeddingsReady = false
        this.polygon = []
        this.maskData = null
        this.onChange?.()
        this.worker.postMessage({ type: 'encode_image', data: { dataURL: dataUrl } })
    }

    decode(points: SamPoint[]): void {
        if (!this.worker || !this.embeddingsReady || points.length === 0) return
        this.status = 'decoding'
        this.statusText = 'Decoding mask...'
        this.onChange?.()
        this.worker.postMessage({ type: 'decode', data: points })
    }

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.engineRef = engine
        const src = inputs.image ?? null

        if (src !== this.lastImageSrc && src != null) {
            this.lastImageSrc = src

            this.initSam()

            const texture = new Texture({ source: src })
            const renderer = engine.app.renderer as any
            Promise.resolve()
                .then(() => renderer.extract.canvas({ target: texture }))
                .then((canvas: HTMLCanvasElement) => {
                    const dataUrl = canvas.toDataURL('image/png')
                    this.imageDataUrl = dataUrl
                    this.onChange?.()
                    if (this.status !== 'loading-model') {
                        this.startEncode(dataUrl)
                    }
                })
                .catch(() => {
                    this.statusText = 'Failed to extract image'
                    this.onChange?.()
                })
        } else if (src == null) {
            this.lastImageSrc = null
        }

        return { polygon: this.polygon.length >= 6 ? this.polygon : null }
    }

    destroy(): void {
        super.destroy()
        this.worker?.terminate()
        this.worker = null
        this.onChange = null
    }
}
