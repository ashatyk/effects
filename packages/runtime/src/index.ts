/**
 * Public surface of @effects/runtime — framework-agnostic. Imported by
 * apps/editor, apps/supplier and any Tier-3 web runner. Depends only on
 * Pixi and polygon-clipping. Anything React/MUI/@xyflow belongs in
 * @effects/ui or the consuming app, NOT here.
 */

export * from './node-engine/types'
export * from './pipeline/types'

export { DataflowEngine } from './node-engine/dataflow-engine'
export { BaseProcessor } from './node-engine/processors/base-processor'
export { PROCESSOR_CATALOG } from './node-engine/processors'
export type { ProcessorEntry } from './node-engine/processors'
/* Auto-applied by DataflowEngine.constructor; exported for consumers
   that use Pixi extract.* outside of an engine context. Idempotent. */
export { applyPixiExtractLeakPatches } from './node-engine/pixi-patches'

/* Per-processor classes used directly by the supplier app and editor
   hooks (instance methods like Image.setImageUrl, Segmentation.decode). */
export { ImageProcessor, imageDef } from './node-engine/processors/image'
export { SegmentationProcessor, segmentationDef } from './node-engine/processors/segmentation'
export { EventEmitterProcessor, eventEmitterDef } from './node-engine/processors/event-emitter'
export { TapZoneProcessor, tapZoneDef } from './node-engine/processors/tap-zone'
export { PublishRootProcessor, publishRootDef } from './node-engine/processors/publish-root'
export { PreviewProcessor, previewDef } from './node-engine/processors/preview'
export { ContourPreviewProcessor, contourPreviewDef } from './node-engine/processors/contour-preview'
export { ConfigProcessor, configDef } from './node-engine/processors/config'
export { LogProcessor, logDef } from './node-engine/processors/log'

export { effects } from './effects'

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

export { BAKE_MANIFEST_VERSION } from './baked'
export type { BakedPipeline, BakeReport } from './baked'

export { createSamWorker } from './sam/create-worker'
export type * from './sam/types'
