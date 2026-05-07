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

/**
 * Combines two SIGNAL inputs into one. Use to layer user input (envelope)
 * over an idle drive (timer + interpolator):
 *
 *   Timer → Interpolator ──┐
 *                          ├── Combine (mode = a_overrides_b) ──> Controller
 *   Envelope ──────────────┘
 *
 * Modes:
 *   - `add`            -> a + b (no clamping; controller handles range mapping).
 *   - `max`            -> max(a, b). Idle floor + active spikes on top.
 *   - `min`            -> min(a, b).
 *   - `multiply`       -> a * b.
 *   - `a_overrides_b`  -> when signal_a is active (state=1) use a, else b.
 *   - `b_overrides_a`  -> mirror of above.
 *   - `mix`            -> lerp(a, b, mixFactor). Static blend.
 *
 * Output `state` is 1 if either input is active.
 * Output `lastTimestampMs` is the more recent of the two.
 */
export class CombineSignalsProcessor extends BaseProcessor {
    readonly def = combineSignalsDef
    alwaysDirty = true

    /** Last emitted signal + the resolved inputs, exposed for UI preview. */
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
