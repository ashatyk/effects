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

// Emits a fixed value with time/age=0 (no internal clock). The `state` toggle
// simulates "clip in flight" so shaders gating on uChan{i}.w can be exercised
// without wiring a real eventEmitter → envelope chain. Pure → not alwaysDirty.
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
