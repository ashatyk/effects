import type { PublishedPipeline } from '@effects/runtime'

/** A single SAM hint point — kept structurally identical to
 *  `runtime/sam/types → SamPoint` so we can pass the array straight
 *  into `SegmentationProcessor.decode(points)`. */
export interface SamPoint {
    point: [number, number]   // normalised [0..1] image coords
    label: 0 | 1               // 1 = include, 0 = exclude
}

/**
 * Supplier-prepared overrides on top of a `PublishedPipeline`.
 *
 * This is the **Tier-2 → Tier-3 contract**: whatever a supplier
 * prepares in the supplier app is captured in this shape, and the
 * Tier-3 runtime ({@link EffectPlayer}) consumes the same shape to
 * apply the overrides on top of the published manifest's defaults.
 *
 * The runtime applies these by:
 *  - `imageSlots[nodeId].dataUrl` → `ImageProcessor.setImageUrl(...)`
 *  - `segmentation[nodeId].points` → `SegmentationProcessor.decode(...)`
 *  - `fields["${nodeId}:${paramKey}"]` → `engine.updateNodeParams(...)`
 *  - `texts[nodeId].value` → `engine.updateNodeParams({ value })`
 *
 * Vector fields are stored as plain `number[]`; the apply layer
 * reconstructs `${paramKey}_0`..`${paramKey}_N` keys at apply time
 * to match the way `ConfigProcessor` packs them into `data.params`.
 */
export interface SupplierConfig {
    /** Must match `pipeline.id`; mismatch on import = fail-closed. */
    pipelineId: string
    /** Captured at export time — purely informational, used to warn
     *  the user when re-importing a config against a newer pipeline
     *  version. */
    pipelineVersion: string
    /** Captured at export time. The runtime checks this matches its
     *  expected `PUBLISH_MANIFEST_VERSION` before consuming. */
    manifestVersion: number
    imageSlots: Record<string, { dataUrl: string }>
    /**
     * Per-segmentation-node overrides.
     *
     * - `points` — supplier-marked SAM hint points. Kept so the
     *   supplier can re-edit the segmentation in another session
     *   (load config → see existing markers → adjust → re-export).
     * - `polygon` — flat `[x0, y0, x1, y1, ...]` in source-image
     *   pixel space. **This is the actual Tier-3 payload** —
     *   the segmentation result already computed by SAM in the
     *   supplier app, baked into the config.
     *
     * When `polygon` is present (≥3 vertices), the Tier-3 runtime
     * applies it DIRECTLY to `SegmentationProcessor` and never
     * spawns the SAM worker. This is a hard architectural rule:
     * production / mobile / WebView clients must NOT load the
     * ~150 MB transformers.js + OpenCV WASM + SlimSAM model — the
     * supplier already did that work, the result lives here.
     *
     * `polygon` may be omitted on legacy configs exported before
     * this field existed (the runtime then falls back to running
     * SAM on the fly — same as before, but only as a backwards
     * compatibility shim, not the recommended path).
     */
    segmentation: Record<string, {
        points: SamPoint[]
        polygon?: number[]
    }>
    /** Key shape: `${nodeId}:${paramKey}`. Scalar fields map to
     *  `number`, vector fields to `number[]`. */
    fields: Record<string, number | number[]>
    /** Whole-node text overrides keyed by nodeId. Replaces
     *  `data.params.value` on a `text` processor; the typed TEXT slot
     *  propagates the new string through `textStrip` (which
     *  re-rasterises and uploads a fresh texture) on the next tick.
     *  Kept as a separate channel from `fields` because text is not a
     *  numeric uniform. */
    texts: Record<string, { value: string }>

    /**
     * Pre-computed outputs of static (frozen) subgraphs, keyed by
     * the **original** processor's `nodeId`.
     *
     * Filled by the supplier app's `bakeStaticSubgraphs(...)` step
     * at config-export time. The Tier-3 player rewrites the graph
     * on mount: every node id in `baked` has its original processor
     * (e.g. `segmentation`, `contourResample`, `sdfFromContour`,
     * `textStrip`, `blur`, ...) replaced with a tiny constant-source
     * processor (`constantContour` / `constantTexture`) carrying the
     * baked payload as params. The frozen processors never
     * instantiate — saving CPU (no per-tick execute), GPU (no RT
     * pool, no shader builds) and JS heap (no resampled arrays /
     * SAM caches / etc.) on every Tier-3 surface.
     *
     * Optional: legacy configs (or freshly-built configs before
     * bake step ran) ship without it. The runtime then falls back
     * to running the original processors live — same behaviour as
     * before bake existed. Adding `baked` is always a pure win.
     */
    baked?: Record<string, BakedAsset>
}

/**
 * One baked subgraph output, embedded inline in `SupplierConfig`.
 *
 * Two shapes corresponding to the two slot kinds we currently bake:
 *
 * - **`contour`** — a `ContourSamples` packet with Float32Array
 *   buffers serialised as plain `number[]` for JSON round-tripping.
 *   Replaces the original processor with `constantContour`.
 *
 * - **`texture`** — a base64 `image/png` data URL plus the
 *   intrinsic dimensions. The Tier-3 player uploads it via
 *   `Assets.load(dataUrl)` lazily on first execute (same path
 *   `ImageProcessor` uses for user-supplied images). Replaces the
 *   original processor with `constantTexture`.
 *
 *   The PNG round-trip via Canvas2D is lossy on pixels with
 *   `A = 0` (Canvas2D premultiplies on store, un-premultiplies on
 *   read → `RGB / 0 = 0`). The SDF format was rewritten to keep
 *   `A = 1` everywhere (signed distance packed into RGB; see
 *   `pipeline/passes/sdf-pure.ts`) so this round trip is
 *   lossless for our texture set. Bake outputs that need semantic
 *   data in alpha would need a raw-pixel path instead.
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

/** Build an empty SupplierConfig for a given pipeline. The runtime
 *  treats an empty config as "use authored defaults everywhere" — no
 *  image slots filled, no segmentation hints, no field overrides,
 *  no baked subgraphs. */
export function emptyConfig(pipeline: PublishedPipeline): SupplierConfig {
    return {
        pipelineId: pipeline.id,
        pipelineVersion: pipeline.version,
        manifestVersion: pipeline.manifestVersion,
        imageSlots: {},
        segmentation: {},
        fields: {},
        texts: {},
        /* baked is intentionally undefined on empty — the bake step
           is a finishing pass that runs at export time, not at
           edit time. An empty config simply won't carry any
           pre-computed outputs. */
    }
}
