/* eslint-disable @typescript-eslint/no-explicit-any */
import { Texture } from 'pixi.js'
import type { DataflowEngine } from '@effects/runtime'

const THROTTLE_MS = 33

/**
 * Stream the `publishRoot` node's `texture` output into a Canvas2D.
 *
 * Mirrors the pattern in `runtime/processors/preview.ts` — wrap the
 * upstream `TextureSource` in a single reused `Texture` and run
 * `renderer.extract.pixels` periodically. We pull the canvas size
 * from the extracted pixel buffer so the sink works regardless of
 * which effect is upstream (effects publish at their declared canvas
 * size; the consumer doesn't need to know it ahead of time).
 *
 * Throttle is fixed at 33 ms (~30 FPS extract). The engine itself
 * may tick faster — see `DataflowEngine.setTargetFps()` — but readback
 * to user canvas is the most expensive step, so capping it here keeps
 * the player's main-thread work bounded even on weak hardware.
 *
 * Returns an unsubscribe function that releases the engine
 * subscription AND destroys the wrapper texture (NOT the upstream
 * source — ownership stays with the upstream node).
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
            /* swallow extract errors — they typically mean the
               upstream texture is mid-resize / mid-init. Next tick
               will retry. */
        } finally {
            extracting = false
        }
    }

    const unsub = engine.subscribeNode(rootNodeId, () => { void draw() })
    /* Kick once on mount so the canvas paints immediately if the
       graph already produced a frame before the subscription
       attached. */
    void draw()
    return () => {
        unsub()
        extractTex?.destroy()
        extractTex = null
        extractTexSrc = null
    }
}
