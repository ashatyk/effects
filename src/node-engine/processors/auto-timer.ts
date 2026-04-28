/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal } from '../types'
import { sampleShape, type Easing } from './envelope'

/**
 * Built-in waveforms. The first two are intentionally discontinuous at the
 * period boundary — they are the right choice for scroll-phase channels where
 * a `mod()` in the shader handles the wrap. The rest are seamless: they start
 * and end at 0, peak somewhere in between (controllable via `peakTime` for
 * asymmetric shapes), and pass through `sampleShape` so the easing knobs
 * behave the same as in EnvelopeNode.
 */
export type AutoTimerMode =
    | 'constant'   // static value
    | 'linear'     // 0→1 ramp, instant reset to 0 each period (good for scroll-phase)
    | 'unbounded'  // elapsed / duration, no wrap (good for unbounded scroll)
    | 'sine'       // (1 - cos(2π t)) / 2  — seamless smooth pulse
    | 'triangle'   // 0→1→0, linear
    | 'bell'       // 0→1→0, smooth (peak at peakTime)
    | 'gaussian'   // bell-curve with soft tails
    | 'pulse'      // plateau: ramp up, hold at 1, ramp down

export const autoTimerDef: ProcessorDef = {
    type: 'autoTimer',
    title: 'Auto Timer',
    category: 'animTrigger',
    inputs: [],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        mode: 'sine' as AutoTimerMode,
        durationMs: 2000,
        phaseOffsetMs: 0,
        constantValue: 0.5,
        peakTime: 0.5,
        plateauHold: 0.4,
        easing: 'easeInOut' as Easing,
        reverse: false,
    },
}

/**
 * Continuous signal source — runs without any user interaction. Use this
 * upstream of an AnimationController to keep an effect animating idle
 * (scroll, breathe, drift) before the first tap arrives.
 *
 * The output `value` is generally in 0..1, with two exceptions: `unbounded`
 * grows linearly forever (consumed by scroll-phase channels via shader-side
 * `mod()`), and downstream Combine nodes in `add` mode can lift values above
 * 1 — the controller's `mix(min, max, raw)` handles range scaling either way.
 */
export class AutoTimerProcessor extends BaseProcessor {
    readonly def = autoTimerDef
    alwaysDirty = true

    private startMs: number | null = null
    /** Last emitted signal, exposed for UI live preview. */
    lastSignal: Signal | null = null

    execute(_inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const mode = (params.mode ?? 'sine') as AutoTimerMode
        const durationMs = Math.max(1, Number(params.durationMs ?? 2000) || 2000)
        const phaseOffsetMs = Number(params.phaseOffsetMs ?? 0) || 0
        const constantValue = Number(params.constantValue ?? 0.5) || 0
        const peakTime = clamp01(Number(params.peakTime ?? 0.5) || 0)
        const plateauHold = clamp01(Number(params.plateauHold ?? 0.4) || 0)
        const easing = (params.easing ?? 'easeInOut') as Easing
        const reverse = Boolean(params.reverse ?? false)

        const now = performance.now()
        if (this.startMs == null) this.startMs = now

        const elapsed = (now - this.startMs) + phaseOffsetMs
        const value = computeValue(mode, elapsed, durationMs, constantValue, peakTime, plateauHold, easing, reverse)

        const signal: Signal = {
            value,
            time: elapsed,
            age: elapsed,
            state: 1,
            lastTimestampMs: this.startMs,
        }
        this.lastSignal = signal
        return { signal }
    }
}

/**
 * Sample the timer's waveform at a given absolute elapsed time.
 *
 * Exported so the UI can preview the curve at sub-frame resolution without
 * duplicating the formula. `t` here is the same `elapsed` value the runtime
 * computes, in milliseconds. When `reverse` is true, the value is mirrored
 * vertically (1 − v), which works uniformly across all modes:
 *   - `linear`:    1→0 saw with instant reset (scroll in reverse)
 *   - `sine`:      cos-shaped 1→0→1 instead of 0→1→0
 *   - `triangle/bell/gaussian/pulse`: well dipping to 0 at peak instead of peak rising to 1
 *   - `unbounded`: 1 − growth (decreasing scroll/scrub)
 *   - `constant`:  inverted constant
 */
export function computeValue(
    mode: AutoTimerMode,
    elapsedMs: number,
    durationMs: number,
    constantValue: number,
    peakTime: number,
    plateauHold: number,
    easing: Easing,
    reverse: boolean = false,
): number {
    const v = computeRaw(mode, elapsedMs, durationMs, constantValue, peakTime, plateauHold, easing)
    return reverse ? 1 - v : v
}

function computeRaw(
    mode: AutoTimerMode,
    elapsedMs: number,
    durationMs: number,
    constantValue: number,
    peakTime: number,
    plateauHold: number,
    easing: Easing,
): number {
    if (mode === 'constant') return constantValue
    if (mode === 'unbounded') return elapsedMs / durationMs

    /* All looping modes operate on a normalised phase 0..1 within one period. */
    const raw = elapsedMs / durationMs
    const phase = raw - Math.floor(raw)

    if (mode === 'linear') return phase
    if (mode === 'sine') return (1 - Math.cos(phase * Math.PI * 2)) * 0.5

    /* Smooth shapes: defer to envelope's sampleShape. */
    if (mode === 'triangle') return sampleShape('triangle', phase, peakTime, plateauHold, easing, easing)
    if (mode === 'bell')     return sampleShape('bell',     phase, peakTime, plateauHold, easing, easing)
    if (mode === 'gaussian') return sampleShape('gaussian', phase, peakTime, plateauHold, easing, easing)
    if (mode === 'pulse')    return sampleShape('plateau',  phase, peakTime, plateauHold, easing, easing)

    return 0
}

function clamp01(v: number): number {
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}
