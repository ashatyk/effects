/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type EffectMetrics, type PassMetric } from '../types'

export const logDef: ProcessorDef = {
    type: 'log',
    title: 'Log',
    category: 'util',
    inputs: [{ name: 'metrics', type: SLOT.METRICS }],
    outputs: [],
    defaultParams: {
        /* Exponential moving average smoothing factor; 0 = no smoothing
           (always show last frame), 1 = freeze at first frame. ~0.85 is
           a good default — reads the trend without flickering. */
        smoothing: 0.85,
    },
}

/**
 * Pure sink: consumes EffectMetrics frames and remembers a smoothed
 * snapshot for the view layer to display. The view subscribes via
 * `engine.subscribeNode(id, ...)` and reads `lastSmoothed`.
 *
 * We avoid keeping a long history here — that's UI-side state. The
 * processor only owns the EMA so values stay coherent across the
 * editor's react re-renders (which can drop intermediate frames).
 */
export class LogProcessor extends BaseProcessor {
    readonly def = logDef
    /* Not alwaysDirty: rides upstream propagation. When an animation
       source is wired into Effect (Timer / AnimationController / ...),
       Effect re-renders every frame and emits a fresh `metrics` packet,
       which marks Log dirty downstream. When nothing animates, Effect
       sleeps and Log sleeps with it — no need to spam `setSnapshot`
       at idle. The Log view shows the last received frame. */

    /** Most recent raw frame, exactly as the upstream Effect emitted it. */
    last: EffectMetrics | null = null
    /** EMA-smoothed mirror of `last` — same shape, lerped totals. */
    lastSmoothed: EffectMetrics | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const m = inputs.metrics as EffectMetrics | undefined
        if (!m) {
            this.last = null
            this.lastSmoothed = null
            return {}
        }
        this.last = m

        /* Smoothing factor lives in 0..1; > 0.99 collapses to "freeze"
           which is rarely useful — clamp to a safe range. */
        const a = clamp(Number(params.smoothing ?? 0.85), 0, 0.99)
        this.lastSmoothed = mergeMetrics(this.lastSmoothed, m, a)
        return {}
    }
}

function mergeMetrics(prev: EffectMetrics | null, next: EffectMetrics, alpha: number): EffectMetrics {
    if (!prev || prev.effectName !== next.effectName || prev.passes.length !== next.passes.length) {
        /* Effect changed (or first frame) → no meaningful history to
           blend with. Reset to the new value to avoid showing a
           cross-effect average for a few frames. */
        return next
    }
    const blend = (a: number, b: number) => a * alpha + b * (1 - alpha)
    const passes: PassMetric[] = next.passes.map((p, i) => {
        const old = prev.passes[i]
        if (!old || old.id !== p.id) return p
        return {
            id: p.id,
            kind: p.kind,
            skipped: p.skipped,
            cpuMs: blend(old.cpuMs, p.cpuMs),
        }
    })
    return {
        effectName: next.effectName,
        timestampMs: next.timestampMs,
        totalMs:        blend(prev.totalMs,        next.totalMs),
        cpuMs:          blend(prev.cpuMs,          next.cpuMs),
        gpuDispatchMs:  blend(prev.gpuDispatchMs,  next.gpuDispatchMs),
        passes,
    }
}

function clamp(v: number, lo: number, hi: number): number {
    if (!Number.isFinite(v)) return lo
    if (v < lo) return lo
    if (v > hi) return hi
    return v
}
