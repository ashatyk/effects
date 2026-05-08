/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier-3 baked pipeline — AOT artifact for marketplace cards / native
 * runtimes. Trimmed graph where every frozen subgraph has been pre-
 * computed and embedded as constantContour / constantTexture nodes.
 *
 * Loading needs no merge step, no SAM, no overrides — the player feeds
 * the trimmed graph straight to the engine. Live overrides (setField/
 * setImage/setText/emit) operate on whatever survived the trim
 * (image slots, text nodes, eventEmitter/tapZone, the dynamic chain
 * feeding the Effect). Surface entries with `kind === 'event'` survive
 * verbatim because tapZone/eventEmitter own runtime state.
 *
 * Encoding: PNG dataUrls and ContourSamples sit inline in
 * node.data.params (not in a separate assets map). Pixi
 * Assets.load(dataUrl) consumes them unchanged; typical baked size is
 * 2–8 MB gzipped. PNG round-trips via Canvas2D are lossy on A=0 pixels
 * (premultiplied storage), so the SDF format keeps A=1 everywhere —
 * see pipeline/passes/sdf-pure.ts. Outputs needing semantic data in
 * alpha would need a raw-pixel path (extract.pixels → BufferImageSource).
 */

import type { PublishedSurface, SerializedNode, SerializedEdge } from './publish'

/** Bump on breaking changes to BakedPipeline shape. Distinct from
 *  PUBLISH_MANIFEST_VERSION so bake format can evolve without forcing
 *  every supplier re-publish. Loaders fail-closed on mismatch. */
export const BAKE_MANIFEST_VERSION = 1

export interface BakedPipeline {
    id: string
    name: string
    pipelineVersion: string
    /** PUBLISH_MANIFEST_VERSION captured from the source pipeline. */
    manifestVersion: number
    bakeManifestVersion: number
    bakedAt: string

    /** Frozen subgraphs collapsed into constantContour/constantTexture
     *  carrying pre-computed output in params. Dead upstream is removed. */
    graph: {
        nodes: SerializedNode[]
        edges: SerializedEdge[]
    }

    /** PublishedSurface filtered to entries whose nodeId still exists
     *  in the trimmed graph. */
    surface: PublishedSurface

    /** Optional debug manifest keyed by original node id. Constant
     *  nodes already carry the data inline; this can be dropped. */
    bakeReport?: BakeReport

    /** Snapshot of SupplierConfig active at bake time. Inlined so
     *  the artifact is self-sufficient — player can render straight
     *  from a `.baked.json` without a sidecar config. Typed as
     *  `unknown` because BakedPipeline is in @effects/runtime
     *  (lower layer) and SupplierConfig is in @effects/player; the
     *  player casts at the EffectPlayer.fromBaked boundary. */
    embeddedConfig?: unknown
}

export interface BakeReport {
    entries: Array<{
        originalNodeId: string
        originalProcessor: string
        replacedWith: 'constantContour' | 'constantTexture'
        /** Approximate inline payload size (bytes of JSON or base64). */
        approxSizeBytes: number
    }>
    nodesBefore: number
    nodesAfter: number
}
