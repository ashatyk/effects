import type { Application, RenderTexture } from 'pixi.js'

export const SLOT = {
    TEXTURE: 'TEXTURE',
    POLYGON: 'POLYGON',
    NUMBER: 'NUMBER',
    VEC: 'VEC',
    DEPTH_RAW: 'DEPTH_RAW',
    CONFIG: 'CONFIG',
    CONTOUR: 'CONTOUR',
    /** Discrete event source (tap, programmatic fire). Carries a monotonically
     *  growing `count`; downstream nodes detect new pulses by comparing it
     *  against their last seen value. */
    PULSE: 'PULSE',
    /** Continuous 0..1 driver for one animation channel (typically produced by
     *  EnvelopeNode from a PULSE source, or by future timer / constant nodes). */
    SIGNAL: 'SIGNAL',
    /** Multi-channel animation packet consumed by Effect: per-channel
     *  ChannelSignal indexed by channel id (declared in the effect manifest). */
    ANIMATION: 'ANIMATION',
    ANY: '*',
} as const

export type SlotType = (typeof SLOT)[keyof typeof SLOT]

/** Discrete pulse source (e.g. user tap). */
export interface PulseSignal {
    /** Monotonically increasing impulse counter. Increases by 1 per fired pulse. */
    count: number
    /** `performance.now()` timestamp of the last pulse, or 0 if no pulse fired yet. */
    lastTimestampMs: number
    /** Last pulse coordinate in canvas pixels (optional, for hit-test). */
    lastX?: number
    lastY?: number
}

/** Continuous signal — output of EnvelopeNode, AutoTimer, Combine, etc. */
export interface Signal {
    /** Current value. Typically 0..1 but unbounded sources (e.g. AutoTimer
     *  in 'unbounded' mode driving a scroll phase) are allowed to return
     *  values outside that range — downstream nodes are responsible for
     *  interpreting them. */
    value: number
    /** Time in ms since the current clip started (0 if idle). */
    time: number
    /** Time in ms since the most recent pulse (regardless of clip state). */
    age: number
    /** 0 = idle (value at rest), 1 = playing (clip in progress). */
    state: 0 | 1
    /** Mirror of the originating PulseSignal timestamp; useful when chained nodes
     *  need to sync to the same wall-clock. */
    lastTimestampMs: number
}

/** Per-channel value packed into AnimationSignal. */
export interface ChannelSignal {
    /** Time in ms since this channel's clip started. */
    time: number
    /** Raw upstream signal value (0..1) — useful for shader-side compounding. */
    raw: number
    /** mix(min, max, raw) — physical value ready to plug into the shader. */
    value: number
    state: 0 | 1
}

/** Multi-channel signal flowing from AnimationController -> Effect. */
export interface AnimationSignal {
    channels: Record<string, ChannelSignal>
}

export interface DepthRawData {
    data: Uint8Array
    width: number
    height: number
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
    /**
     * Visual category — drives node border colour and edge colour. Aligned
     * with the "Add Node" menu groups so a node's tint matches the section
     * it was picked from.
     *
     * Legacy values ('source', 'process', 'marigold', 'dnf') are retained
     * for backward compatibility with persisted scenes saved before the
     * re-categorisation; they are mapped to current colours in
     * `categoryColors.ts`.
     */
    category:
        | 'input'
        | 'animTrigger'
        | 'animMod'
        | 'animCtrl'
        | 'imageOp'
        | 'contour'
        | 'depth'
        | 'ai'
        | 'output'
        | 'util'
        // legacy
        | 'source' | 'process' | 'marigold' | 'dnf'
    inputs: HandleDef[]
    outputs: HandleDef[]
    defaultParams: Record<string, unknown>
    /**
     * When true the processor is hidden from the "Add Node" picker. It can
     * still be loaded from saved snapshots and instantiated programmatically;
     * only the UI catalog filters it out. Use for legacy / superseded nodes.
     */
    hidden?: boolean
}

export interface IDataflowEngine {
    readonly app: Application
    readonly defaultWidth: number
    readonly defaultHeight: number
    renderPass(fragment: string, resources: Record<string, unknown>, w?: number, h?: number): RenderTexture
    renderPassInto(target: RenderTexture, fragment: string, resources: Record<string, unknown>): void
    markDirty(nodeId: string): void
    getOutputs(nodeId: string): Record<string, unknown> | undefined
}
