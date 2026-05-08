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
 * Apply a single SupplierConfig override to a running engine. Per-control
 * onChange handlers in the supplier app call these granularly; we deliberately
 * don't re-apply the entire config on every keystroke. Tier-3 player consumers
 * also call these for live runtime overrides (A/B, personalisation).
 */
export const applyOverride = {
    image(engine: DataflowEngine, nodeId: string, dataUrl: string) {
        const proc = engine.getProcessor<ImageProcessor>(nodeId)
        proc?.setImageUrl(dataUrl, engine)
    },

    /**
     * Two paths picked per-call (not per-environment):
     * - Polygon-direct (Tier-3 production): `polygon` → `setPolygonOverride`.
     *   SAM is never spawned — keeps mobile/WebView consumers lean (~70 MB GPU).
     * - Points-only (supplier interactive): `decode(points)` spawns SAM and
     *   computes the polygon on demand. NEVER let this reach a marketplace
     *   card — supplier must save polygon back into config before export.
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
            /* Clearing all points must wipe the cached mask + polygon so
               downstream contour effects fall back to "no contour" instead
               of stale shape. Mirrors editor's SegmentationNodeView clearAll. */
            proc.maskData = null
            proc.polygon = []
            proc.onChange?.()
            engine.markDirty(nodeId)
        }
    },

    scalar(engine: DataflowEngine, nodeId: string, paramKey: string, value: number) {
        const cur = engine.getNodeParams(nodeId)
        engine.updateNodeParams(nodeId, { ...cur, [paramKey]: value })
    },

    /** ConfigProcessor packs vec components into `${paramKey}_0`..`${paramKey}_N`
     *  keys; the engine stores them the same way so per-component sliders /
     *  colour pickers can modify a single axis without touching the others. */
    vector(engine: DataflowEngine, nodeId: string, paramKey: string, value: number[]) {
        const cur = engine.getNodeParams(nodeId)
        const next = { ...cur }
        for (let i = 0; i < value.length; i++) {
            next[`${paramKey}_${i}`] = value[i]
        }
        engine.updateNodeParams(nodeId, next)
    },

    /** Both `tapZone` and `eventEmitter` expose the same `emit(x?, y?)` API; the
     *  kind tag from the manifest only matters to the UI. `(x, y)` are forwarded
     *  into `EventSignal.lastX/lastY` for hit-positioned downstream animations. */
    emit(engine: DataflowEngine, nodeId: string, x?: number, y?: number) {
        const proc = engine.getProcessor<EventEmitterProcessor | TapZoneProcessor>(nodeId)
        proc?.emit(x, y)
    },

    /** Replaces `data.params.value` on a `text` processor; TEXT slot propagates
     *  through `textStrip` (re-rasterises and uploads a fresh texture) next tick.
     *  Lives in a dedicated channel because text isn't a numeric uniform. */
    text(engine: DataflowEngine, nodeId: string, value: string) {
        const cur = engine.getNodeParams(nodeId)
        engine.updateNodeParams(nodeId, { ...cur, value })
    },
}

/**
 * Bulk-apply an entire SupplierConfig — used by Import, Reset (`emptyConfig`),
 * and `EffectPlayer.create` on initial mount. Each `fields` entry maps to scalar
 * or vector based on `Array.isArray`. We don't cross-check against
 * `pipeline.surface` — the form layer only writes valid keys, and an unknown
 * imported key just becomes a no-op on a node that never reads it.
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
