/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type DepthRawData } from '../types'
import { createDepthWorker } from '../../engine/depth/create-worker'

export const depthEstimateDef: ProcessorDef = {
    type: 'depthEstimate',
    title: 'Depth Estimate',
    category: 'depth',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'depth_raw', type: SLOT.DEPTH_RAW }],
    defaultParams: {},
}

export class DepthEstimateProcessor extends BaseProcessor {
    readonly def = depthEstimateDef

    private worker: Worker | null = null
    private depthData: DepthRawData | null = null
    private engineRef: IDataflowEngine | null = null
    private lastImageSrc: any = null
    private modelReady = false

    status: 'idle' | 'loading-model' | 'estimating' | 'ready' | 'error' = 'idle'
    statusText = 'Waiting for image...'
    onChange: (() => void) | null = null

    private initWorker(): void {
        if (this.worker) return
        this.worker = createDepthWorker()
        this.worker.onmessage = (e: MessageEvent) => this.onMsg(e.data)
        this.worker.onerror = () => {
            this.status = 'error'
            this.statusText = 'Worker error'
            this.onChange?.()
        }
        this.status = 'loading-model'
        this.statusText = 'Loading depth model...'
        this.onChange?.()
    }

    private onMsg(msg: any): void {
        switch (msg.type) {
            case 'progress':
                this.statusText = msg.data.status
                if (!this.modelReady) {
                    this.status = 'loading-model'
                }
                break
            case 'depth_result': {
                const { depth, width, height } = msg.data
                this.depthData = { data: new Uint8Array(depth), width, height }
                this.modelReady = true
                this.status = 'ready'
                this.statusText = `Depth ${width}×${height}`
                this.engineRef?.markDirty(this.nodeId)
                break
            }
            case 'error':
                this.modelReady = true
                this.status = 'error'
                this.statusText = (msg.data?.message ?? 'Error').slice(0, 60)
                break
        }
        this.onChange?.()
    }

    private startEstimate(dataUrl: string): void {
        if (!this.worker) return
        this.status = 'estimating'
        this.statusText = 'Estimating depth...'
        this.depthData = null
        this.onChange?.()
        this.worker.postMessage({ type: 'estimate', data: { dataURL: dataUrl } })
    }

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.engineRef = engine
        const src = inputs.image ?? null

        if (src !== this.lastImageSrc && src != null) {
            this.lastImageSrc = src
            this.initWorker()

            const texture = new Texture({ source: src })
            const renderer = engine.app.renderer as any
            Promise.resolve()
                .then(() => renderer.extract.canvas({ target: texture }))
                .then((canvas: HTMLCanvasElement) => {
                    this.startEstimate(canvas.toDataURL('image/png'))
                })
                .catch(() => {
                    this.statusText = 'Failed to extract image'
                    this.onChange?.()
                })
        } else if (src == null) {
            this.lastImageSrc = null
        }

        return { depth_raw: this.depthData }
    }

    destroy(): void {
        super.destroy()
        this.worker?.terminate()
        this.worker = null
        this.onChange = null
    }
}
