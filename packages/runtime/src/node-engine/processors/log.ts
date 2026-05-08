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
        // EMA factor: 0 = no smoothing, 1 = freeze; 0.85 reads trend without flicker.
        smoothing: 0.85,
    },
}

// Pure sink: holds EMA-smoothed metrics snapshot for the view layer (subscribed via
// engine.subscribeNode). Only the EMA is owned here so values stay coherent across
// React re-renders that may drop frames.
export class LogProcessor extends BaseProcessor {
    readonly def = logDef
    // Not alwaysDirty: rides upstream propagation. Effect emits a fresh metrics
    // packet only while animating, marking Log dirty; both sleep at idle.

    last: EffectMetrics | null = null
    lastSmoothed: EffectMetrics | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const m = inputs.metrics as EffectMetrics | undefined
        if (!m) {
            this.last = null
            this.lastSmoothed = null
            return {}
        }
        this.last = m

        // Clamp <0.99: above that the EMA effectively freezes.
        const a = clamp(Number(params.smoothing ?? 0.85), 0, 0.99)
        this.lastSmoothed = mergeMetrics(this.lastSmoothed, m, a)
        return {}
    }
}

function mergeMetrics(prev: EffectMetrics | null, next: EffectMetrics, alpha: number): EffectMetrics {
    if (!prev || prev.effectName !== next.effectName || prev.passes.length !== next.passes.length) {
        // Effect changed or first frame: reset to avoid cross-effect averaging.
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
