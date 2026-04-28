/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type PulseSignal, type Signal } from '../types'

export type EnvelopeShape = 'bell' | 'rise' | 'fall' | 'plateau' | 'gaussian' | 'triangle'
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
export type RetriggerMode = 'restart' | 'add' | 'max'

export const envelopeDef: ProcessorDef = {
    type: 'envelope',
    title: 'Envelope',
    category: 'animMod',
    inputs: [{ name: 'pulse', type: SLOT.PULSE }],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        shape: 'bell' as EnvelopeShape,
        durationMs: 600,
        peakTime: 0.5,         // 0..1, ratio of durationMs at which curve peaks (only used by asym shapes)
        plateauHold: 0.4,      // 0..1, fraction of duration spent at value=1 (plateau shape only)
        attackEasing: 'linear' as Easing,
        decayEasing: 'linear' as Easing,
        retriggerMode: 'restart' as RetriggerMode,
    },
}

export interface EnvelopeClip {
    startMs: number
}

export interface EnvelopeSnapshot {
    /** Active clips (mostly 0 or 1, more in `add`/`max` retriggerMode). */
    clips: EnvelopeClip[]
    /** Last computed signal — same value the controller sees this frame. */
    value: number
    /** The clip's full duration in ms (so the UI can scale time->x). */
    durationMs: number
    /** Current shape parameters — UI uses these to draw the curve. */
    shape: EnvelopeShape
    peakTime: number
    plateauHold: number
    attackEasing: Easing
    decayEasing: Easing
}

/**
 * Turn discrete pulses into a continuous 0..1 signal shaped by an activation
 * curve. Each pulse spawns a new clip; the curve is sampled per frame.
 *
 * `restart` keeps only the most recent clip (new tap aborts the previous).
 * `add` sums the contributions of every active clip (clamped to 1).
 * `max`  takes the maximum across active clips (best for caps that should
 *        never appear "pumped" by retriggers).
 */
export class EnvelopeProcessor extends BaseProcessor {
    readonly def = envelopeDef
    alwaysDirty = true

    private clips: EnvelopeClip[] = []
    private lastSeenPulseCount = -1
    private lastPulseTs = 0
    private snapshot: EnvelopeSnapshot = {
        clips: [],
        value: 0,
        durationMs: 600,
        shape: 'bell',
        peakTime: 0.5,
        plateauHold: 0.4,
        attackEasing: 'linear',
        decayEasing: 'linear',
    }

    /** Read-only current state — used by the NodeView to render the live
     *  envelope curve and play-head. */
    getSnapshot(): EnvelopeSnapshot {
        return this.snapshot
    }

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const shape = (params.shape ?? 'bell') as EnvelopeShape
        const durationMs = Math.max(1, Number(params.durationMs ?? 600) || 600)
        const peakTime = clamp01(Number(params.peakTime ?? 0.5))
        const plateauHold = clamp01(Number(params.plateauHold ?? 0.4))
        const attackEasing = (params.attackEasing ?? 'linear') as Easing
        const decayEasing = (params.decayEasing ?? 'linear') as Easing
        const retriggerMode = (params.retriggerMode ?? 'restart') as RetriggerMode

        const pulse = inputs.pulse as PulseSignal | null | undefined

        const now = performance.now()

        /* React to a new pulse: spawn a clip. */
        if (pulse && pulse.count > this.lastSeenPulseCount) {
            this.lastSeenPulseCount = pulse.count
            this.lastPulseTs = pulse.lastTimestampMs || now
            const clip: EnvelopeClip = { startMs: now }
            if (retriggerMode === 'restart') this.clips = [clip]
            else this.clips.push(clip)
        }

        /* Drop expired clips. */
        this.clips = this.clips.filter(c => now - c.startMs < durationMs)

        /* Sample each clip's curve, then fold via retrigger mode. */
        let value = 0
        let mostRecentT = 0
        for (const c of this.clips) {
            const t = (now - c.startMs) / durationMs   // 0..1
            const v = sampleShape(shape, t, peakTime, plateauHold, attackEasing, decayEasing)
            if (retriggerMode === 'add') value = Math.min(1, value + v)
            else if (retriggerMode === 'max') value = Math.max(value, v)
            else value = v // restart: only one clip anyway
            if (t > mostRecentT) mostRecentT = t
        }

        const state: 0 | 1 = this.clips.length > 0 ? 1 : 0
        const time = state === 1 ? mostRecentT * durationMs : 0
        const age = this.lastPulseTs > 0 ? now - this.lastPulseTs : 0
        const finalValue = clamp01(value)

        const signal: Signal = {
            value: finalValue,
            time,
            age,
            state,
            lastTimestampMs: this.lastPulseTs,
        }

        /* Publish a snapshot that the NodeView reads each frame to draw the
           live curve + play-head. We slice clips so external mutation cannot
           corrupt the processor's internal list. */
        this.snapshot = {
            clips: this.clips.slice(),
            value: finalValue,
            durationMs,
            shape, peakTime, plateauHold, attackEasing, decayEasing,
        }
        return { signal }
    }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v < 0) return 0
    if (v > 1) return 1
    return v
}

function ease(value: number, kind: Easing): number {
    const t = clamp01(value)
    switch (kind) {
        case 'linear': return t
        case 'easeIn':  return t * t
        case 'easeOut': return 1 - (1 - t) * (1 - t)
        case 'easeInOut': return 0.5 - 0.5 * Math.cos(Math.PI * t)
    }
}

export function sampleShape(
    shape: EnvelopeShape,
    t: number,
    peak: number,
    plateauHold: number,
    attackEasing: Easing,
    decayEasing: Easing,
): number {
    if (t <= 0) return 0
    if (t >= 1) return 0

    switch (shape) {
        case 'bell': {
            /* Symmetric "холмик": sine half-cycle. */
            return Math.sin(Math.PI * t)
        }
        case 'rise': {
            /* Climb from 0 to 1 with attack easing, then drop to 0 abruptly. */
            return ease(t, attackEasing)
        }
        case 'fall': {
            /* Already at peak at t=0+, fall to 0 with decay easing. */
            return 1 - ease(t, decayEasing)
        }
        case 'plateau': {
            /* Attack-Hold-Decay. peak ∈ [0..1] is the *centre* of the plateau,
               plateauHold is its width as a fraction of duration. */
            const half = plateauHold * 0.5
            const startHold = Math.max(0, peak - half)
            const endHold = Math.min(1, peak + half)
            if (t < startHold) return ease(t / startHold, attackEasing)
            if (t > endHold)   return 1 - ease((t - endHold) / Math.max(1e-3, 1 - endHold), decayEasing)
            return 1
        }
        case 'gaussian': {
            /* exp(-((t - peak) / σ)^2). σ chosen so curve hits ~0 at t=0,1. */
            const sigma = 0.25
            const z = (t - peak) / sigma
            return Math.exp(-z * z)
        }
        case 'triangle': {
            /* Symmetric triangle peaking at t = peak. */
            if (t < peak) return t / Math.max(1e-3, peak)
            return (1 - t) / Math.max(1e-3, 1 - peak)
        }
    }
}
