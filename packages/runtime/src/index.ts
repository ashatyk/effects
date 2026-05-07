/**
 * Public surface of the framework-agnostic runtime package.
 *
 * Both `apps/editor` and `apps/supplier` (and any future Tier-3 web
 * runner) import from here. The package depends only on Pixi and
 * polygon-clipping — no React, no MUI, no @xyflow/react.
 *
 * Stay disciplined: anything that imports React or DOM widgets belongs
 * in `@effects/ui` or in the consuming app, NOT here.
 */

/* ── Core types ─────────────────────────────────────────────────── */
export * from './node-engine/types'
export * from './pipeline/types'

/* ── Engine ─────────────────────────────────────────────────────── */
export { DataflowEngine } from './node-engine/dataflow-engine'
export { BaseProcessor } from './node-engine/processors/base-processor'
export { PROCESSOR_CATALOG } from './node-engine/processors'
export type { ProcessorEntry } from './node-engine/processors'
/* Pixi v8 extract-system memory-leak patch (`ExtractSystem.canvas` and
   `.base64` leak the intermediate RenderTexture they allocate). Auto-
   applied by `DataflowEngine.constructor`; exported here for any
   consumer that uses Pixi extract OUTSIDE of an engine context (e.g. a
   tool that builds a Texture, extracts it, and never instantiates
   DataflowEngine). Safe to call multiple times. */
export { applyPixiExtractLeakPatches } from './node-engine/pixi-patches'

/* ── Per-processor classes (some consumers reach for the concrete
       processor to call instance methods — Image.setImageUrl,
       Segmentation.decode, etc.). Re-export the ones supplier-app and
       editor-side hooks need; internal-only processors can stay
       importable via deep paths if ever required. ─────────────────── */
export { ImageProcessor, imageDef } from './node-engine/processors/image'
export { SegmentationProcessor, segmentationDef } from './node-engine/processors/segmentation'
export { EventEmitterProcessor, eventEmitterDef } from './node-engine/processors/event-emitter'
export { TapZoneProcessor, tapZoneDef } from './node-engine/processors/tap-zone'
export { PublishRootProcessor, publishRootDef } from './node-engine/processors/publish-root'
export { PreviewProcessor, previewDef } from './node-engine/processors/preview'
export { ContourPreviewProcessor, contourPreviewDef } from './node-engine/processors/contour-preview'
export { ConfigProcessor, configDef } from './node-engine/processors/config'
export { LogProcessor, logDef } from './node-engine/processors/log'

/* ── Effects catalogue ─────────────────────────────────────────── */
export { effects } from './effects'

/* ── Publish plane (Tier-2 contract) ───────────────────────────── */
export {
    derivePublishedSurface,
    PUBLISH_MANIFEST_VERSION,
} from './publish'
export type {
    PublishedPipeline,
    PublishedSurface,
    PublishedGraph,
    PublishedImageSlot,
    PublishedTapZone,
    PublishedField,
    PublishedWholeNode,
    PublishError,
    DerivePublishedSurfaceResult,
    SerializedNode,
    SerializedEdge,
} from './publish'

/* ── Baked pipeline (Tier-3 AOT contract) ──────────────────────── */
export { BAKE_MANIFEST_VERSION } from './baked'
export type { BakedPipeline, BakeReport } from './baked'

/* ── SAM worker ────────────────────────────────────────────────── */
export { createSamWorker } from './sam/create-worker'
export type * from './sam/types'
