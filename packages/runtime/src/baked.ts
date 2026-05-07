/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier-3 baked pipeline — the AOT artifact a marketplace card / native
 * surface loads to render an effect.
 *
 * Why a separate type from `PublishedPipeline`:
 *
 * - `PublishedPipeline` is the **editor's output**: the full author-
 *   facing graph (segmentation + contour resample + SDF + every blur
 *   pass + the effect itself) plus the supplier-facing `surface`
 *   (slots / fields / tap zones). It's the contract between Tier-1
 *   (editor) and Tier-2 (supplier).
 *
 * - `BakedPipeline` is the **supplier's output**: a *trimmed* graph
 *   where every static (frozen) subgraph has already been pre-
 *   computed and embedded inline as a `constantContour` /
 *   `constantTexture` node. Plus the same `surface` (filtered to
 *   what's still in the trimmed graph — image slots that fed only
 *   baked subgraphs disappear). It's the contract between Tier-2
 *   (supplier) and Tier-3 (any prod runtime: marketplace web,
 *   native iOS/Android via the Rust+wgpu port, server-side OG image
 *   generation, ...).
 *
 * Loading a `BakedPipeline` requires no merge step, no overrides
 * map, no SAM — the player just hands the trimmed graph to the
 * engine and starts ticking. Live overrides (setField / setImage /
 * setText / emit) work on whatever survived the trim — typically
 * just the `image` slots, `text` nodes, `eventEmitter`/`tapZone`,
 * and the dynamic animation chain feeding the Effect.
 *
 * Surface fields with `kind === 'event'` survive verbatim because
 * `tapZone` / `eventEmitter` are NOT pure (they own runtime state).
 *
 * Encoding rationale: PNG dataUrls and ContourSamples sit **inline
 * in `node.data.params`** (not in a separate `assets` blob map).
 * Trade-off: ~1–4 MB per baked texture inflates JSON size, but the
 * loader stays trivial — Pixi `Assets.load(dataUrl)` consumes them
 * unchanged. For marketplace cards typical baked size is 2–8 MB
 * gzipped, well within payload comfort. If we later need a
 * separate-asset format we can add it without changing the
 * `BakedPipeline` shape (move a `params.dataUrl` to a
 * `params.assetRef` + `assets[ref] = dataUrl`).
 *
 * The PNG round-trip via Canvas2D is lossy on pixels with `A = 0`
 * (Canvas2D premultiplies on store, un-premultiplies on read →
 * `RGB / 0 = 0`). The SDF format was rewritten to keep `A = 1`
 * everywhere (signed distance packed into RGB; see
 * `pipeline/passes/sdf-pure.ts`) so the round trip is lossless
 * for our texture set. Bake outputs that need semantic data in
 * alpha would need a raw-pixel path (`extract.pixels` →
 * `BufferImageSource`) — see git history for an earlier draft of
 * that approach.
 */

import type { PublishedSurface, SerializedNode, SerializedEdge } from './publish'

/** Bump on any breaking change to `BakedPipeline` shape. Loaders
 *  should fail-closed on a bake-version mismatch (the trimmed-graph
 *  shape, the constant processor params layout, or any other
 *  inline contract changes — old players can't safely interpret a
 *  newer bake). Distinct from `PUBLISH_MANIFEST_VERSION` so we can
 *  evolve the bake format without forcing every editor / supplier
 *  re-publish (and vice versa). */
export const BAKE_MANIFEST_VERSION = 1

export interface BakedPipeline {
    /** Pipeline identity (mirrors `PublishedPipeline.id`). */
    id: string
    /** Free-form effect name (`PublishedPipeline.name`). */
    name: string
    /** Author-bumped semver-ish (`PublishedPipeline.version`). */
    pipelineVersion: string
    /** Captured `PUBLISH_MANIFEST_VERSION` of the source pipeline.
     *  Loaders use it to know which graph schema the trimmed
     *  `nodes`/`edges` follow. */
    manifestVersion: number
    /** This bake's own schema version — see `BAKE_MANIFEST_VERSION`. */
    bakeManifestVersion: number
    /** ISO timestamp at which the bake ran. Informational. */
    bakedAt: string

    /** Trimmed graph. Frozen subgraphs collapsed to single nodes
     *  (`constantContour` / `constantTexture`) carrying their pre-
     *  computed output as params. Dead upstream (e.g. an `image`
     *  feeding only a baked `segmentation` subgraph) is removed. */
    graph: {
        nodes: SerializedNode[]
        edges: SerializedEdge[]
    }

    /** Trimmed supplier-facing surface. Same shape as
     *  `PublishedPipeline.surface` but filtered to entries whose
     *  `nodeId` still exists in the trimmed `graph`. Image slots
     *  whose only consumer was a baked subgraph disappear; tap
     *  zones, exposed fields on dynamic nodes survive. */
    surface: PublishedSurface

    /** Optional human-readable manifest of what got baked, keyed
     *  by the **original** node id. The constant nodes already
     *  carry the actual data inline in `params`; this map is for
     *  debugging / "show what the supplier baked" UIs and is
     *  safe to drop without losing the ability to render. */
    bakeReport?: BakeReport

    /** Snapshot of the SupplierConfig that was active at bake time,
     *  inlined so the artifact is **self-sufficient** — the player
     *  can render straight from a `.baked.json` without a sidecar
     *  config file.
     *
     *  Why we need this: the bake algorithm only freezes nodes
     *  that are NOT exposed (image slots, segmentation in `whole`
     *  mode, exposed fields, text/tapZone/eventEmitter — all stay
     *  dynamic). Their runtime data (uploaded picture, SAM polygon,
     *  per-field tweaks, text strings) lives in the SupplierConfig
     *  and was historically expected to ship as a separate file.
     *  Marketplace surfaces really want one file though, so we
     *  embed the config inside the bake artifact and apply it on
     *  mount.
     *
     *  Shape is `unknown` here because `BakedPipeline` lives in
     *  `@effects/runtime` and `SupplierConfig` lives in
     *  `@effects/player` (the runtime package is the lower layer).
     *  Player code casts to `SupplierConfig` at the boundary —
     *  see `EffectPlayer.fromBaked`. */
    embeddedConfig?: unknown
}

export interface BakeReport {
    /** Per-bake-target details for introspection. */
    entries: Array<{
        /** Original node id from PublishedPipeline. */
        originalNodeId: string
        /** Original processor type ('segmentation', 'contourResample',
         *  'sdfFromContour', 'textStrip', 'blur', ...). */
        originalProcessor: string
        /** What the bake produced. */
        replacedWith: 'constantContour' | 'constantTexture'
        /** Approximate inline payload size (bytes of JSON or base64). */
        approxSizeBytes: number
    }>
    /** Original-graph node count → trimmed-graph node count, for a
     *  quick "we removed N nodes" indicator in supplier UIs. */
    nodesBefore: number
    nodesAfter: number
}
