import {
    type DataflowEngine,
    type PublishedPipeline,
    ImageProcessor,
    SegmentationProcessor,
    EventEmitterProcessor,
    TapZoneProcessor,
} from '@effects/runtime'
import type { SupplierConfig } from './supplier-config'

/**
 * Apply a single SupplierConfig override to the running engine.
 *
 * Per-control onChange handlers in the supplier app call this with
 * the specific patch they want — we deliberately don't re-apply the
 * entire config on every keystroke. This keeps each interaction cheap.
 *
 * Tier-3 player consumers can also call these granularly when they
 * want to drive live overrides at runtime (A/B test on the supplier
 * config, marketplace personalisation, etc.) without going through
 * a full config rebuild.
 */
export const applyOverride = {
    image(engine: DataflowEngine, nodeId: string, dataUrl: string) {
        const proc = engine.getProcessor<ImageProcessor>(nodeId)
        proc?.setImageUrl(dataUrl, engine)
    },

    /**
     * Apply a segmentation override.
     *
     * Two paths, picked per-call (NOT per-environment):
     *
     * - **Polygon-direct (Tier-3 production path)**: when `polygon`
     *   is supplied, set it directly via
     *   `proc.setPolygonOverride(polygon)`. SAM is never spawned —
     *   no transformers.js / OpenCV / ML weights download. This
     *   keeps the renderer process lean (~70 MB GPU steady-state)
     *   on mobile / WebView consumers. Use this in Tier-3 player
     *   and any consumer that already has the segmentation polygon
     *   from the published config.
     *
     * - **Points-only (supplier interactive path)**: when only
     *   `points` are supplied (legacy configs, or supplier session
     *   re-edit before SAM has produced a fresh result), call
     *   `proc.decode(points)` which spawns SAM and computes the
     *   polygon on demand. This path is acceptable in the supplier
     *   app (where the developer is interactively iterating) but
     *   should NEVER reach a marketplace card — make sure the
     *   supplier always saves the polygon back into the config
     *   before export.
     */
    segmentation(
        engine: DataflowEngine,
        nodeId: string,
        payload: SupplierConfig['segmentation'][string],
    ) {
        const proc = engine.getProcessor<SegmentationProcessor>(nodeId)
        if (!proc) return
        const points = payload.points ?? []
        const polygon = payload.polygon
        proc.points = [...points]

        if (polygon && polygon.length >= 6) {
            proc.setPolygonOverride(polygon)
            return
        }

        if (points.length > 0) {
            proc.decode(points)
        } else {
            /* Clearing all points must wipe the cached mask + polygon
               so downstream contour-based effects fall back to "no
               contour" instead of stale shape. Mirrors the editor's
               SegmentationNodeView clearAll path. */
            proc.maskData = null
            proc.polygon = []
            proc.onChange?.()
            engine.markDirty(nodeId)
        }
    },

    /** Scalar field. Updates `data.params[paramKey]` on the target node. */
    scalar(engine: DataflowEngine, nodeId: string, paramKey: string, value: number) {
        const cur = engine.getNodeParams(nodeId)
        engine.updateNodeParams(nodeId, { ...cur, [paramKey]: value })
    },

    /** Vector field. ConfigProcessor packs vec components into
     *  `${paramKey}_0`..`${paramKey}_N` keys; the engine stores them
     *  the same way so per-component sliders / colour pickers can
     *  modify a single axis without touching the others. */
    vector(engine: DataflowEngine, nodeId: string, paramKey: string, value: number[]) {
        const cur = engine.getNodeParams(nodeId)
        const next = { ...cur }
        for (let i = 0; i < value.length; i++) {
            next[`${paramKey}_${i}`] = value[i]
        }
        engine.updateNodeParams(nodeId, next)
    },

    /** Fire a tier-2 event on a `tapZone` or `eventEmitter` node. Both
     *  processors expose the same `emit(x?, y?)` API; the kind tag
     *  comes from the manifest and only matters to the UI (button vs.
     *  hit-testable region in the future). Optional `(x, y)` are
     *  forwarded into `EventSignal.lastX/lastY` for hit-positioned
     *  downstream animations. */
    emit(engine: DataflowEngine, nodeId: string, x?: number, y?: number) {
        const proc = engine.getProcessor<EventEmitterProcessor | TapZoneProcessor>(nodeId)
        proc?.emit(x, y)
    },

    /** Whole-node text override. Replaces `data.params.value` on a
     *  `text` processor; the typed TEXT slot propagates the new string
     *  through `textStrip` (which re-rasterises and uploads a fresh
     *  texture) on the next tick. Unlike fields, text is not a numeric
     *  uniform, so it lives in a dedicated SupplierConfig channel. */
    text(engine: DataflowEngine, nodeId: string, value: string) {
        const cur = engine.getNodeParams(nodeId)
        engine.updateNodeParams(nodeId, { ...cur, value })
    },
}

/**
 * Bulk-apply an entire SupplierConfig — used by Import (replaces all
 * overrides at once), Reset (passes `emptyConfig` to clear everything
 * back to manifest defaults), and {@link EffectPlayer.create} on
 * initial mount.
 *
 * For the `fields` channel the apply is structural: each entry maps
 * to either a scalar or a vector based on `Array.isArray`. The
 * pipeline's surface tells us which fields are exposed, but we don't
 * cross-check here — the form layer only writes valid keys, and an
 * extra unknown key in an imported config just becomes a no-op on a
 * node that never reads it.
 */
export function applyAllOverrides(
    engine: DataflowEngine,
    pipeline: PublishedPipeline,
    config: SupplierConfig,
): void {
    for (const slot of pipeline.surface.imageSlots) {
        const v = config.imageSlots[slot.nodeId]
        if (v?.dataUrl) applyOverride.image(engine, slot.nodeId, v.dataUrl)
    }
    for (const w of pipeline.surface.wholeNodes) {
        if (w.processor !== 'segmentation') continue
        const v = config.segmentation[w.nodeId]
        if (v) applyOverride.segmentation(engine, w.nodeId, v)
    }
    for (const f of pipeline.surface.fields) {
        const key = `${f.nodeId}:${f.paramKey}`
        const v = config.fields[key]
        if (v == null) continue
        if (Array.isArray(v)) {
            applyOverride.vector(engine, f.nodeId, f.paramKey, v)
        } else {
            applyOverride.scalar(engine, f.nodeId, f.paramKey, v)
        }
    }
    for (const w of pipeline.surface.wholeNodes) {
        if (w.processor !== 'text') continue
        const v = config.texts[w.nodeId]
        if (v?.value != null) applyOverride.text(engine, w.nodeId, v.value)
    }
}
