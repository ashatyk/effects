/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type Signal } from '../types'
import { sampleShape, type Easing } from './envelope'

/**
 * Profile applied to the input signal's `value`.
 *
 * Continuous profiles:
 *   `linear`   — passthrough; preserves unbounded inputs without wrapping.
 *   `sine`     — `(1 − cos(2π·phase)) / 2`; seamless 0→1→0 oscillation.
 *   `triangle` — symmetric/asymmetric triangle peaking at `peakTime`.
 *   `bell`     — `sin(π·phase)`; smooth half-cycle.
 *   `gaussian` — bell with soft tails (σ ≈ 0.25).
 *   `pulse`    — attack-hold-decay; `peakTime` centres the plateau,
 *                `plateauHold` widens it (fraction of the period).
 *
 * Discrete / toothed profiles (driven by `smoothness ∈ [0, 1]` to fade
 * between hard discrete edges and a fully-smooth equivalent):
 *   `steps`    — staircase quantizer with `stepCount` levels evenly spaced
 *                from 0 to 1. At `smoothness=0` levels are flat with hard
 *                jumps; at `smoothness=1` the staircase smooths back into
 *                a linear ramp. Use for sprite frame counters and any
 *                "advance through N keyframes" animation.
 *   `square`   — pulse train with `teethCount` cycles per period and
 *                `dutyCycle` controlling the high-time fraction.
 *                `smoothness` feathers the rising/falling edges from
 *                square (0) to ~sine-like (1).
 *   `sawTeeth` — sawtooth pulse train with `teethCount` cycles per period.
 *                `smoothness` controls how much of each tooth becomes a
 *                downslope: 0 = pure saw with instant drop, 1 = perfect
 *                symmetric triangle.
 *
 * Every profile other than `linear` takes `phase = frac(input.value)` so an
 * `unbounded` timer feeds the same 0..1 cycle a `looped` timer would. Use
 * `linear` to passthrough unbounded values intact (e.g. for shader
 * scroll-phase consumers that apply their own `mod()`).
 */
export type InterpolatorProfile =
    | 'linear' | 'sine' | 'triangle' | 'bell' | 'gaussian' | 'pulse'
    | 'steps' | 'square' | 'sawTeeth'

export const interpolatorDef: ProcessorDef = {
    type: 'interpolator',
    title: 'Interpolator',
    category: 'animMod',
    inputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        profile: 'sine' as InterpolatorProfile,
        peakTime: 0.5,
        plateauHold: 0.4,
        easing: 'easeInOut' as Easing,
        reverse: false,
        /* Discrete-profile params. Defaults chosen so a freshly-switched
           discrete profile produces an immediately recognisable pattern. */
        stepCount: 4,
        teethCount: 4,
        dutyCycle: 0.5,
        smoothness: 0,
    },
}

const idleSignal = (): Signal => ({ value: 0, time: 0, age: 0, state: 0, lastTimestampMs: 0 })

/**
 * Shape-only complement to `Timer`. Takes a continuous SIGNAL whose `.value`
 * is interpreted as a phase and emits a SIGNAL whose `.value` is the profile
 * curve evaluated at that phase. Pure function of the input — no internal
 * clock, so it isn't `alwaysDirty`. Dirty propagation from an upstream
 * `alwaysDirty` source (Timer / Envelope / Combine) keeps it ticking.
 *
 * With no upstream signal wired the output is the idle signal and downstream
 * Controllers see `value = lerp(min, max, 0)`.
 */
export class InterpolatorProcessor extends BaseProcessor {
    readonly def = interpolatorDef

    /** Last emitted signal + the upstream signal it was derived from, exposed
     *  for the NodeView live preview. */
    lastSignal: Signal | null = null
    lastInput: Signal | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const profile = (params.profile ?? 'sine') as InterpolatorProfile
        const peakTime = clamp01(Number(params.peakTime ?? 0.5))
        const plateauHold = clamp01(Number(params.plateauHold ?? 0.4))
        const easing = (params.easing ?? 'easeInOut') as Easing
        const reverse = Boolean(params.reverse ?? false)
        const stepCount = clampInt(Number(params.stepCount ?? 4), 2, 64)
        const teethCount = clampInt(Number(params.teethCount ?? 4), 1, 64)
        const dutyCycle = clamp01(Number(params.dutyCycle ?? 0.5))
        const smoothness = clamp01(Number(params.smoothness ?? 0))

        const input = (inputs.signal as Signal | undefined) ?? null

        if (!input) {
            this.lastInput = null
            const idle = idleSignal()
            this.lastSignal = idle
            return { signal: idle }
        }

        const value = applyProfile(profile, input.value, {
            peakTime, plateauHold, easing, reverse,
            stepCount, teethCount, dutyCycle, smoothness,
        })

        const signal: Signal = {
            value,
            time: input.time,
            age: input.age,
            state: input.state,
            lastTimestampMs: input.lastTimestampMs,
        }
        this.lastInput = input
        this.lastSignal = signal
        return { signal }
    }
}

/** Bag of every per-profile parameter. The interpolator passes the full
 *  bag through `applyProfile` so the NodeView can sample the curve at
 *  sub-frame resolution without re-deriving the formula. */
export interface ProfileParams {
    peakTime: number
    plateauHold: number
    easing: Easing
    reverse: boolean
    stepCount: number
    teethCount: number
    dutyCycle: number
    smoothness: number
}

/**
 * Sample the interpolator at a given phase. Exported so the NodeView can
 * preview the curve at sub-frame resolution without duplicating the formula.
 *
 * `inputValue` is interpreted as a phase: `linear` passes it through verbatim,
 * everything else takes `frac(inputValue)` so unbounded inputs cycle. The
 * `reverse` flag mirrors the result vertically (`v → 1 − v`) and works
 * uniformly across every profile.
 */
export function applyProfile(
    profile: InterpolatorProfile,
    inputValue: number,
    p: ProfileParams,
): number {
    if (!Number.isFinite(inputValue)) return p.reverse ? 1 : 0

    if (profile === 'linear') {
        return p.reverse ? 1 - inputValue : inputValue
    }

    /* All non-linear profiles operate on a 0..1 phase. Wrap unbounded inputs
       with frac() so a Timer in `unbounded` mode still drives a clean cycle. */
    const phase = inputValue - Math.floor(inputValue)

    let v: number
    switch (profile) {
        case 'sine':     v = (1 - Math.cos(phase * Math.PI * 2)) * 0.5; break
        case 'triangle': v = sampleShape('triangle', phase, p.peakTime, p.plateauHold, p.easing, p.easing); break
        case 'bell':     v = sampleShape('bell',     phase, p.peakTime, p.plateauHold, p.easing, p.easing); break
        case 'gaussian': v = sampleShape('gaussian', phase, p.peakTime, p.plateauHold, p.easing, p.easing); break
        case 'pulse':    v = sampleShape('plateau',  phase, p.peakTime, p.plateauHold, p.easing, p.easing); break
        case 'steps':    v = stepsProfile(phase, p.stepCount, p.smoothness); break
        case 'square':   v = squareProfile(phase, p.teethCount, p.dutyCycle, p.smoothness); break
        case 'sawTeeth': v = sawTeethProfile(phase, p.teethCount, p.smoothness); break
        default:         v = 0
    }

    return p.reverse ? 1 - v : v
}

/**
 * Quantize the phase into `stepCount` discrete levels in [0, 1].
 *
 * `smoothness` blends between hard staircase (0) and a perfectly linear ramp
 * (1) — at intermediate values the last `smoothness × (1/stepCount)` of each
 * step is a smoothstep transition into the next level. The last step has no
 * "next" to ramp toward and holds at 1.
 */
function stepsProfile(phase: number, stepCount: number, smoothness: number): number {
    if (stepCount < 2) return 0
    const last = stepCount - 1
    const idxFloat = phase * stepCount
    const idx = Math.min(Math.floor(idxFloat), last)
    const baseValue = idx / last

    if (smoothness <= 1e-4) return baseValue

    const positionInStep = idxFloat - idx                       // [0, 1) within current step
    const transitionStart = 1 - smoothness                      // where smoothing kicks in
    if (positionInStep < transitionStart) return baseValue

    const nextValue = Math.min(idx + 1, last) / last
    const t = (positionInStep - transitionStart) / Math.max(1e-6, smoothness)
    const eased = t * t * (3 - 2 * t)                           // smoothstep
    return baseValue + (nextValue - baseValue) * eased
}

/**
 * Square pulse train with `teethCount` cycles per period.
 *
 * Within each cycle the wave is high (`1`) for `dutyCycle` of the cycle and
 * low (`0`) for the remainder. `smoothness` feathers both edges with a
 * smoothstep of half-width `smoothness × 0.5` (in cycle units) — the
 * rising edge wraps across the cycle boundary so neighbouring cycles
 * connect smoothly.
 */
function squareProfile(phase: number, teethCount: number, dutyCycle: number, smoothness: number): number {
    if (teethCount < 1) return 0
    const c = (phase * teethCount) - Math.floor(phase * teethCount) // [0, 1) within cycle

    if (smoothness <= 1e-4) return c < dutyCycle ? 1 : 0

    const e = Math.max(1e-4, smoothness * 0.5)
    const rising = smoothstep(-e, e, c)
    const falling = smoothstep(dutyCycle - e, dutyCycle + e, c)
    /* Next cycle's rising edge contribution — when c approaches 1 the next
       cycle starts climbing out of the low region so the boundary doesn't
       look like a discontinuity. */
    const nextRising = smoothstep(1 - e, 1 + e, c)
    return Math.max(0, Math.min(1, rising - falling + nextRising))
}

/**
 * Sawtooth pulse train with `teethCount` cycles per period. Pure saw is a
 * linear ramp from 0 to 1 with an instant drop back to 0 at the cycle
 * boundary. `smoothness` widens the falling slope: at `0` the drop is
 * instant, at `1` the cycle becomes a perfectly symmetric triangle.
 */
function sawTeethProfile(phase: number, teethCount: number, smoothness: number): number {
    if (teethCount < 1) return 0
    const c = (phase * teethCount) - Math.floor(phase * teethCount)

    if (smoothness <= 1e-4) return c

    const peakAt = 1 - smoothness
    if (c < peakAt) return c / Math.max(1e-6, peakAt)
    return 1 - (c - peakAt) / Math.max(1e-6, smoothness)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0))
    return t * t * (3 - 2 * t)
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}

function clampInt(v: number, min: number, max: number): number {
    if (!Number.isFinite(v)) return min
    const n = Math.round(v)
    if (n < min) return min
    if (n > max) return max
    return n
}
