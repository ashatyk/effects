/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type ContourSamples } from '../types'
import { createSamWorker } from '../../sam/create-worker'
import type { SamPoint, SamWorkerResponse } from '../../sam/types'

type Status = 'idle' | 'loading-model' | 'encoding' | 'ready' | 'decoding' | 'error'

export const segmentationDef: ProcessorDef = {
    type: 'segmentation',
    title: 'Segmentation',
    category: 'contour',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'contour', type: SLOT.CONTOUR }],
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
    private cachedContour: ContourSamples | null = null
    private cachedPolygonRef: number[] | null = null
    /**
     * When the consumer (Tier-3 player or supplier import) set a
     * pre-computed polygon directly via {@link setPolygonOverride},
     * this flag suppresses ALL SAM lifecycle — no worker spawn,
     * no transformers.js / OpenCV / SlimSAM downloads, no
     * `extract.canvas` for the source image. The processor reduces
     * to a static "polygon → contour" function.
     *
     * This is the production path. The SAM worker exists ONLY for
     * the supplier app where the supplier interactively places
     * hint points; everywhere else the polygon should travel in
     * the published config.
     */
    private hasPolygonOverride = false

    /**
     * Set a precomputed polygon (flat `[x0, y0, x1, y1, ...]` in
     * pixel space) directly. Bypasses SAM entirely. Use from
     * Tier-3 player / config import paths.
     *
     * Subsequent `decode()` calls (supplier interactive mode)
     * will still run SAM — the override flag persists until the
     * SAM worker actually produces a fresh result, at which
     * point the override is cleared and normal interactive flow
     * resumes.
     */
    setPolygonOverride(polygon: number[]): void {
        if (!Array.isArray(polygon) || polygon.length < 6) return
        this.polygon = [...polygon]
        this.hasPolygonOverride = true
        this.cachedPolygonRef = null
        this.maskData = null
        this.status = 'ready'
        this.statusText = 'Polygon from config (no SAM)'
        this.onChange?.()
        this.engineRef?.markDirty(this.nodeId)
    }

    private initSam(): void {
        /* When a polygon override is active, the consumer (Tier-3
           player) never wants the SAM worker — bailing here keeps
           the ~150 MB ML stack out of the renderer process. The
           supplier app code path always clears the override before
           calling `decode`, so its interactive flow is unchanged. */
        if (this.hasPolygonOverride) return
        if (this.worker) return
        const worker = createSamWorker()
        this.worker = worker
        worker.onmessage = (e: MessageEvent<SamWorkerResponse>) => this.onWorkerMsg(e.data)
        worker.onerror = () => {
            this.status = 'error'
            this.statusText = 'Worker error'
            this.onChange?.()
        }
        this.status = 'loading-model'
        this.statusText = 'Loading SAM model...'
        this.onChange?.()
        worker.postMessage({ type: 'load_model' })
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
                this.maskData = { mask: msg.data.mask as unknown as number[], width: msg.data.width, height: msg.data.height }
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
        /* Interactive supplier flow takes over from any prior config-
           supplied polygon. The override is cleared so SAM init can
           proceed; once SAM produces a fresh polygon
           (`decode_result`) it lives directly in `this.polygon` and
           the override stays cleared. */
        this.hasPolygonOverride = false
        if (!this.worker) {
            /* Race-safe path: if decode is called before image was
               extracted (e.g. supplier dropped a fresh image and
               immediately added a marker), we still need the worker.
               initSam is a no-op when the worker exists or override
               is on; here neither is true so it actually spawns. */
            this.initSam()
            return
        }
        if (!this.embeddingsReady || points.length === 0) return
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

            /* SAM bypass: when the polygon was supplied by config
               (Tier-3 player path), we don't extract the image and
               we don't initialise the worker. The polygon already
               in `this.polygon` is what `buildContour` consumes. */
            if (!this.hasPolygonOverride) {
                this.initSam()

                /* The wrapper is one-shot: extract reads from the upstream
                   source then we drop the wrapper so it doesn't accumulate
                   across image changes. Source itself is owned upstream. */
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
                    .finally(() => { texture.destroy() })
            }
        } else if (src == null) {
            this.lastImageSrc = null
        }

        return { contour: this.buildContour() }
    }

    /**
     * Build a `ContourSamples` packet directly from the SAM-derived polygon
     * point list. The output is the platform-agnostic shape every downstream
     * consumer (`contourPreview`, `contourResample`, `sdfFromContour`,
     * `effect.contour`) expects, so the segmentation node now plugs straight
     * into them without an intermediate adapter. Cached by reference so we
     * don't recompute the buffers when SAM hasn't fired a new mask.
     */
    private buildContour(): ContourSamples | null {
        const poly = this.polygon
        if (poly.length < 6) {
            this.cachedContour = null
            this.cachedPolygonRef = null
            return null
        }
        if (this.cachedContour && this.cachedPolygonRef === poly) return this.cachedContour

        /* SAM emits a closed loop with the first point repeated as the last.
           Drop the duplicate so downstream consumers see a clean ring whose
           closing edge is implicit (i ↔ (i+1) % count). */
        let M = poly.length >> 1
        if (
            M >= 2 &&
            Math.abs(poly[0] - poly[(M - 1) * 2]) < 1e-6 &&
            Math.abs(poly[1] - poly[(M - 1) * 2 + 1]) < 1e-6
        ) {
            M--
        }
        if (M < 3) {
            this.cachedContour = null
            this.cachedPolygonRef = null
            return null
        }

        const positions = new Float32Array(M * 2)
        for (let i = 0; i < M; i++) {
            positions[i * 2] = poly[i * 2]
            positions[i * 2 + 1] = poly[i * 2 + 1]
        }

        const arcS = new Float32Array(M)
        let total = 0
        arcS[0] = 0
        for (let i = 1; i < M; i++) {
            const dx = positions[i * 2] - positions[(i - 1) * 2]
            const dy = positions[i * 2 + 1] - positions[(i - 1) * 2 + 1]
            total += Math.hypot(dx, dy)
            arcS[i] = total
        }
        /* Closing edge: only contributes to totalLength, not to arcS (whose
           last entry stays at the last raw vertex's distance — same convention
           as ContourResample's output). */
        {
            const dx = positions[0] - positions[(M - 1) * 2]
            const dy = positions[1] - positions[(M - 1) * 2 + 1]
            total += Math.hypot(dx, dy)
        }

        const tangents = new Float32Array(M * 2)
        for (let i = 0; i < M; i++) {
            const ip = (i - 1 + M) % M
            const inext = (i + 1) % M
            let tx = positions[inext * 2] - positions[ip * 2]
            let ty = positions[inext * 2 + 1] - positions[ip * 2 + 1]
            const len = Math.hypot(tx, ty) || 1
            tangents[i * 2] = tx / len
            tangents[i * 2 + 1] = ty / len
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let i = 0; i < M; i++) {
            const x = positions[i * 2]
            const y = positions[i * 2 + 1]
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
        }

        this.cachedContour = {
            version: 1,
            closed: true,
            count: M,
            totalLength: total,
            aabb: [minX, minY, maxX, maxY],
            positions,
            tangents,
            arcS,
        }
        this.cachedPolygonRef = poly
        return this.cachedContour
    }

    destroy(): void {
        super.destroy()
        this.worker?.terminate()
        this.worker = null
        this.onChange = null
    }
}
