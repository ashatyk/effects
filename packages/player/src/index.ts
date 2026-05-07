/**
 * Public surface of the framework-agnostic Tier-3 web runtime.
 *
 * Consumers (Tier-3 marketplace integrations, demo apps, the Tier-2
 * supplier app, future native bridges) import from here. The package
 * depends only on `@effects/runtime` and Pixi — no React, no MUI, no
 * @xyflow/react, no DOM widget framework.
 *
 * Stay disciplined: anything that imports React or DOM widgets belongs
 * in a consuming app, NOT here. The reason is the Tier-3 roadmap —
 * see `product-vision.mdc → Suggested ordering of next big steps`.
 * When `@effects/player` is later swapped for a Rust+wgpu WASM
 * runtime, this public surface is the contract that survives.
 */

/* ── High-level player ───────────────────────────────────────── */
export { EffectPlayer } from './EffectPlayer'
export type { EffectPlayerOptions } from './EffectPlayer'

/* ── Low-level building blocks (used by the editor and supplier
       apps; useful for any consumer that wants to assemble a
       custom runtime without the EffectPlayer fasade). ─────────── */
export { createEngine } from './createEngine'
export type { CreateEngineOptions, CreatedEngine } from './createEngine'

export { applyOverride, applyAllOverrides } from './applyOverrides'
/**
 * Two display-sink strategies:
 *
 * - `streamPublishRootToScreen` — direct render to the GL backbuffer
 *   when Pixi was attached to the consumer canvas via
 *   `createEngine({ mountCanvas })`. Zero pixel readback, flat
 *   memory profile. Used by `EffectPlayer.create`.
 *
 * - `streamPublishRootToCanvas` — legacy extract path. Pixi runs in
 *   an offscreen canvas; pixels are read back via
 *   `renderer.extract.pixels` 30×/s and `putImageData`'d into a
 *   separate visible Canvas2D. Used by the supplier app's preview,
 *   where the engine and the canvas live in different React subtrees
 *   and lifting the canvas up to engine init is impractical. Has a
 *   real ~4 MB×30 FPS GPU→JS heap copy cost — do not use this in
 *   production / mobile-facing surfaces.
 */
export { streamPublishRootToScreen } from './screen-sink'
export { streamPublishRootToCanvas } from './canvas-sink'

/* ── SupplierConfig data contract (Tier-2 → Tier-3 handoff) ─── */
export type { SupplierConfig, SamPoint } from './supplier-config'
export { emptyConfig } from './supplier-config'

export {
    serializeConfig,
    downloadConfig,
    parseConfig,
    pickConfigFile,
} from './exporter'
export type { ParseConfigResult } from './exporter'

/* ── Baked pipeline (Tier-3 AOT contract) ─────────────────────── */
export { bakePipeline } from './baking'
export type { BakeOptions, BakeResult, BakeError } from './baking'

export {
    serializeBaked,
    downloadBaked,
    parseBaked,
    pickBakedFile,
} from './exporter'
export type { ParseBakedResult } from './exporter'
