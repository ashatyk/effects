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
 * Effect-node input names. Missing inputs either skip the pass
 * (hard deps: source/contour/txcn{i}) or bind a fallback (white texture
 * for unconnected txcn{i}). txcn0..txcn7 are eight generic texture inputs;
 * each manifest declares which it consumes via textures.slots and shaders
 * bind via `uniform sampler2D uTxcn{i};`.
 */
export type EffectInputName =
    | 'source'
    | 'txcn0' | 'txcn1' | 'txcn2' | 'txcn3'
    | 'txcn4' | 'txcn5' | 'txcn6' | 'txcn7'
    | 'contour'
    | 'pivot'

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
     * Resample the contour each frame so per-instance positions are
     * equally spaced and slide along the curve. Field names refer to
     * uniforms declared in PlaygroundConfig.fields.
     *
     * Modes:
     *   - 'glyph' (default): one instance per glyph anchored at a contour
     *     point; spacing = totalLength / (phraseLen * repeats) unless
     *     overridden by spacingField.
     *   - 'ribbon': one instance per *segment* (start/end pos+tangent)
     *     of length `segmentSize`px; UV.x = arc length so a horizontal
     *     texture stretches continuously across the curve.
     */
    scrolling?: {
        mode?: 'glyph' | 'ribbon'
        spacingField?: string
        phraseLenField?: string
        repeatsField?: string
        /** ribbon-mode only: arc length of one quad segment (px). */
        segmentSizeField?: string
        /** Animation slot driving the scroll-phase value (px). Defaults
         *  to slot 0 (canonical phase). Speed is governed upstream by
         *  Timer.durationMs / Controller min/max. */
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
 * Fixed-size animation channel pool. Shaders reference declared slots as
 * `uChan{i}` (i = 0..ANIMATION_CHANNEL_COUNT-1).
 *
 * Canonical layout (convention, not enforced):
 *   0 — primary phase (scroll / progress)
 *   1 — radial offset / phase
 *   2 — width / size
 *   3 — spacing / glow
 *   4 — intensity (alpha)
 *   5 — noise time (see noise.glsl.ts)
 *   6, 7 — free
 */
export const ANIMATION_CHANNEL_COUNT = 8

/**
 * One channel declaration. Bound as `uChan{slot} = vec4(drive, raw, value, state)`:
 *   .x = upstream Signal.value (unclamped)
 *   .y = clamped 0..1 of .x
 *   .z = controller-mapped lerp(min, max, raw)
 *   .w = upstream state flag
 *
 * Slots not declared still bind with idle defaults so shaders can opt
 * into any uChan{i} regardless of manifest.
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
 * Generic texture channel pool exposed by the Effect node
 * (`txcn0..txcn{TEXTURE_CHANNEL_COUNT-1}`). Shaders bind via
 * `uniform sampler2D uTxcn{i};`. Slots not declared by the manifest still
 * exist on the node so users can wire any texture into them.
 */
export const TEXTURE_CHANNEL_COUNT = 8

/** One texture-channel declaration. UI shows `txcn{i} · {label}`. */
export type TextureSlotDef = {
    slot: number
    label: string
}

/**
 * Declarative effect manifest — intentionally renderer-agnostic (no Pixi
 * types) so the same JSON can be loaded by a Metal/Vulkan runtime that
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

export type UniformEntries = Record<string, { value: number | number[]; type: UniformKind }>
