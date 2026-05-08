/* eslint-disable @typescript-eslint/no-explicit-any */
import { Application } from 'pixi.js'
import { DataflowEngine, type PublishedPipeline } from '@effects/runtime'

export interface CreateEngineOptions {
    pipeline: PublishedPipeline
    /** Engine tick FPS cap. `0` (default) removes the cap. */
    fps?: number
    /** When true (default) start ticking immediately. */
    autoStart?: boolean
    /** Optional caller-owned canvas to attach the Pixi GL context to.
     *  - Attached: zero pixel readback — publishRoot RT is presented via a single
     *    `renderer.render({ container: sprite })` per tick. Recommended for any
     *    production / mobile consumer.
     *  - Omitted: Pixi creates a hidden offscreen canvas; caller must use
     *    `streamPublishRootToCanvas` (legacy extract path used by the supplier
     *    preview where engine and visible canvas live in different React subtrees). */
    mountCanvas?: HTMLCanvasElement
}

export interface CreatedEngine {
    /** Pixi Application used by the engine. Canvas is offscreen by default —
     *  see `mountCanvas` option for the attached mode. */
    app: Application
    engine: DataflowEngine
    /** Idempotent. */
    destroy(): void
}

/**
 * Build a DataflowEngine from a PublishedPipeline.graph and own the Pixi
 * Application lifecycle. Framework-agnostic core; mirrors editor's
 * `usePipelineEngine.ts` and supplier's `useSupplierRuntime.ts` minus React.
 */
export async function createEngine(opts: CreateEngineOptions): Promise<CreatedEngine> {
    const attached = !!opts.mountCanvas
    const app = new Application()
    /* Init diverges between attached and offscreen modes:
        - attached: Pixi takes ownership of the user's canvas as its GL context;
          no DOM insertion needed (already mounted by consumer).
        - offscreen: Pixi creates its own canvas; we hide it and append to body
          so the GL context attaches. */
    await app.init({
        ...(attached ? { canvas: opts.mountCanvas } : {}),
        width: 16, height: 16,
        preference: 'webgl',
        preferWebGLVersion: 2,
        background: 0x000000,
        backgroundAlpha: 1,
        antialias: false,
        autoStart: false,
        /* Aggressive GPU resource GC.
            - `gcMaxUnusedTime: 1000` (1 s) — anything not touched in a second is
              freed. Default 60 s lets several MB of stale RTs pile up between
              sweeps on a 900×1200 chain at 60×/s. Active RTs (Effect's `_outputRT`
              touched on use) are never wrongly collected.
            - `gcFrequency: 1000` (1 s) sweep cadence. Combined with the 1 s idle
              window: hard ~2 s ceiling on any unused GPU resource lifetime.
           Pixi has no cap-on-count knob; idle-time eviction is the only handle.
           The extract-system leak we patch separately (`applyPixiExtractLeakPatches`)
           — that one bypasses GC accounting entirely. */
        gcActive: true,
        gcMaxUnusedTime: 1000,
        gcFrequency: 1000,
    } as any)

    if (!attached) {
        /* Offscreen Pixi canvas exists only because Pixi requires an attached
           drawing buffer for the GL context; the visible surface is whatever
           canvas the caller passes to `streamPublishRootToCanvas`. */
        const canvas = app.canvas as HTMLCanvasElement
        canvas.style.position = 'fixed'
        canvas.style.left = '-9999px'
        canvas.style.top = '-9999px'
        canvas.style.pointerEvents = 'none'
        document.body.appendChild(canvas)
    }

    app.stage.eventMode = 'none'

    const engine = new DataflowEngine(app)
    if (opts.fps != null) engine.setTargetFps(opts.fps)

    /* Defensive `cloneOf` skip even though `derivePublishedSurface` already strips
       clones — published manifests are author-controlled JSON; we'd rather no-op
       than crash if one slips through. */
    for (const n of opts.pipeline.graph.nodes) {
        if (n.data.cloneOf) continue
        engine.addNode(n.id, n.data.processor, { ...n.data.params })
    }
    engine.setEdges(opts.pipeline.graph.edges)

    if (opts.autoStart !== false) engine.start()

    let destroyed = false
    return {
        app,
        engine,
        destroy() {
            if (destroyed) return
            destroyed = true
            engine.destroy()
            try {
                /* When attached, `app.destroy(true, ...)` would destroy the user's
                   canvas — that's not ours to delete. Pass `false` so Pixi only
                   releases its internal resources; consumer's React tree controls
                   the canvas lifetime. */
                app.destroy(attached ? false : true, { children: true })
            } catch { /* */ }
            if (!attached) {
                ;(app.canvas as HTMLCanvasElement | undefined)?.remove()
            }
        },
    }
}
