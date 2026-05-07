/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import {
    SLOT, type ProcessorDef, type IDataflowEngine,
    type Signal, type AnimationSignal, type ChannelSignal,
} from '../types'
import { ANIMATION_CHANNEL_COUNT, type SlotDef } from '../../pipeline/types'
import { effects } from '../../effects'

/**
 * Build the input/output schema and default params for the universal
 * AnimationController. Channels are purely positional: `signal_0..signal_{N-1}`
 * carry the raw 0..1 driver, `min_i`/`max_i` map it to the physical range.
 *
 * The trailing `config` input is optional and supplies per-effect slot
 * metadata (label, default min/max) so the controller's UI can show the
 * right names without hard-coding a vocabulary.
 */
function buildControllerDef(): ProcessorDef {
    const inputs = [
        ...Array.from({ length: ANIMATION_CHANNEL_COUNT }, (_, i) => ({
            name: `signal_${i}`,
            type: SLOT.SIGNAL,
            label: `ch${i}`,
        })),
        { name: 'config', type: SLOT.CONFIG, label: 'config' },
    ]
    const defaultParams: Record<string, unknown> = {}
    for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
        defaultParams[`min_${i}`] = 0
        defaultParams[`max_${i}`] = 1
    }
    return {
        type: 'animationController',
        title: 'Animation Controller',
        category: 'animCtrl',
        inputs,
        outputs: [{ name: 'animation', type: SLOT.ANIMATION }],
        defaultParams,
    }
}

export const animationControllerDef = buildControllerDef()

/**
 * Look up the slot defaults for the effect named in the upstream config.
 * Returns an empty array when the input is absent or the effect is unknown,
 * which makes the controller behave as a pure "0..1 → params" mapper.
 */
function resolveSlots(configIn: unknown): SlotDef[] {
    if (!configIn || typeof configIn !== 'object') return []
    const name = (configIn as Record<string, unknown>).__effectName
    if (typeof name !== 'string') return []
    const effect = effects.find(e => e.name === name)
    return effect?.animation?.slots ?? []
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v < 0) return 0
    if (v > 1) return 1
    return v
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

export class AnimationControllerProcessor extends BaseProcessor {
    readonly def = animationControllerDef
    alwaysDirty = true

    /* Per-channel ref cache. When a channel's (time, raw, value, state)
       quad is bit-identical to the previous tick, we hand the engine the
       SAME ChannelSignal object — so the engine's diff-gated notify path
       sees Object.is matches inside `animation.channels[k]` and bails
       out without notifying React subscribers. */
    private prevChannels: (ChannelSignal | null)[] = new Array(ANIMATION_CHANNEL_COUNT).fill(null)
    private prevAnimation: AnimationSignal | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const slots = resolveSlots(inputs.config)
        const slotByIndex = new Map<number, SlotDef>(slots.map(s => [s.slot, s]))

        const channels: Record<string, ChannelSignal> = {}
        let anyChanged = false
        for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
            const sig = inputs[`signal_${i}`] as Signal | null | undefined
            const slot = slotByIndex.get(i)

            /* User-set params take priority; otherwise we honour the slot's
               manifest defaults so the curve stays semantic when the user
               hasn't tweaked anything. Falls back to 0..1 when neither
               source has values (no upstream Config wired). */
            const minRaw = params[`min_${i}`]
            const maxRaw = params[`max_${i}`]
            const minV = minRaw !== undefined ? Number(minRaw) : (slot?.defaultMin ?? 0)
            const maxV = maxRaw !== undefined ? Number(maxRaw) : (slot?.defaultMax ?? 1)

            const raw = sig ? clamp01(sig.value) : 0
            const value = lerp(minV, maxV, raw)
            /* `.time` carries the upstream signal *value* (unclamped) rather
               than the upstream `Signal.time` field. `Signal.time` from a
               Timer keeps growing whether the timer is paused or not, so a
               shader reading `uChan{i}.x` would animate regardless of the
               user's chosen waveform. The signal's *value* is what the user
               actually controls (paused timer → static phase, Interpolator
               sine → oscillates, Timer unbounded → grows linearly); shaders
               that need monotonic phase drive a Timer in `unbounded` mode
               and tune `durationMs` to control speed. */
            const time = sig?.value ?? 0
            const state = (sig?.state ?? 0) as 0 | 1

            const prev = this.prevChannels[i]
            if (
                prev &&
                prev.time === time &&
                prev.raw === raw &&
                prev.value === value &&
                prev.state === state
            ) {
                channels[String(i)] = prev
            } else {
                const cs: ChannelSignal = { time, raw, value, state }
                this.prevChannels[i] = cs
                channels[String(i)] = cs
                anyChanged = true
            }
        }

        /* When every channel kept its previous reference, hand back the
           previous AnimationSignal too so the engine's top-level diff
           short-circuits at Object.is — no recursion into channels. */
        if (!anyChanged && this.prevAnimation) {
            return { animation: this.prevAnimation }
        }
        const animation: AnimationSignal = { channels }
        this.prevAnimation = animation
        return { animation }
    }
}
