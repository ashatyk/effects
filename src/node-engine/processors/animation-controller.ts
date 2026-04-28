/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import {
    SLOT, type ProcessorDef, type IDataflowEngine,
    type Signal, type AnimationSignal, type ChannelSignal,
} from '../types'

export interface ChannelDescriptor {
    id: string
    label: string
    defaultMin: number
    defaultMax: number
}

/**
 * Build a ProcessorDef for an animation controller bound to a fixed channel
 * vocabulary (one per effect class). The generated def has:
 *   - `signal_<channel>` inputs of SLOT.SIGNAL (all optional)
 *   - one `signal: SLOT.ANIMATION` output
 *   - per-channel params: `min_<channel>`, `max_<channel>`
 */
export function buildControllerDef(type: string, title: string, channels: ChannelDescriptor[]): ProcessorDef {
    const inputs = channels.map(c => ({ name: `signal_${c.id}`, type: SLOT.SIGNAL, label: c.id }))
    const defaultParams: Record<string, unknown> = {}
    for (const c of channels) {
        defaultParams[`min_${c.id}`] = c.defaultMin
        defaultParams[`max_${c.id}`] = c.defaultMax
    }
    return {
        type,
        title,
        category: 'animCtrl',
        inputs,
        outputs: [{ name: 'signal', type: SLOT.ANIMATION }],
        defaultParams,
    }
}

/**
 * Generic controller execute logic — produces an AnimationSignal by reading
 * each `signal_<channel>` input and folding it into a ChannelSignal via the
 * configured `min`/`max` mapping.
 */
export abstract class AnimationControllerProcessor extends BaseProcessor {
    alwaysDirty = true
    abstract readonly channels: ChannelDescriptor[]

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const out: AnimationSignal = { channels: {} }
        for (const c of this.channels) {
            const sig = inputs[`signal_${c.id}`] as Signal | null | undefined
            const minV = Number(params[`min_${c.id}`] ?? c.defaultMin)
            const maxV = Number(params[`max_${c.id}`] ?? c.defaultMax)
            const raw = sig ? clamp01(sig.value) : 0
            const value = lerp(minV, maxV, raw)
            const channelSignal: ChannelSignal = {
                time: sig?.time ?? 0,
                raw,
                value,
                state: (sig?.state ?? 0) as 0 | 1,
            }
            out.channels[c.id] = channelSignal
        }
        return { signal: out }
    }
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

/* ───── Class A: OrbitalRibbon ───── */
const RIBBON_CHANNELS: ChannelDescriptor[] = [
    { id: 'scroll',    label: 'Scroll',    defaultMin: 0, defaultMax: 600 },
    { id: 'radial',    label: 'Radial',    defaultMin: 0, defaultMax: 20 },
    { id: 'width',     label: 'Width',     defaultMin: 1, defaultMax: 2 },
    { id: 'spacing',   label: 'Spacing',   defaultMin: 1, defaultMax: 2 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
]
export const ribbonAnimControllerDef = buildControllerDef('ribbonAnimController', 'Ribbon Animation', RIBBON_CHANNELS)
export class RibbonAnimControllerProcessor extends AnimationControllerProcessor {
    readonly def = ribbonAnimControllerDef
    readonly channels = RIBBON_CHANNELS
}

/* ───── Class B: OrbitalParticles ───── */
const PARTICLES_CHANNELS: ChannelDescriptor[] = [
    { id: 'scroll',    label: 'Scroll',    defaultMin: 0, defaultMax: 600 },
    { id: 'radial',    label: 'Radial',    defaultMin: 0, defaultMax: 20 },
    { id: 'size',      label: 'Size',      defaultMin: 1, defaultMax: 2 },
    { id: 'glow',      label: 'Glow',      defaultMin: 1, defaultMax: 2 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
]
export const particlesAnimControllerDef = buildControllerDef('particlesAnimController', 'Particles Animation', PARTICLES_CHANNELS)
export class ParticlesAnimControllerProcessor extends AnimationControllerProcessor {
    readonly def = particlesAnimControllerDef
    readonly channels = PARTICLES_CHANNELS
}

/* ───── Class C: Fullscreen ───── */
const FULLSCREEN_CHANNELS: ChannelDescriptor[] = [
    { id: 'progress',  label: 'Progress',  defaultMin: 0, defaultMax: 1 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
    { id: 'phase',     label: 'Phase',     defaultMin: 0, defaultMax: 6.2831853 },
]
export const fullscreenAnimControllerDef = buildControllerDef('fullscreenAnimController', 'Fullscreen Animation', FULLSCREEN_CHANNELS)
export class FullscreenAnimControllerProcessor extends AnimationControllerProcessor {
    readonly def = fullscreenAnimControllerDef
    readonly channels = FULLSCREEN_CHANNELS
}
