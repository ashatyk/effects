/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal } from '../types'

export type CombineMode = 'add' | 'max' | 'min' | 'multiply' | 'a_overrides_b' | 'b_overrides_a' | 'mix'

export const combineSignalsDef: ProcessorDef = {
    type: 'combineSignals',
    title: 'Combine Signals',
    category: 'animMod',
    inputs: [
        { name: 'signal_a', type: SLOT.SIGNAL },
        { name: 'signal_b', type: SLOT.SIGNAL },
    ],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        mode: 'a_overrides_b' as CombineMode,
        mixFactor: 0.5,
    },
}

const idleSignal = (): Signal => ({ value: 0, time: 0, age: 0, state: 0, lastTimestampMs: 0 })

// Output state=1 when either input is active; lastTimestampMs is the newer of the two.
// `add` does NOT clamp — the downstream controller handles range mapping.
export class CombineSignalsProcessor extends BaseProcessor {
    readonly def = combineSignalsDef
    alwaysDirty = true

    lastSignal: Signal | null = null
    lastA: Signal | null = null
    lastB: Signal | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const a: Signal = (inputs.signal_a as Signal | undefined) ?? idleSignal()
        const b: Signal = (inputs.signal_b as Signal | undefined) ?? idleSignal()

        const mode = (params.mode ?? 'a_overrides_b') as CombineMode
        const mixFactor = Math.max(0, Math.min(1, Number(params.mixFactor ?? 0.5) || 0))

        let value = 0
        switch (mode) {
            case 'add':
                value = a.value + b.value
                break
            case 'max':
                value = Math.max(a.value, b.value)
                break
            case 'min':
                value = Math.min(a.value, b.value)
                break
            case 'multiply':
                value = a.value * b.value
                break
            case 'a_overrides_b':
                value = a.state === 1 ? a.value : b.value
                break
            case 'b_overrides_a':
                value = b.state === 1 ? b.value : a.value
                break
            case 'mix':
                value = a.value * (1 - mixFactor) + b.value * mixFactor
                break
        }

        const state: 0 | 1 = (a.state === 1 || b.state === 1) ? 1 : 0
        const lastTimestampMs = Math.max(a.lastTimestampMs, b.lastTimestampMs)
        const time = Math.max(a.time, b.time)
        const age = Math.min(a.age || Number.POSITIVE_INFINITY, b.age || Number.POSITIVE_INFINITY)

        const signal: Signal = {
            value,
            time,
            age: Number.isFinite(age) ? age : 0,
            state,
            lastTimestampMs,
        }
        this.lastA = a
        this.lastB = b
        this.lastSignal = signal
        return { signal }
    }
}
