/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type Signal } from '../types'

// looped: phase wraps 0..1 every durationMs (saw-tooth, canonical scroll-phase).
// unbounded: elapsed/durationMs grows monotonically (e.g. ribbon arcS offset).
// state=1 while running; pausing freezes the accumulator so resume continues phase.
export type TimerMode = 'looped' | 'unbounded'

export const timerDef: ProcessorDef = {
    type: 'timer',
    title: 'Timer',
    category: 'animTrigger',
    inputs: [],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        mode: 'looped' as TimerMode,
        durationMs: 2000,
        phaseOffsetMs: 0,
        paused: false,
    },
}

// Clock-only time source: pair with Interpolator for waveform shaping.
// Signal.value is the phase (looped=frac, unbounded=ratio); Signal.time
// carries elapsed ms so downstream can read either form.
export class TimerProcessor extends BaseProcessor {
    readonly def = timerDef
    alwaysDirty = true

    private accumulatedMs = 0
    private lastTickMs: number | null = null
    // Stable wall-clock origin captured on first execute. Must NOT be recomputed
    // as `now - accumulated`: that drifts forward while paused and breaks the
    // engine's diff-gated notify path for paused timers.
    private startedAtMs: number | null = null

    // Reused when the computed signal is identical to the previous tick so
    // the engine's outputsEqual diff sees a stable reference.
    lastSignal: Signal | null = null

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const mode = (params.mode ?? 'looped') as TimerMode
        const durationMs = Math.max(1, Number(params.durationMs ?? 2000) || 2000)
        const phaseOffsetMs = Number(params.phaseOffsetMs ?? 0) || 0
        const paused = Boolean(params.paused ?? false)

        const now = performance.now()
        if (this.lastTickMs == null) this.lastTickMs = now
        if (this.startedAtMs == null) this.startedAtMs = now
        const dt = now - this.lastTickMs
        this.lastTickMs = now

        if (!paused) this.accumulatedMs += dt

        const elapsed = this.accumulatedMs + phaseOffsetMs
        const raw = elapsed / durationMs
        const value = mode === 'unbounded' ? raw : raw - Math.floor(raw)
        const state: 0 | 1 = paused ? 0 : 1

        const prev = this.lastSignal
        if (
            prev &&
            prev.value === value &&
            prev.time === elapsed &&
            prev.age === elapsed &&
            prev.state === state &&
            prev.lastTimestampMs === this.startedAtMs
        ) {
            return { signal: prev }
        }

        const signal: Signal = {
            value,
            time: elapsed,
            age: elapsed,
            state,
            lastTimestampMs: this.startedAtMs,
        }
        this.lastSignal = signal
        return { signal }
    }
}
