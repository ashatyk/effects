/**
 * Public surface of the framework-agnostic Tier-3 web runtime.
 * Anything that imports React or DOM widgets belongs in a consuming app, NOT here —
 * this package is the contract that survives a future swap to a Rust+wgpu WASM runtime.
 */

export { EffectPlayer } from './EffectPlayer'
export type { EffectPlayerOptions } from './EffectPlayer'

export { createEngine } from './createEngine'
export type { CreateEngineOptions, CreatedEngine } from './createEngine'

export { applyOverride, applyAllOverrides } from './applyOverrides'
/**
 * Two display-sink strategies:
 * - `streamPublishRootToScreen` — direct render to the GL backbuffer when Pixi
 *   was attached via `createEngine({ mountCanvas })`. Zero pixel readback.
 * - `streamPublishRootToCanvas` — legacy extract path (~4 MB×30 FPS GPU→JS copy).
 *   Used by the supplier preview where engine and canvas live in different React subtrees.
 *   Do NOT use in production / mobile-facing surfaces.
 */
export { streamPublishRootToScreen } from './screen-sink'
export { streamPublishRootToCanvas } from './canvas-sink'

export type { SupplierConfig, SamPoint } from './supplier-config'
export { emptyConfig } from './supplier-config'

export {
    serializeConfig,
    downloadConfig,
    parseConfig,
    pickConfigFile,
} from './exporter'
export type { ParseConfigResult } from './exporter'

export { bakePipeline } from './baking'
export type { BakeOptions, BakeResult, BakeError } from './baking'

export {
    serializeBaked,
    downloadBaked,
    parseBaked,
    pickBakedFile,
} from './exporter'
export type { ParseBakedResult } from './exporter'
