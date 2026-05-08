import type { PublishedPipeline } from '@effects/runtime'

/** Structurally identical to `runtime/sam/types → SamPoint` so the array can be
 *  passed straight into `SegmentationProcessor.decode(points)`. */
export interface SamPoint {
    point: [number, number]   // normalised [0..1] image coords
    label: 0 | 1               // 1 = include, 0 = exclude
}

/**
 * Tier-2 → Tier-3 contract: supplier-prepared overrides on top of a PublishedPipeline.
 *
 * Apply paths:
 *  - `imageSlots[nodeId].dataUrl` → `ImageProcessor.setImageUrl(...)`
 *  - `segmentation[nodeId]` → `SegmentationProcessor.setPolygonOverride(...)` or `.decode(...)`
 *  - `fields["${nodeId}:${paramKey}"]` → `engine.updateNodeParams(...)`
 *  - `texts[nodeId].value` → `engine.updateNodeParams({ value })`
 *
 * Vector fields are stored as plain `number[]`; the apply layer reconstructs
 * `${paramKey}_0`..`${paramKey}_N` keys to match how `ConfigProcessor` packs them.
 */
export interface SupplierConfig {
    /** Must match `pipeline.id`; mismatch on import = fail-closed. */
    pipelineId: string
    /** Informational; used to warn when re-importing against a newer pipeline version. */
    pipelineVersion: string
    /** Runtime checks this matches its expected `PUBLISH_MANIFEST_VERSION`. */
    manifestVersion: number
    imageSlots: Record<string, { dataUrl: string }>
    /**
     * Per-segmentation-node overrides.
     *  - `points` — supplier-marked SAM hint points; kept so the supplier can
     *    re-edit the segmentation in another session.
     *  - `polygon` — flat `[x0, y0, x1, y1, ...]` in source-image pixel space.
     *    The actual Tier-3 payload — segmentation result already computed by SAM
     *    in the supplier app, baked into the config.
     *
     * When `polygon` is present (≥3 vertices) the runtime applies it DIRECTLY
     * and never spawns SAM. Hard architectural rule: production / mobile / WebView
     * clients must NOT load the ~150 MB transformers.js + OpenCV WASM + SlimSAM
     * model. `polygon` may be omitted on legacy configs (runtime then falls back
     * to live SAM — backwards compat shim only, not the recommended path).
     */
    segmentation: Record<string, {
        points: SamPoint[]
        polygon?: number[]
    }>
    /** Key shape: `${nodeId}:${paramKey}`. Scalar=number, vector=number[]. */
    fields: Record<string, number | number[]>
    /** Whole-node text overrides keyed by nodeId. Replaces `data.params.value` on
     *  a `text` processor; the typed TEXT slot propagates through `textStrip`
     *  (which re-rasterises and uploads a fresh texture) on the next tick.
     *  Separate channel from `fields` because text is not a numeric uniform. */
    texts: Record<string, { value: string }>

    /**
     * Pre-computed outputs of static (frozen) subgraphs, keyed by the original
     * processor's `nodeId`. Filled by the supplier app's `bakeStaticSubgraphs` step.
     * The Tier-3 player rewrites the graph on mount: every id in `baked` has its
     * original processor replaced with `constantContour`/`constantTexture` carrying
     * the baked payload. Frozen processors never instantiate — saving CPU, GPU, and
     * JS heap on every Tier-3 surface. Optional: legacy configs ship without it
     * (runtime then runs the original processors live).
     */
    baked?: Record<string, BakedAsset>
}

/**
 * One baked subgraph output, embedded inline in `SupplierConfig`.
 * Two shapes:
 *  - `contour` — ContourSamples with Float32Array buffers as plain `number[]` for JSON.
 *  - `texture` — base64 `image/png` data URL plus intrinsic dimensions; uploaded
 *    via `Assets.load(dataUrl)` lazily on first execute.
 *
 * The PNG round-trip via Canvas2D is lossy on `A=0` pixels (Canvas2D premultiplies
 * on store and un-premultiplies on read → `RGB / 0 = 0`). The SDF format was
 * rewritten to keep `A=1` everywhere (signed distance packed into RGB; see
 * `pipeline/passes/sdf-pure.ts`) so this round trip is lossless for our texture
 * set. Bake outputs that need semantic data in alpha would need a raw-pixel path.
 */
export type BakedAsset =
    | { kind: 'contour'; data: BakedContour }
    | { kind: 'texture'; dataUrl: string; width: number; height: number }

export interface BakedContour {
    version: 1
    closed: boolean
    count: number
    totalLength: number
    aabb: [number, number, number, number]
    /** Length = count * 2, layout `[x0, y0, x1, y1, ...]`. */
    positions: number[]
    /** Length = count * 2, unit-length tangent at each sample. */
    tangents: number[]
    /** Length = count, monotonic arc length at each sample. */
    arcS: number[]
}

/** Empty config = "use authored defaults everywhere". */
export function emptyConfig(pipeline: PublishedPipeline): SupplierConfig {
    return {
        pipelineId: pipeline.id,
        pipelineVersion: pipeline.version,
        manifestVersion: pipeline.manifestVersion,
        imageSlots: {},
        segmentation: {},
        fields: {},
        texts: {},
        /* `baked` is intentionally undefined — the bake step runs at export time,
           not at edit time. */
    }
}
