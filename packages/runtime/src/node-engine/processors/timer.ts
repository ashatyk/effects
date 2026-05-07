/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type Signal } from '../types'

/**
 * `looped`    — phase wraps 0..1 every `durationMs` (saw-tooth with instant
 *               reset; the canonical scroll-phase source for shaders that
 *               apply a `mod()` themselves).
 * `unbounded` — `elapsed / durationMs` grows linearly forever; the canonical
 *               source for monotonic scroll-phase channels (e.g. ribbon
 *               `arcS` offset).
 *
 * Both modes report `state = 1` while the timer is running (`paused = false`).
 * When paused the elapsed-ms accumulator freezes so the resumed signal picks
 * up where it left off — there is no jump in phase across the pause boundary.
 */
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

/**
 * Plain time source. The previous `autoTimer` baked clock + waveform shaping
 * into a single node; `timer` carries only the clock half. To recover the old
 * behaviour wire a `timer` into an `interpolator` and pick a profile there.
 *
 * The output `Signal.value` is the timer's *phase*:
 *   - `looped`    → `frac(elapsed / durationMs)` ∈ [0, 1)
 *   - `unbounded` → `elapsed / durationMs` ∈ [0, +∞)
 *
 * `Signal.time` carries the same elapsed milliseconds the phase was derived
 * from so downstream nodes can read either form. Speed is governed by
 * `durationMs` — smaller value = faster phase growth.
 */
export class TimerProcessor extends BaseProcessor {
    readonly def = timerDef
    alwaysDirty = true

    private accumulatedMs = 0
    private lastTickMs: number | null = null
    /* Wall-clock at the timer's start. Captured on first execute and held
       constant across pauses / param edits — `Signal.lastTimestampMs` is
       defined as a stable origin reference for chained nodes that need to
       sync to wall-clock. Previously this was computed as `now - accumulated`
       on every tick, which spuriously drifted forward while paused (now
       grows but accumulated stays still), defeating the engine's diff-gated
       notify path for paused timers. */
    private startedAtMs: number | null = null

    /** Last emitted signal, exposed for UI live preview. Reused as the
     *  return value when the computed signal is bit-identical to the
     *  previous tick, so the engine's diff sees a stable reference. */
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

        /* Pause is implemented by skipping `dt` accumulation. The accumulator
           keeps its previous value so unpausing resumes from the same phase. */
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
