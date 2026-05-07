/* eslint-disable @typescript-eslint/no-explicit-any */
import { Sprite, Texture } from 'pixi.js'
import type { DataflowEngine } from '@effects/runtime'

/**
 * Present the `publishRoot` node's `texture` output directly to the
 * Pixi `Application`'s GL backbuffer (which **is** the user's
 * visible `<canvas>` when the engine was created via
 * `createEngine({ mountCanvas })`).
 *
 * **Zero pixel readback.** Unlike `streamPublishRootToCanvas` (the
 * legacy extract path), this sink never copies pixels from the GPU
 * to a JS-side ImageData. Each frame:
 *  1. Wrap the upstream `TextureSource` in a single reused `Texture`
 *     and a single reused `Sprite`. Both are recreated only when
 *     the upstream source identity changes (resize, processor swap).
 *  2. If the source dimensions changed, call `renderer.resize(w, h)`
 *     to retarget the GL backbuffer to the new size. The CSS box of
 *     the user canvas stays controlled by `objectFit: contain`, so
 *     the visible aspect ratio adapts automatically.
 *  3. `renderer.render({ container: sprite })` — Pixi v8 renders to
 *     the backbuffer when no `target` is supplied. One draw call,
 *     one fullscreen quad blit, no allocation.
 *
 * Why this matters: the legacy `streamPublishRootToCanvas` runs
 * `renderer.extract.pixels` ~30×/s. At 900×1200 RGBA8 each extract
 * shuttles ~4 MB through the GL→JS heap copy, plus Pixi's internal
 * temp resources that the JS GC can't keep up with. Tabs running
 * a multi-layer effect for a few minutes spike to multi-GB memory.
 * Direct presentation eliminates the entire copy loop.
 *
 * Returns an unsubscribe function that releases the engine
 * subscription AND destroys the wrapper `Texture` (NOT the upstream
 * source — ownership stays with the upstream node).
 */
export function streamPublishRootToScreen(
    engine: DataflowEngine,
    rootNodeId: string,
): () => void {
    let presentTex: Texture | null = null
    let presentTexSrc: any = null
    let sprite: Sprite | null = null

    const present = () => {
        const outputs = engine.getOutputs(rootNodeId)
        const src: any = outputs?.texture
        if (!src) return
        const renderer: any = engine.app.renderer
        if (!renderer) return

        /* Cannot frame-coalesce on `src` identity: Effect's _outputRT
           is stable across ticks (ensureRT reuses) but its PIXELS are
           rewritten in place each tick. Skipping render on identity
           equality would freeze the frame on the first paint. */
        if (presentTexSrc !== src) {
            /* Source identity DID change (Effect just allocated a new
               RT — only happens on resolution changes or initial
               mount). The old `presentTex` Texture wrapper is ours
               to release; the source itself is owned by the upstream
               processor and must NOT be destroyed (engine reuses it). */
            sprite?.destroy({ children: false, texture: false, textureSource: false })
            presentTex?.destroy(false)
            presentTex = new Texture({ source: src })
            presentTexSrc = src
            sprite = new Sprite(presentTex)
        }

        const w: number = src.width
        const h: number = src.height
        const canvas = engine.app.canvas as HTMLCanvasElement | undefined
        if (canvas && (canvas.width !== w || canvas.height !== h)) {
            /* Resize the GL backbuffer to match the publishRoot frame.
               CSS sizing (`objectFit: contain` on the canvas element)
               adapts the visible box independently. */
            renderer.resize(w, h)
        }

        try {
            renderer.render({ container: sprite, clear: true })
        } catch {
            /* Swallow transient render errors (typically mid-resize
               or after destroy); next tick retries. */
        }
    }

    const unsub = engine.subscribeNode(rootNodeId, present)
    /* Kick once on mount so the canvas paints immediately if the
       graph already produced a frame before the subscription
       attached. */
    present()

    return () => {
        unsub()
        sprite?.destroy({ children: false, texture: false, textureSource: false })
        presentTex?.destroy()
        sprite = null
        presentTex = null
        presentTexSrc = null
    }
}
