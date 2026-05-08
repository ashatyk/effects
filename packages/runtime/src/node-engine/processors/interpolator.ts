/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type Signal } from '../types'
import { sampleShape, type Easing } from './envelope'

// Every profile except `linear` takes phase = frac(input.value) so an unbounded
// timer drives the same 0..1 cycle a looped timer would. `linear` passes the
// unbounded value through untouched for shader scroll-phase consumers.
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
        stepCount: 4,
        teethCount: 4,
        dutyCycle: 0.5,
        smoothness: 0,
    },
}

const idleSignal = (): Signal => ({ value: 0, time: 0, age: 0, state: 0, lastTimestampMs: 0 })

// Pure shape-only complement to Timer: not alwaysDirty, ticks via upstream
// propagation. Idle output when nothing is wired so Controllers see lerp(min,max,0).
export class InterpolatorProcessor extends BaseProcessor {
    readonly def = interpolatorDef

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

// Exported so the NodeView can preview the curve at sub-frame resolution.
export function applyProfile(
    profile: InterpolatorProfile,
    inputValue: number,
    p: ProfileParams,
): number {
    if (!Number.isFinite(inputValue)) return p.reverse ? 1 : 0

    if (profile === 'linear') {
        return p.reverse ? 1 - inputValue : inputValue
    }

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

// smoothness 0→hard staircase, 1→linear ramp. Last step has no "next" and holds at 1.
function stepsProfile(phase: number, stepCount: number, smoothness: number): number {
    if (stepCount < 2) return 0
    const last = stepCount - 1
    const idxFloat = phase * stepCount
    const idx = Math.min(Math.floor(idxFloat), last)
    const baseValue = idx / last

    if (smoothness <= 1e-4) return baseValue

    const positionInStep = idxFloat - idx
    const transitionStart = 1 - smoothness
    if (positionInStep < transitionStart) return baseValue

    const nextValue = Math.min(idx + 1, last) / last
    const t = (positionInStep - transitionStart) / Math.max(1e-6, smoothness)
    const eased = t * t * (3 - 2 * t)
    return baseValue + (nextValue - baseValue) * eased
}

function squareProfile(phase: number, teethCount: number, dutyCycle: number, smoothness: number): number {
    if (teethCount < 1) return 0
    const c = (phase * teethCount) - Math.floor(phase * teethCount)

    if (smoothness <= 1e-4) return c < dutyCycle ? 1 : 0

    const e = Math.max(1e-4, smoothness * 0.5)
    const rising = smoothstep(-e, e, c)
    const falling = smoothstep(dutyCycle - e, dutyCycle + e, c)
    // nextRising: lifts the cycle boundary out of the low region so adjacent cycles connect smoothly.
    const nextRising = smoothstep(1 - e, 1 + e, c)
    return Math.max(0, Math.min(1, rising - falling + nextRising))
}

// smoothness 0→pure saw with instant drop, 1→symmetric triangle.
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
