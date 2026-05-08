import type { Application, Geometry, RenderTexture } from 'pixi.js'

export const SLOT = {
    TEXTURE: 'TEXTURE',
    NUMBER: 'NUMBER',
    VEC: 'VEC',
    CONFIG: 'CONFIG',
    CONTOUR: 'CONTOUR',
    /** Discrete event source (programmatic emit / button). Carries a
     *  monotonically growing `count`; downstream nodes detect new events
     *  by comparing it against their last seen value. */
    EVENT: 'EVENT',
    /** Continuous 0..1 driver for one animation channel (typically produced by
     *  EnvelopeNode from an EVENT source, or by future timer / constant nodes). */
    SIGNAL: 'SIGNAL',
    /** Multi-channel animation packet consumed by Effect: per-channel
     *  ChannelSignal indexed by channel id (declared in the effect manifest). */
    ANIMATION: 'ANIMATION',
    /** Per-frame profiler frame emitted by EffectProcessor. Carries
     *  per-pass CPU build timing + total GPU dispatch time so a Log
     *  node can show where the budget goes. */
    METRICS: 'METRICS',
    /** Plain UTF-8 text payload. Emitted by the `text` input node and
     *  consumed by typography-aware nodes (e.g. `textStrip`). Always a
     *  string at the wire level — downstream nodes are free to coerce or
     *  truncate it. */
    TEXT: 'TEXT',
    /** Typography descriptor packet emitted by the `textStyle` node.
     *  Carries `TextStyle` ({ font, letterSpacing, weight, transform }).
     *  Kept distinct from `CONFIG` so users can't accidentally wire a
     *  text style into an `effect.config` slot. */
    TEXT_STYLE: 'TEXT_STYLE',
    ANY: '*',
} as const

export type SlotType = (typeof SLOT)[keyof typeof SLOT]

/** Discrete event source (e.g. EventEmitter button, programmatic dispatch). */
export interface EventSignal {
    /** Monotonically increasing event counter. Increases by 1 per emitted event. */
    count: number
    /** `performance.now()` timestamp of the last event, or 0 if no event has fired yet. */
    lastTimestampMs: number
    /** Last event coordinate in canvas pixels (optional, for hit-test). */
    lastX?: number
    lastY?: number
}

/** Continuous signal — output of EnvelopeNode, Timer, Interpolator, Combine, etc. */
export interface Signal {
    /** Current value. Typically 0..1 but unbounded sources (e.g. Timer
     *  in 'unbounded' mode driving a scroll phase) are allowed to return
     *  values outside that range — downstream nodes are responsible for
     *  interpreting them. */
    value: number
    /** Time in ms since the current clip started (0 if idle). */
    time: number
    /** Time in ms since the most recent event (regardless of clip state). */
    age: number
    /** 0 = idle (value at rest), 1 = playing (clip in progress). */
    state: 0 | 1
    /** Mirror of the originating EventSignal timestamp; useful when chained nodes
     *  need to sync to the same wall-clock. */
    lastTimestampMs: number
}

/** Per-channel value packed into AnimationSignal. */
export interface ChannelSignal {
    /** Upstream `Signal.value` (unclamped). Bound to `uChan{i}.x` in shaders.
     *  Note: this is intentionally the user-controlled drive (waveform output),
     *  NOT the upstream `Signal.time` ms — keeping it as drive is what makes
     *  a paused Timer actually freeze the channel and `unbounded` mode grow
     *  it linearly forever. Speed is therefore controlled upstream by
     *  `Timer.durationMs`. */
    time: number
    /** Raw upstream signal value clamped to 0..1. Bound to `uChan{i}.y`. */
    raw: number
    /** `lerp(min, max, raw)` — physical value ready to plug into the shader.
     *  Bound to `uChan{i}.z`. */
    value: number
    state: 0 | 1
}

/** Multi-channel signal flowing from AnimationController -> Effect. */
export interface AnimationSignal {
    channels: Record<string, ChannelSignal>
}

/** Typography descriptor flowing from `textStyle` to text-consuming nodes. */
export interface TextStyle {
    /** CSS font-family stack (e.g. `'"Inter", "Helvetica Neue", sans-serif'`). */
    font: string
    /** Extra space between glyphs in px. Negative tightens the tracking. */
    letterSpacing: number
    /** Font weight switch — kept binary on purpose; effects/runtimes only need
     *  to know whether to ask Canvas2D for a bold face. */
    weight: 'regular' | 'bold'
    /** Case transform applied before measuring/painting the string. `none`
     *  leaves it as-is, `upper`/`lower` use the locale-agnostic JS toUpperCase/
     *  toLowerCase. Cyrillic is handled correctly because both methods call
     *  the Unicode-aware default mappings. */
    transform: 'none' | 'upper' | 'lower'
}

/** Single-pass timing slice produced by EffectProcessor. */
export interface PassMetric {
    /** Manifest pass id (e.g. 'rays', 'ribbon'). */
    id: string
    kind: 'fullscreen' | 'instanced'
    /** CPU-side cost: building the mesh, geometry resampling, shader/uniform
     *  setup. This is where the bulk of per-frame work lives for instanced
     *  contour passes (resampling can dominate). */
    cpuMs: number
    /** True when input dependencies weren't met and the pass was elided.
     *  Useful for the Log view to show "skipped" with no timing bar. */
    skipped: boolean
}

/** Per-frame profiler payload from EffectProcessor → Log node. */
export interface EffectMetrics {
    /** Active effect manifest name. Logging UI uses this as the title. */
    effectName: string
    /** Wall-clock duration of the entire `execute()` call. */
    totalMs: number
    /** Sum of per-pass CPU build time. `totalMs - cpuMs` is roughly the
     *  GPU dispatch + uniform build cost. */
    cpuMs: number
    /** Single GPU dispatch (one `renderer.render` call drives the whole stage). */
    gpuDispatchMs: number
    passes: PassMetric[]
    /** `performance.now()` of the moment metrics were captured. Lets the
     *  log view detect staleness when the upstream effect stops ticking. */
    timestampMs: number
}

/**
 * Platform-agnostic resampled, smoothed, arc-length parameterized contour.
 * SoA layout so the buffers can be uploaded to GPU as per-instance attributes
 * without copy.
 */
export interface ContourSamples {
    version: 1
    closed: boolean
    count: number
    totalLength: number
    aabb: [number, number, number, number]
    positions: Float32Array
    tangents: Float32Array
    arcS: Float32Array
}


export interface HandleDef {
    name: string
    type: string
    label?: string
}

export interface ProcessorDef {
    type: string
    title: string
    /** Visual category — drives node and edge colour. Legacy values
     *  ('depth' | 'ai' | 'source' | 'process' | 'marigold' | 'dnf') are
     *  retained for snapshots saved before those processors were removed
     *  (mapped to fallback colours in categoryColors.ts). */
    category:
        | 'input'
        | 'animTrigger'
        | 'animMod'
        | 'animCtrl'
        | 'imageOp'
        | 'contour'
        | 'output'
        | 'util'
        // legacy
        | 'depth' | 'ai'
        | 'source' | 'process' | 'marigold' | 'dnf'
    inputs: HandleDef[]
    outputs: HandleDef[]
    defaultParams: Record<string, unknown>
    /** Hidden from the "Add Node" picker but still loadable from saved
     *  snapshots and creatable programmatically. Use for legacy nodes. */
    hidden?: boolean

    /**
     * Pure function of (inputs, params) — output deterministic and stable
     * across ticks. MUST NOT read wall-clock, unseeded RNG, event counts,
     * or any external mutable state. Used by packages/player/src/baking.ts
     * as the constant-folding eligibility gate; baked subgraphs run once
     * at export and their outputs land in SupplierConfig.baked.
     *
     * Default false. Counter-examples that look pure but aren't:
     *  - `segmentation` — SAM branch reads worker state (override branch
     *    is pure; bake step special-cases via hasPolygonOverride).
     *  - `effect` — alwaysDirty; output pixels change every frame.
     *  - `publishRoot` — pass-through, but it's the bake target itself.
     */
    pure?: boolean
}

export interface IDataflowEngine {
    readonly app: Application
    readonly defaultWidth: number
    readonly defaultHeight: number
    renderPass(fragment: string, resources: Record<string, unknown>, w?: number, h?: number): RenderTexture
    renderPassInto(target: RenderTexture, fragment: string, resources: Record<string, unknown>): void
    /** Shared fullscreen quad geometry. Engine-owned — DO NOT destroy. */
    getQuadGeometry(w: number, h: number): Geometry
    markDirty(nodeId: string): void
    getOutputs(nodeId: string): Record<string, unknown> | undefined
}
