import type { Texture } from 'pixi.js'

export type ScalarKind = 'f32' | 'i32'
export type VecKind = 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>'
export type UniformKind = ScalarKind | VecKind

export type FieldDef = {
    name: string
    label: string
    kind: UniformKind
    default: number | number[]
    slider?: { min: number; max: number; step?: number }
    uniformName?: string
    color?: boolean
}

/**
 * Effect-node input names that a pass may declare as required.
 * If the input is missing in the graph, the pass is either skipped (hard
 * deps: 'source', 'contour', 'txcn{i}') or bound with a fallback resource
 * (white texture for unconnected `txcn{i}`).
 *
 * `txcn0..txcn7` are eight unnamed texture inputs surfaced on the Effect
 * node. Each effect manifest declares which of those slots it actually
 * consumes via `PlaygroundConfig.textures.slots`, with a human-readable
 * label that the Effect node UI shows next to the corresponding handle
 * (e.g. `txcn0 · SDF`, `txcn1 · Atlas`). Shaders bind the channels they
 * need by declaring `uniform sampler2D uTxcn{i};` — there is no longer
 * any typed `sdf` / `atlas` boundary at the node level, so the same
 * Effect node can host any combination of texture maps.
 */
export type EffectInputName =
    | 'source'
    | 'txcn0' | 'txcn1' | 'txcn2' | 'txcn3'
    | 'txcn4' | 'txcn5' | 'txcn6' | 'txcn7'
    | 'contour'

export type EffectPass = FullscreenPass | InstancedPass

export type FullscreenPass = {
    id: string
    kind: 'fullscreen'
    blend: 'normal' | 'add'
    fragment: string
    vertex?: string
    requiresInputs?: EffectInputName[]
}

export type InstancedPass = {
    id: string
    kind: 'instanced'
    blend: 'normal' | 'add'
    vertex: string
    fragment: string
    geometry: InstancedGeometryDef
    requiresInputs?: EffectInputName[]
    /**
     * When set, the runtime resamples the contour each frame so per-instance
     * positions are equally spaced and slide along the curve.
     *
     * All field names refer to uniform names declared in `PlaygroundConfig.fields`.
     *
     * Two modes:
     *   - `'glyph'` (default): one instance per glyph, anchored at a single
     *     point on the contour. `spacing = totalLength / (phraseLen * repeats)`
     *     unless overridden by `spacingField`.
     *   - `'ribbon'`: one instance per *segment* of the contour. Each instance
     *     carries the start/end position+tangent of a short arc (`segmentSize`
     *     px long), so the shader can build a strip-like quad. UV.x is mapped
     *     linearly from arc length, so a horizontal text texture stretches
     *     continuously across the curve as a marquee.
     */
    scrolling?: {
        mode?: 'glyph' | 'ribbon'
        spacingField?: string
        phraseLenField?: string
        repeatsField?: string
        /** ribbon-mode only: arc length of one quad segment (px). */
        segmentSizeField?: string
        /** Animation channel slot whose `value` drives the contour scroll
         *  phase (px). Defaults to slot 0 — the canonical "phase / scroll"
         *  position in the standard slot layout. Speed is governed by the
         *  upstream signal (Timer durationMs / Controller min/max) — the
         *  manifest no longer exposes a per-effect speed field. */
        phaseSlot?: number
    }
}

export type InstancedGeometryDef = {
    perVertex: { aLocal: [number, number][] }
    indexBuffer: number[]
    perInstance: {
        source: 'inputs.contour'
        map: PerInstanceAttr[]
    }
}

export type PerInstanceAttr = {
    name: 'aPosition' | 'aTangent' | 'aArcS' | 'aIndex' | 'aPositionNext' | 'aTangentNext' | 'aArcSNext'
    from: 'positions' | 'tangents' | 'arcS' | 'index' | 'positionsNext' | 'tangentsNext' | 'arcSNext'
}

/**
 * Fixed-size pool of generic animation channels. Effects declare which
 * indices they consume via `PlaygroundConfig.animation.slots`; shaders
 * reference them as `uChan0..uChan{ANIMATION_CHANNEL_COUNT-1}`.
 *
 * Canonical layout (convention, not enforced):
 *   0 — primary phase driver (scroll / phase / progress)
 *   1 — radial offset / phase
 *   2 — width / size
 *   3 — spacing / glow
 *   4 — intensity (alpha)
 *   5 — noise time driver (see `src/pipeline/noise.glsl.ts`)
 *   6, 7 — free
 */
export const ANIMATION_CHANNEL_COUNT = 8

/**
 * One animation channel declaration. The runtime turns each declared slot
 * into a shader uniform `uChan{slot}` of type `vec4(drive, raw, value, state)`,
 * where `.x` is the upstream `Signal.value` (unclamped — Timer.unbounded
 * grows linearly, an Interpolator with sine/triangle profile oscillates
 * 0..1, a paused Timer holds a static phase), `.y` is the clamped 0..1
 * form of that drive, `.z` is the controller-mapped value
 * (`lerp(min, max, raw)`), and `.w` is the upstream state flag.
 *
 * Indices 0..ANIMATION_CHANNEL_COUNT-1 not present in the array still bind
 * `uChan{i}` with idle defaults so a shader can opt into any slot regardless
 * of whether the manifest mentions it.
 */
export type SlotDef = {
    /** Channel index in the animation pool (0..ANIMATION_CHANNEL_COUNT-1). */
    slot: number
    /** UI label shown by the AnimationController for this slot. */
    label: string
    /** Lower bound for the channel's mapped `value` (when `raw=0`). */
    defaultMin: number
    /** Upper bound for the channel's mapped `value` (when `raw=1`). */
    defaultMax: number
}

/**
 * Pool of generic texture channels the Effect node exposes
 * (`txcn0..txcn{TEXTURE_CHANNEL_COUNT-1}`). Effects declare which indices
 * they consume via `PlaygroundConfig.textures.slots`; shaders bind them
 * by declaring `uniform sampler2D uTxcn{i};`. Slots that the manifest
 * doesn't declare still exist on the Effect node — the user can wire any
 * texture into them and the shader can opt into any pool index.
 */
export const TEXTURE_CHANNEL_COUNT = 8

/**
 * One generic texture-channel declaration. Feeds the Effect node UI:
 * connected handles get a `txcn{i} · {label}` caption so the user knows
 * what the active effect expects in each slot.
 */
export type TextureSlotDef = {
    /** Channel index in the txcn pool (0..TEXTURE_CHANNEL_COUNT-1). */
    slot: number
    /** UI label shown next to the Effect node input handle for this slot
     *  (e.g. 'SDF (signed distance)', 'Atlas'). */
    label: string
}

/**
 * Declarative effect manifest. Describes:
 *   - what the effect node consumes (implicit through pass.requiresInputs);
 *   - parameters exposed to the user (`fields` + `staticUniforms`);
 *   - how to render it (`passes[]`, executed in order into a single output RT);
 *   - which animation channel slots it consumes (`animation.slots`);
 *   - which generic texture channels it consumes (`textures.slots`).
 *
 * The manifest is intentionally renderer-agnostic: it doesn't reference Pixi
 * types directly. The same JSON can be loaded by a Metal/Vulkan runtime that
 * provides equivalent shaders for each pass id.
 */
export type PlaygroundConfig = {
    name: string
    canvas: { width: number; height: number }
    fields: FieldDef[]
    staticUniforms?: Record<string, { value: number | number[]; type: UniformKind }>
    passes: EffectPass[]
    animation: {
        slots: SlotDef[]
    }
    /** Optional — when omitted the Effect node still shows 8 anonymous
     *  txcn handles, but with no captions to guide wiring. */
    textures?: {
        slots: TextureSlotDef[]
    }
}

export type CoordsTexture = {
    tex: Texture
    w: number
    h: number
    count: number
    minX: number
    minY: number
    maxX: number
    maxY: number
}

export type UniformEntries = Record<string, { value: number | number[]; type: UniformKind }>
