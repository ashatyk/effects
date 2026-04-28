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
 * deps: 'sdf', 'contour') or bound with a fallback resource (white texture
 * for textures, `uXEnabled = 0.0` flag for optional textures).
 */
export type EffectInputName =
    | 'source'
    | 'sdf'
    | 'depth' | 'depth_ref'
    | 'normals'
    | 'albedo' | 'roughness' | 'metallic'
    | 'atlas'
    | 'coords_tex'
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
        speedField: string
        phraseLenField?: string
        repeatsField?: string
        /** ribbon-mode only: arc length of one quad segment (px). */
        segmentSizeField?: string
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
 * Effect class — defines the standard set of animation channel ids the effect
 * may declare. Each class has a fixed channel vocabulary so a single
 * AnimationController-per-class can wire generically to any effect of the
 * same class.
 */
export type EffectClass = 'orbital-ribbon' | 'orbital-particles' | 'fullscreen'

/**
 * One animation channel declaration. The runtime turns each of these into a
 * shader uniform `uChan_<id>` of type `vec4(time_ms, raw, value, state)`.
 */
export type ChannelDef = {
    id: string                 // channel id (must belong to its EffectClass)
    label: string              // UI label in the controller
    /** Lower bound for the channel's mapped `value` (when `raw=0`). */
    defaultMin: number
    /** Upper bound for the channel's mapped `value` (when `raw=1`). */
    defaultMax: number
}

/**
 * Declarative effect manifest. Describes:
 *   - what the effect node consumes (implicit through pass.requiresInputs);
 *   - parameters exposed to the user (`fields` + `staticUniforms`);
 *   - how to render it (`passes[]`, executed in order into a single output RT);
 *   - which animation channels it consumes (`animation.channels`).
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
        class: EffectClass
        channels: ChannelDef[]
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
