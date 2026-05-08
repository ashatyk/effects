/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type EventSignal, type Signal } from '../types'

export type EnvelopeShape = 'bell' | 'rise' | 'fall' | 'plateau' | 'gaussian' | 'triangle'
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
export type RetriggerMode = 'restart' | 'add' | 'max'

export const envelopeDef: ProcessorDef = {
    type: 'envelope',
    title: 'Envelope',
    category: 'animMod',
    inputs: [{ name: 'event', type: SLOT.EVENT }],
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
    clips: EnvelopeClip[]
    value: number
    durationMs: number
    shape: EnvelopeShape
    peakTime: number
    plateauHold: number
    attackEasing: Easing
    decayEasing: Easing
}

// restart: only the most recent clip is kept; add: clips sum (clamped to 1);
// max: clips fold via Math.max (avoids retrigger-pumping).
export class EnvelopeProcessor extends BaseProcessor {
    readonly def = envelopeDef
    alwaysDirty = true

    private clips: EnvelopeClip[] = []
    private lastSeenEventCount = -1
    private lastEventTs = 0
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

        const event = inputs.event as EventSignal | null | undefined

        const now = performance.now()

        if (event && event.count > this.lastSeenEventCount) {
            this.lastSeenEventCount = event.count
            this.lastEventTs = event.lastTimestampMs || now
            const clip: EnvelopeClip = { startMs: now }
            if (retriggerMode === 'restart') this.clips = [clip]
            else this.clips.push(clip)
        }

        this.clips = this.clips.filter(c => now - c.startMs < durationMs)

        let value = 0
        let mostRecentT = 0
        for (const c of this.clips) {
            const t = (now - c.startMs) / durationMs
            const v = sampleShape(shape, t, peakTime, plateauHold, attackEasing, decayEasing)
            if (retriggerMode === 'add') value = Math.min(1, value + v)
            else if (retriggerMode === 'max') value = Math.max(value, v)
            else value = v
            if (t > mostRecentT) mostRecentT = t
        }

        const state: 0 | 1 = this.clips.length > 0 ? 1 : 0
        const time = state === 1 ? mostRecentT * durationMs : 0
        const age = this.lastEventTs > 0 ? now - this.lastEventTs : 0
        const finalValue = clamp01(value)

        const signal: Signal = {
            value: finalValue,
            time,
            age,
            state,
            lastTimestampMs: this.lastEventTs,
        }

        // slice() so consumers can't mutate the processor's internal clip list.
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
            return Math.sin(Math.PI * t)
        }
        case 'rise': {
            return ease(t, attackEasing)
        }
        case 'fall': {
            return 1 - ease(t, decayEasing)
        }
        case 'plateau': {
            // peak is the plateau centre; plateauHold its width (fraction of duration).
            const half = plateauHold * 0.5
            const startHold = Math.max(0, peak - half)
            const endHold = Math.min(1, peak + half)
            if (t < startHold) return ease(t / startHold, attackEasing)
            if (t > endHold)   return 1 - ease((t - endHold) / Math.max(1e-3, 1 - endHold), decayEasing)
            return 1
        }
        case 'gaussian': {
            // σ=0.25 so curve reaches ~0 at t=0,1.
            const sigma = 0.25
            const z = (t - peak) / sigma
            return Math.exp(-z * z)
        }
        case 'triangle': {
            if (t < peak) return t / Math.max(1e-3, peak)
            return (1 - t) / Math.max(1e-3, 1 - peak)
        }
    }
}
