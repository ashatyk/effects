import type { BakedPipeline, DataflowEngine, PublishedPipeline } from '@effects/runtime'
import { createEngine } from './createEngine'
import { applyAllOverrides, applyOverride } from './applyOverrides'
import { streamPublishRootToScreen } from './screen-sink'
import { emptyConfig, type SupplierConfig } from './supplier-config'

export interface EffectPlayerOptions {
    pipeline: PublishedPipeline
    /** Caller-owned canvas; backbuffer is auto-resized to the active effect's
     *  publishRoot output via `renderer.resize`. CSS sizing stays in caller's control —
     *  Pixi only touches the backing buffer. Engine renders directly into this canvas;
     *  there is NO pixel readback / Canvas2D copy / extract loop (deliberate departure
     *  from the supplier preview path: for a 900×1200 effect this is the difference
     *  between flat ~80 MB and ~2.6 GB after a few minutes of mobile playback). */
    canvas: HTMLCanvasElement
    /** Optional supplier overrides. Missing or `pipelineId` mismatch falls back to
     *  authored defaults — useful for Tier-1 previews and pre-supplier smoke tests. */
    config?: SupplierConfig
    /** Engine tick FPS cap. `0` (default) removes the cap. */
    fps?: number
    /** When true (default) start ticking on `create()`. Set false to mount paused
     *  (e.g. play-on-scroll-into-view) and call `.resume()` later. */
    autoStart?: boolean
}

/**
 * High-level wrapper around the Tier-3 web runtime: published manifest + optional
 * supplier config + canvas → live animated effect.
 *
 * Owns a Pixi Application (attached to caller canvas), a DataflowEngine, and a
 * screen-sink subscription. Does NOT own React/MUI/file-pickers — those concerns
 * live in consuming apps so this class survives a future WASM/native runtime swap.
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

    /** Async because the underlying Pixi Application init bootstraps the GPU context. */
    static async create(opts: EffectPlayerOptions): Promise<EffectPlayer> {
        const { app: _app, engine, destroy: destroyEngine } = await createEngine({
            pipeline: opts.pipeline,
            fps: opts.fps,
            autoStart: opts.autoStart,
            /* Pixi attaches its GL context directly to the consumer's canvas — see
               `screen-sink.ts` for why this is mandatory for the player's memory profile. */
            mountCanvas: opts.canvas,
        })

        /* A valid published manifest always carries exactly one publishRoot; if the
           JSON was hand-edited and lost it, fail loud rather than render black. */
        const root = opts.pipeline.graph.nodes.find(n => n.data.processor === 'publishRoot')
        if (!root) {
            destroyEngine()
            throw new Error('PublishedPipeline has no publishRoot node — manifest is malformed.')
        }

        const detachSink = streamPublishRootToScreen(engine, root.id)

        /* Apply overrides AFTER the engine ticks so processors needing dirty
           propagation (e.g. ImageProcessor's async load) work correctly. Defensive
           empty fallback: missing or mismatched config = "use authored defaults",
           matching `parseConfig` behaviour. */
        const config = opts.config && opts.config.pipelineId === opts.pipeline.id
            ? opts.config
            : emptyConfig(opts.pipeline)
        applyAllOverrides(engine, opts.pipeline, config)

        return new EffectPlayer(opts.pipeline, engine, destroyEngine, detachSink, config)
    }

    /**
     * Mount a pre-baked pipeline (AOT artifact with frozen subgraphs already inlined
     * as `constantContour`/`constantTexture`). Strictly cheaper than `create`:
     * no override apply step, no SAM worker, fewer nodes/edges. Recommended for
     * production marketplace surfaces. Live overrides still work against whatever
     * survived the trim; calls against baked node ids are silent no-ops.
     */
    static async fromBaked(opts: {
        baked: BakedPipeline
        canvas: HTMLCanvasElement
        fps?: number
        autoStart?: boolean
    }): Promise<EffectPlayer> {
        /* Synthesise a PublishedPipeline-shaped object so the rest of EffectPlayer
           (which keys on `pipeline.id`/`pipeline.surface`) doesn't need a separate
           code path. The trimmed graph is consumed verbatim by `createEngine`. */
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

        /* Apply embedded SupplierConfig snapshot. Frozen subgraphs are already
           inlined as constants; the embedded config covers the live remainder
           (image slots, segmentation polygon when exposed as `whole` and not
           baked, per-field tweaks, text). Without this, image/segmentation
           nodes mount empty and the canvas renders black even though the bake
           succeeded. Defensive id check — bake artifacts are single-pipeline
           but a hand-edited file might mismatch. */
        const embedded = opts.baked.embeddedConfig as SupplierConfig | undefined
        const config = embedded && embedded.pipelineId === pipeline.id
            ? embedded
            : emptyConfig(pipeline)
        applyAllOverrides(engine, pipeline, config)
        return new EffectPlayer(pipeline, engine, destroyEngine, detachSink, config)
    }

    resume(): void {
        if (this._destroyed) return
        this.engine.start()
    }

    /** Pause ticking; last-rendered frame stays visible. `resume()` continues from
     *  where it left off (Timer-based animations preserve their phase). */
    pause(): void {
        if (this._destroyed) return
        this.engine.stop()
    }

    /** Tear down sink subscription, engine, and Pixi Application. Caller's canvas
     *  is left with whatever it last painted — clear it yourself if you want. */
    destroy(): void {
        if (this._destroyed) return
        this._destroyed = true
        this._detachSink()
        this._destroyEngine()
    }

    /**
     * Replace the entire active config. Equivalent to Reset+Import in the supplier UX.
     * `pipelineId` mismatch is silently downgraded to "use authored defaults" rather
     * than crashing — fail-soft contract so a bad config never takes the marketplace
     * card down.
     */
    setConfig(config: SupplierConfig): void {
        if (this._destroyed) return
        const safe = config.pipelineId === this.pipeline.id ? config : emptyConfig(this.pipeline)
        this._config = safe
        applyAllOverrides(this.engine, this.pipeline, safe)
    }

    /** Returned snapshot is read-only WRT the engine — mutating it does NOT push
     *  changes through. Use `setConfig`/`setField`/etc. for that. */
    getConfig(): SupplierConfig {
        return this._config
    }

    setField(nodeId: string, paramKey: string, value: number | number[]): void {
        if (this._destroyed) return
        if (Array.isArray(value)) {
            applyOverride.vector(this.engine, nodeId, paramKey, value)
        } else {
            applyOverride.scalar(this.engine, nodeId, paramKey, value)
        }
        this._config.fields[`${nodeId}:${paramKey}`] = value
    }

    /** `dataUrl` is anything an `<img>` src accepts. Cross-origin URLs need CORS
     *  headers for the engine to upload them as textures. */
    setImage(nodeId: string, dataUrl: string): void {
        if (this._destroyed) return
        applyOverride.image(this.engine, nodeId, dataUrl)
        this._config.imageSlots[nodeId] = { dataUrl }
    }

    setText(nodeId: string, value: string): void {
        if (this._destroyed) return
        applyOverride.text(this.engine, nodeId, value)
        this._config.texts[nodeId] = { value }
    }

    /** Fire a tier-2 event by stable `eventId`. Optional `(x, y)` are forwarded
     *  into `EventSignal.lastX/lastY` so downstream animations can know where the
     *  tap landed. Unknown eventId is a silent no-op (fail-soft contract). */
    emit(eventId: string, x?: number, y?: number): void {
        if (this._destroyed) return
        const zone = this.pipeline.surface.tapZones.find(z => z.eventId === eventId)
        if (!zone) return
        applyOverride.emit(this.engine, zone.nodeId, x, y)
    }
}
