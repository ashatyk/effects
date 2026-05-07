import type { BakedPipeline, DataflowEngine, PublishedPipeline } from '@effects/runtime'
import { createEngine } from './createEngine'
import { applyAllOverrides, applyOverride } from './applyOverrides'
import { streamPublishRootToScreen } from './screen-sink'
import { emptyConfig, type SupplierConfig } from './supplier-config'

export interface EffectPlayerOptions {
    /** The published manifest to render. Required. */
    pipeline: PublishedPipeline
    /** Caller-owned `<canvas>` Pixi attaches its GL context to. The
     *  canvas backbuffer is auto-resized to whatever pixel dimensions
     *  the active effect's `publishRoot` outputs (`renderer.resize`),
     *  so leave its CSS sizing (`objectFit: contain`, `maxWidth`,
     *  etc.) in your control — Pixi only touches the backing buffer.
     *
     *  The engine renders directly into this canvas — there is **no**
     *  pixel readback, no Canvas2D copy, no `extract.pixels` loop.
     *  This is a deliberate departure from the supplier app's
     *  preview path (which extracts because its engine and visible
     *  canvas live in different React subtrees). For a 900×1200
     *  effect the difference between the two paths is the difference
     *  between flat ~80 MB GPU memory and ~2.6 GB after a few minutes
     *  of mobile playback. */
    canvas: HTMLCanvasElement
    /** Optional supplier-side overrides. When omitted (or
     *  `pipelineId` mismatches) the player falls back to the
     *  manifest's authored defaults — useful for Tier-1 previews and
     *  smoke-testing a fresh pipeline before any supplier touches it. */
    config?: SupplierConfig
    /** Cap on graph re-evaluation rate (frames per second). `0` (the
     *  default) removes the cap. */
    fps?: number
    /** When true (the default) the engine starts ticking immediately
     *  on `create()`. Set to `false` if you want to mount the player
     *  paused and call `.resume()` later (e.g. play-on-scroll-into-view). */
    autoStart?: boolean
}

/**
 * High-level convenience wrapper around the Tier-3 web runtime:
 * accepts a published manifest + (optional) supplier config + a
 * canvas, and turns the pair into a live, animated effect.
 *
 * Designed to be the single entry point for any non-editor / non-
 * supplier consumer:
 *
 * ```ts
 * const player = await EffectPlayer.create({
 *   pipeline,            // PublishedPipeline JSON
 *   config,              // SupplierConfig JSON (optional)
 *   canvas,              // HTMLCanvasElement
 * })
 *
 * // Live overrides at runtime (A/B testing, marketplace
 * // personalisation, scroll-driven re-tinting, etc.)
 * player.setField('n_3', 'uColor', [1, 0, 0, 1])
 * player.setText('n_5', 'CUSTOM TEXT')
 * player.emit('cta_tap')
 *
 * // Tear down when the surface unmounts
 * player.destroy()
 * ```
 *
 * Internally the player owns:
 *  - a Pixi `Application` (offscreen, hidden DOM canvas);
 *  - a `DataflowEngine` populated from `pipeline.graph`;
 *  - a `streamPublishRootToCanvas` subscription pumping pixels
 *    into the user's `canvas`.
 *
 * The player **does NOT** own React / MUI / file-pickers / form
 * state. Those concerns live in the supplier app and the player-
 * demo app — this class is the framework-agnostic core that survives
 * being lifted into a future WASM/native runtime by trimming the
 * Pixi backend.
 */
export class EffectPlayer {
    readonly pipeline: PublishedPipeline
    readonly engine: DataflowEngine
    private readonly _destroyEngine: () => void
    private readonly _detachSink: () => void
    private _config: SupplierConfig
    private _destroyed = false

    private constructor(
        pipeline: PublishedPipeline,
        engine: DataflowEngine,
        destroyEngine: () => void,
        detachSink: () => void,
        config: SupplierConfig,
    ) {
        this.pipeline = pipeline
        this.engine = engine
        this._destroyEngine = destroyEngine
        this._detachSink = detachSink
        this._config = config
    }

    /** Build a player. Async because the underlying Pixi `Application`
     *  initialisation is async (GPU context bootstrap). */
    static async create(opts: EffectPlayerOptions): Promise<EffectPlayer> {
        const { app: _app, engine, destroy: destroyEngine } = await createEngine({
            pipeline: opts.pipeline,
            fps: opts.fps,
            autoStart: opts.autoStart,
            /* Pixi attaches its GL context directly to the consumer's
               canvas — see `screen-sink.ts` for why this is mandatory
               for the player's memory profile. */
            mountCanvas: opts.canvas,
        })

        /* Resolve the publishRoot node. A valid published manifest
           always carries exactly one publishRoot; if the JSON was
           hand-edited and lost it, we fail loud rather than render a
           silent black canvas. */
        const root = opts.pipeline.graph.nodes.find(n => n.data.processor === 'publishRoot')
        if (!root) {
            destroyEngine()
            throw new Error('PublishedPipeline has no publishRoot node — manifest is malformed.')
        }

        const detachSink = streamPublishRootToScreen(engine, root.id)

        /* Apply the supplier overrides (if any) AFTER the engine is
           ticking so processors that need the engine to forward dirty
           propagation (e.g. ImageProcessor's async load) work
           correctly. Defensive empty fallback — a missing or mismatched
           config is treated as "use authored defaults", matching the
           behaviour of `parseConfig`. */
        const config = opts.config && opts.config.pipelineId === opts.pipeline.id
            ? opts.config
            : emptyConfig(opts.pipeline)
        applyAllOverrides(engine, opts.pipeline, config)

        return new EffectPlayer(opts.pipeline, engine, destroyEngine, detachSink, config)
    }

    /**
     * Mount a pre-baked pipeline.
     *
     * `BakedPipeline` is the AOT artifact the supplier exports —
     * frozen subgraphs (segmentation, contourResample, sdfFromContour,
     * textStrip, blur, ...) have already been pre-computed and
     * inlined as `constantContour` / `constantTexture` nodes.
     * Loading is **strictly cheaper** than `create({ pipeline,
     * config })`:
     *   - No `applyAllOverrides` step (overrides are baked in).
     *   - No `SegmentationProcessor` / no SAM worker → no
     *     transformers.js / OpenCV / SlimSAM weights download.
     *   - Trimmed graph has fewer nodes and fewer edges.
     *
     * This is the recommended entry point for production
     * marketplace surfaces. Use {@link create} only if you need
     * the supplier-side editable flow (interactive overrides, A/B
     * presets that aren't pre-baked).
     *
     * Live overrides (`setField`, `setImage`, `setText`, `emit`)
     * still work — they target whatever survived the trim
     * (typically the dynamic Effect node, animation chain, exposed
     * image / text / event nodes). Calls against baked node ids
     * are silent no-ops because those processors no longer exist
     * in the graph.
     */
    static async fromBaked(opts: {
        baked: BakedPipeline
        canvas: HTMLCanvasElement
        fps?: number
        autoStart?: boolean
    }): Promise<EffectPlayer> {
        /* Synthesise a PublishedPipeline-shaped object so the
           rest of EffectPlayer (which keys on `pipeline.id` /
           `pipeline.surface`) doesn't need a separate code path.
           The synthesised pipeline carries the trimmed graph
           verbatim — `createEngine` consumes `graph.nodes` /
           `graph.edges` either way. */
        const pipeline: PublishedPipeline = {
            id: opts.baked.id,
            name: opts.baked.name,
            version: opts.baked.pipelineVersion,
            manifestVersion: opts.baked.manifestVersion,
            graph: opts.baked.graph,
            surface: opts.baked.surface,
        }

        const { engine, destroy: destroyEngine } = await createEngine({
            pipeline,
            fps: opts.fps,
            autoStart: opts.autoStart,
            mountCanvas: opts.canvas,
        })

        const root = pipeline.graph.nodes.find(n => n.data.processor === 'publishRoot')
        if (!root) {
            destroyEngine()
            throw new Error('BakedPipeline has no publishRoot node — bake artifact is malformed.')
        }

        const detachSink = streamPublishRootToScreen(engine, root.id)

        /* Apply the embedded SupplierConfig snapshot if the bake
           artifact carries one. Frozen subgraphs are already inlined
           as constants; the embedded config covers the live
           remainder — image slots, segmentation polygon (when
           segmentation is exposed as `whole` and didn't get baked),
           per-field tweaks, text strings. Without this step image
           and segmentation nodes would mount empty and the canvas
           would render black even though the bake itself succeeded.
           
           Versioned check: only embedded configs matching this
           pipeline id apply (defensive — bake artifacts are
           single-pipeline, so this should always pass, but a
           hand-edited file might mismatch). Otherwise fall back to
           authored defaults. */
        const embedded = opts.baked.embeddedConfig as SupplierConfig | undefined
        const config = embedded && embedded.pipelineId === pipeline.id
            ? embedded
            : emptyConfig(pipeline)
        applyAllOverrides(engine, pipeline, config)
        return new EffectPlayer(pipeline, engine, destroyEngine, detachSink, config)
    }

    /* ── Lifecycle ────────────────────────────────────────────── */

    /** Resume engine ticking (no-op if already running). */
    resume(): void {
        if (this._destroyed) return
        this.engine.start()
    }

    /** Pause engine ticking. The last-rendered frame stays visible
     *  on the canvas; calling {@link resume} continues from where it
     *  left off (Timer-based animations preserve their phase). */
    pause(): void {
        if (this._destroyed) return
        this.engine.stop()
    }

    /** Tear down everything: the canvas-sink subscription, the engine,
     *  and the underlying Pixi Application. The user's canvas is left
     *  with whatever it last painted — clear it yourself if you want. */
    destroy(): void {
        if (this._destroyed) return
        this._destroyed = true
        this._detachSink()
        this._destroyEngine()
    }

    /* ── Live overrides ──────────────────────────────────────── */

    /**
     * Replace the entire active config with a new one. Equivalent to
     * `Reset` followed by `Import` in the supplier UX. Use this when
     * the consumer wants to swap presets at runtime (e.g. tap a
     * thumbnail to switch the look).
     *
     * The new config's `pipelineId` MUST match `this.pipeline.id`. A
     * mismatch is silently downgraded to "use authored defaults"
     * rather than crashing the surface — the player's contract is
     * fail-soft so a bad config never takes the marketplace card down.
     */
    setConfig(config: SupplierConfig): void {
        if (this._destroyed) return
        const safe = config.pipelineId === this.pipeline.id ? config : emptyConfig(this.pipeline)
        this._config = safe
        applyAllOverrides(this.engine, this.pipeline, safe)
    }

    /** The currently-applied config snapshot. Mutating the returned
     *  value does NOT affect the engine — call `setConfig` /
     *  `setField` / etc. to push changes through. */
    getConfig(): SupplierConfig {
        return this._config
    }

    /** Live-update a single scalar or vector field. The change is
     *  pushed both into the engine (so the next tick uses it) AND
     *  into the in-memory config (so a subsequent `getConfig()` /
     *  serialise reflects it). */
    setField(nodeId: string, paramKey: string, value: number | number[]): void {
        if (this._destroyed) return
        if (Array.isArray(value)) {
            applyOverride.vector(this.engine, nodeId, paramKey, value)
        } else {
            applyOverride.scalar(this.engine, nodeId, paramKey, value)
        }
        this._config.fields[`${nodeId}:${paramKey}`] = value
    }

    /** Live-update an image slot. `dataUrl` is anything an `<img>`
     *  src would accept (data URL, blob URL, http URL — though
     *  cross-origin images need CORS headers for the engine to
     *  upload them as textures). */
    setImage(nodeId: string, dataUrl: string): void {
        if (this._destroyed) return
        applyOverride.image(this.engine, nodeId, dataUrl)
        this._config.imageSlots[nodeId] = { dataUrl }
    }

    /** Live-update a `text` processor's value. Downstream `textStrip`
     *  re-rasterises on the next tick. */
    setText(nodeId: string, value: string): void {
        if (this._destroyed) return
        applyOverride.text(this.engine, nodeId, value)
        this._config.texts[nodeId] = { value }
    }

    /** Fire a tier-2 event by stable `eventId`. Looks up the matching
     *  `tapZone` / `eventEmitter` node in the published surface and
     *  calls its `emit(x?, y?)`. Optional `(x, y)` are forwarded into
     *  the resulting `EventSignal.lastX/lastY` so downstream
     *  animations (envelopes, switches) can know where the tap landed.
     *
     *  Unknown eventId is a silent no-op (fail-soft contract). */
    emit(eventId: string, x?: number, y?: number): void {
        if (this._destroyed) return
        const zone = this.pipeline.surface.tapZones.find(z => z.eventId === eventId)
        if (!zone) return
        applyOverride.emit(this.engine, zone.nodeId, x, y)
    }
}
