/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import {
    SLOT, type ProcessorDef, type IDataflowEngine,
    type Signal, type AnimationSignal, type ChannelSignal,
} from '../types'
import { ANIMATION_CHANNEL_COUNT, type SlotDef } from '../../pipeline/types'
import { effects } from '../../effects'

// Channels are positional: signal_i carries the 0..1 driver, min_i/max_i map
// it to the physical range. `config` is optional and supplies per-effect slot
// metadata so the UI can show effect-specific labels and default mins/maxes.
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

    // Reference-stable channel cache: identical (time, raw, value, state) returns the
    // same ChannelSignal object so the engine's diff-gated notify path bails at Object.is.
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

            // User params override slot defaults; falls back to 0..1 with no Config wired.
            const minRaw = params[`min_${i}`]
            const maxRaw = params[`max_${i}`]
            const minV = minRaw !== undefined ? Number(minRaw) : (slot?.defaultMin ?? 0)
            const maxV = maxRaw !== undefined ? Number(maxRaw) : (slot?.defaultMax ?? 1)

            const raw = sig ? clamp01(sig.value) : 0
            const value = lerp(minV, maxV, raw)
            // ChannelSignal.time carries Signal.value (unclamped phase), NOT Signal.time.
            // Signal.time keeps growing through pauses; uChan{i}.x must reflect the user-
            // controlled waveform (paused timer → static, sine → oscillates, unbounded → grows).
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

        // Reuse the prevAnimation ref when every channel matched so the engine's
        // top-level diff short-circuits at Object.is.
        if (!anyChanged && this.prevAnimation) {
            return { animation: this.prevAnimation }
        }
        const animation: AnimationSignal = { channels }
        this.prevAnimation = animation
        return { animation }
    }
}
