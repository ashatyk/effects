/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type Signal } from '../types'

export const constantSignalDef: ProcessorDef = {
    pure: true,
    type: 'constantSignal',
    title: 'Constant Signal',
    category: 'input',
    inputs: [],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        value: 0,
        state: false,
    },
}

/**
 * Static SIGNAL source. Emits a fixed `value` every tick with `time / age =
 * 0` (no internal clock — the value is *constant*, not driven). The optional
 * `state` toggle lets the user simulate "clip in flight" so shaders that gate
 * behaviour on `uChan{i}.w` (envelope-driven highlights, etc.) can be
 * exercised without wiring a real `eventEmitter → envelope` chain.
 *
 * Use cases:
 *  - Pin a single AnimationController channel to a static value (fixed
 *    radial offset / size / intensity) without a Timer + Interpolator pair.
 *  - Disable a channel cleanly by feeding it `value = 0` (vs leaving it
 *    unwired, which already yields 0 — but a wired Constant makes the
 *    intent explicit in the graph).
 *  - Quick A/B compare in a shader: flip between two known values to see
 *    the visual delta without retuning Timer / Interpolator params.
 *
 * Pure function of params → not `alwaysDirty`. Param edits flow through
 * the engine's normal `updateNodeParams → markDirty` path.
 */
export class ConstantSignalProcessor extends BaseProcessor {
    readonly def = constantSignalDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const rawValue = Number(params.value ?? 0)
        const value = Number.isFinite(rawValue) ? rawValue : 0
        const state: 0 | 1 = params.state ? 1 : 0
        const signal: Signal = {
            value,
            time: 0,
            age: 0,
            state,
            lastTimestampMs: 0,
        }
        return { signal }
    }
}
