/* eslint-disable @typescript-eslint/no-explicit-any */
import { Application } from 'pixi.js'
import { DataflowEngine, type PublishedPipeline } from '@effects/runtime'

export interface CreateEngineOptions {
    /** The published manifest whose `graph` populates the engine. */
    pipeline: PublishedPipeline
    /** Cap on graph re-evaluation rate (frames per second). `0` (default)
     *  removes the cap. Lower values reduce CPU/GPU work proportionally
     *  — useful for weak hardware or when the player is offscreen. */
    fps?: number
    /** When true (default) the engine starts ticking immediately. */
    autoStart?: boolean
    /** Optional caller-owned `<canvas>` to attach the Pixi GL context to.
     *
     *  When provided:
     *  - Pixi renders directly into this canvas's GL backbuffer.
     *  - The publishRoot RT is presented to screen via a single
     *    `renderer.render({ container: sprite, target: undefined })`
     *    call per tick (see `streamPublishRootToScreen`).
     *  - **Zero pixel readback / extract** — eliminates the 4 MB×30 FPS
     *    GPU-to-JS-heap copy loop that the offscreen + Canvas2D-extract
     *    pattern bleeds. This is the recommended mount mode for any
     *    production / mobile consumer.
     *
     *  When omitted:
     *  - Pixi creates its own hidden offscreen canvas (`position: fixed;
     *    left: -9999px`).
     *  - Caller must use `streamPublishRootToCanvas` to copy the
     *    publishRoot output into a separate visible Canvas2D via
     *    `renderer.extract.pixels` — the legacy path used by the
     *    supplier app's preview (where the engine and the visible
     *    canvas live in different React subtrees and lifting the
     *    canvas up to engine init is impractical).
     *
     *  `EffectPlayer.create({ canvas })` always uses the attached mode. */
    mountCanvas?: HTMLCanvasElement
}

export interface CreatedEngine {
    /** Pixi `Application` used by the engine for shader compilation
     *  and render-target allocation. The canvas is offscreen by
     *  default — the player streams `publishRoot` into the user's
     *  visible canvas via {@link streamPublishRootToCanvas}. */
    app: Application
    /** Live engine. Public so consumers can call `getProcessor()`,
     *  `subscribeNode()`, `setTargetFps()`, etc. directly. */
    engine: DataflowEngine
    /** Tear down both the engine and the Pixi app. Idempotent. */
    destroy(): void
}

/**
 * Build a `DataflowEngine` from a `PublishedPipeline.graph` and own
 * the Pixi `Application` lifecycle.
 *
 * This is the framework-agnostic core of the Tier-3 web runtime —
 * mirrors editor's `usePipelineEngine.ts` and supplier's
 * `useSupplierRuntime.ts` minus all React / Dexie / form code. Both
 * the editor and the supplier app could in principle migrate to call
 * this helper too; for now they keep their own React hooks because
 * they need to interleave with extra concerns (Dexie restore in
 * editor, form state in supplier).
 *
 * The returned `app.canvas` is hidden offscreen (`position: fixed,
 * left: -9999px`) — the consumer is expected to mount their own
 * visible canvas and stream into it via {@link streamPublishRootToCanvas}.
 * That separation lets the same engine drive multiple display
 * surfaces or even server-side render heads if needed.
 */
export async function createEngine(opts: CreateEngineOptions): Promise<CreatedEngine> {
    const attached = !!opts.mountCanvas
    const app = new Application()
    /* Init options diverge between attached and offscreen modes:
        - attached: Pixi takes ownership of the user's canvas as its GL
          context. No DOM insertion needed (the canvas is already
          mounted by the consumer); `app.canvas` === `opts.mountCanvas`.
        - offscreen: Pixi creates its own canvas. We hide it offscreen
          and append to body so the GL context attaches; the caller
          extracts pixels into a separate visible canvas. */
    await app.init({
        ...(attached ? { canvas: opts.mountCanvas } : {}),
        width: 16, height: 16,
        preference: 'webgl',
        preferWebGLVersion: 2,
        background: 0x000000,
        backgroundAlpha: 1,
        antialias: false,
        autoStart: false,
        /* Aggressive GPU resource garbage collection.
            - `gcActive: true` is the Pixi default but we set it here to
              make the intent explicit on every engine bootstrap.
            - `gcMaxUnusedTime: 1000` (1 s) — anything not touched in a
              second is freed. Default is 60 s, which on a 900×1200
              effect chain that ticks 60×/s lets several MB of stale
              RT'ies pile up between sweeps. Active RTs (the Effect's
              `_outputRT` written into every tick) are touched on use,
              so they're never wrongly collected — only RTs whose owner
              has stopped writing them get released.
            - `gcFrequency: 1000` (1 s) — sweep cadence. Combined with
              the 1 s idle window this puts a hard ~2 s ceiling on the
              lifetime of any unused GPU resource.
           Pixi has no "cap-on-count" knob; idle-time eviction is the
           only handle. The extract-system leak we patch separately
           (see `applyPixiExtractLeakPatches`) — that one bypasses GC
           accounting entirely and needs its own fix. */
        gcActive: true,
        gcMaxUnusedTime: 1000,
        gcFrequency: 1000,
    } as any)

    if (!attached) {
        /* Hide the offscreen Pixi canvas — same as editor / supplier
           do. The visible render surface is whatever canvas the
           caller passes to `streamPublishRootToCanvas`; this canvas
           only exists because Pixi requires an attached drawing
           buffer for the GL context. */
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

    /* Build the graph from the published manifest. The engine is
       identical to editor's, so any node type, edge, and param the
       editor produced executes verbatim here. Defensive
       `cloneOf` skip even though `derivePublishedSurface` already
       strips clones — published manifests are author-controlled JSON
       and we'd rather no-op than crash if one slips through. */
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
                /* When attached, `app.destroy(true, ...)` would destroy
                   the user's canvas — that's not ours to delete. Pass
                   `false` so Pixi only releases its internal resources;
                   the consumer's React tree controls the canvas lifetime. */
                app.destroy(attached ? false : true, { children: true })
            } catch { /* */ }
            if (!attached) {
                /* Only the offscreen canvas was ours to remove. */
                ;(app.canvas as HTMLCanvasElement | undefined)?.remove()
            }
        },
    }
}
