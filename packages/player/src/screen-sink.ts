/* eslint-disable @typescript-eslint/no-explicit-any */
import { Sprite, Texture } from 'pixi.js'
import type { DataflowEngine } from '@effects/runtime'

/**
 * Present the publishRoot node's `texture` directly to the Pixi Application's
 * GL backbuffer (which IS the user's canvas when `createEngine({ mountCanvas })`
 * was used). Zero pixel readback.
 *
 * Per frame: wrap the upstream TextureSource in a single reused Texture+Sprite,
 * recreated only on source identity change (resize, processor swap). On dimension
 * change, `renderer.resize(w, h)` retargets the GL backbuffer; CSS box stays
 * controlled by `objectFit: contain`. Then `renderer.render({ container: sprite })`
 * (Pixi v8 renders to backbuffer when no `target` is supplied) — one draw call,
 * one fullscreen quad blit, no allocation.
 *
 * Why this matters: legacy `streamPublishRootToCanvas` runs `extract.pixels`
 * ~30×/s — at 900×1200 RGBA8 that's ~4 MB through GL→JS heap copy plus Pixi temps
 * the JS GC can't keep up with. Tabs running multi-layer effects spike to multi-GB.
 *
 * Returned unsubscribe releases the engine subscription AND destroys the wrapper
 * Texture (NOT the upstream source — ownership stays with the upstream node).
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

        /* Cannot frame-coalesce on `src` identity: Effect's _outputRT is stable
           across ticks (ensureRT reuses) but its PIXELS are rewritten in place
           each tick. Skipping render on identity equality would freeze the frame
           on the first paint. */
        if (presentTexSrc !== src) {
            /* Source identity DID change (Effect just allocated a new RT — only
               on resolution change or initial mount). The old Texture wrapper is
               ours to release; the source itself is owned by the upstream
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
            renderer.resize(w, h)
        }

        try {
            renderer.render({ container: sprite, clear: true })
        } catch {
            /* Swallow transient render errors (typically mid-resize or after
               destroy); next tick retries. */
        }
    }

    const unsub = engine.subscribeNode(rootNodeId, present)
    /* Kick once on mount so the canvas paints immediately if the graph already
       produced a frame before subscription attached. */
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
