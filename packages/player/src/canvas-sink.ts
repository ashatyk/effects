/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import type { DataflowEngine } from '@effects/runtime'

const THROTTLE_MS = 33

/**
 * Stream the publishRoot node's `texture` into a Canvas2D via `extract.pixels`.
 * Mirrors `runtime/processors/preview.ts` — wrap upstream TextureSource in a
 * single reused Texture; pull canvas size from extracted buffer so the sink
 * works regardless of which effect is upstream.
 *
 * Throttle fixed at 33 ms (~30 FPS extract): the engine itself may tick faster
 * (`setTargetFps`), but readback is the most expensive step, so capping here
 * keeps main-thread work bounded on weak hardware.
 *
 * Returned unsubscribe releases the engine subscription AND destroys the wrapper
 * texture (NOT the upstream source — ownership stays with the upstream node).
 */
export function streamPublishRootToCanvas(
    engine: DataflowEngine,
    rootNodeId: string,
    canvas: HTMLCanvasElement,
): () => void {
    let extractTex: Texture | null = null
    let extractTexSrc: any = null
    let extracting = false
    let lastExtractTime = 0

    const draw = async () => {
        if (extracting) return
        const outputs = engine.getOutputs(rootNodeId)
        const src: any = outputs?.texture
        if (!src) return
        const now = performance.now()
        if (now - lastExtractTime < THROTTLE_MS) return
        lastExtractTime = now
        extracting = true
        try {
            if (!extractTex || extractTexSrc !== src) {
                extractTex?.destroy()
                extractTex = new Texture({ source: src })
                extractTexSrc = src
            }
            const renderer: any = engine.app.renderer
            const result = await renderer.extract.pixels({ target: extractTex })
            const w: number = result.width
            const h: number = result.height
            const data: Uint8ClampedArray = result.pixels
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
            }
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.clearRect(0, 0, w, h)
            ctx.putImageData(new ImageData(data as unknown as ImageDataArray, w, h), 0, 0)
        } catch {
            /* Swallow extract errors — typically mean upstream texture is
               mid-resize / mid-init. Next tick retries. */
        } finally {
            extracting = false
        }
    }

    const unsub = engine.subscribeNode(rootNodeId, () => { void draw() })
    /* Kick once on mount so the canvas paints immediately if the graph already
       produced a frame before subscription attached. */
    void draw()
    return () => {
        unsub()
        extractTex?.destroy()
        extractTex = null
        extractTexSrc = null
    }
}
