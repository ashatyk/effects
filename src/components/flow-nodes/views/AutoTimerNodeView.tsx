import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField, SwitchField } from '../widgets'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    autoTimerDef, AutoTimerProcessor, computeValue,
    type AutoTimerMode,
} from '../../../node-engine/processors/auto-timer'
import type { Easing } from '../../../node-engine/processors/envelope'
import type { Signal } from '../../../node-engine/types'
import type { PipelineNodeData } from '../types'

const MODES: AutoTimerMode[] = ['constant', 'linear', 'sine', 'triangle', 'bell', 'gaussian', 'pulse', 'unbounded']
const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

const PREVIEW_H = 60
const SAMPLES = 128

const usesEasing = (m: AutoTimerMode): boolean =>
    m === 'triangle' || m === 'bell' || m === 'gaussian' || m === 'pulse'
const usesPeak = (m: AutoTimerMode): boolean =>
    m === 'triangle' || m === 'bell' || m === 'gaussian' || m === 'pulse'
const usesPlateau = (m: AutoTimerMode): boolean => m === 'pulse'
const isLooping = (m: AutoTimerMode): boolean =>
    m === 'linear' || m === 'sine' || m === 'triangle' || m === 'bell' || m === 'gaussian' || m === 'pulse'

export const AutoTimerNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const mode = (data.params.mode ?? 'sine') as AutoTimerMode
    const durationMs = (data.params.durationMs ?? 2000) as number
    const phaseOffsetMs = (data.params.phaseOffsetMs ?? 0) as number
    const constantValue = (data.params.constantValue ?? 0.5) as number
    const peakTime = (data.params.peakTime ?? 0.5) as number
    const plateauHold = (data.params.plateauHold ?? 0.4) as number
    const easing = (data.params.easing ?? 'easeInOut') as Easing
    const reverse = Boolean(data.params.reverse ?? false)

    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    /* Live size — kept in a ref so the rAF tick reads the latest value
     * without re-subscribing every resize. ResizeObserver pushes the new
     * size via the useCanvasFill callback. */
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    /* Polls the processor's last output every frame so the preview reflects
       the live signal. The shape outline is recomputed each frame too because
       it depends solely on params. */
    useEffect(() => {
        const tick = () => {
            const { w, h, ctx } = sizeRef.current
            if (ctx) {
                const proc = engine.getProcessor<AutoTimerProcessor>(id)
                const sig = proc?.lastSignal ?? undefined
                drawTimer(ctx, w, h, mode, durationMs, constantValue, peakTime, plateauHold, easing, reverse, sig)
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id, mode, durationMs, constantValue, peakTime, plateauHold, easing, reverse])

    return (
        <BaseNodeShell title={autoTimerDef.title} category={autoTimerDef.category} inputs={autoTimerDef.inputs} outputs={autoTimerDef.outputs} minWidth={260}>
            <canvas
                ref={canvasRef}
                className="nodrag"
                style={{
                    width: '100%',
                    height: PREVIEW_H,
                    display: 'block',
                    background: '#000',
                    border: '1px solid rgba(0, 0, 0, 0.20)',
                    borderRadius: 4,
                    margin: '4px 0',
                }}
            />
            <SelectField label="mode" value={mode} options={MODES} onChange={v => set('mode', v)} />
            {mode !== 'constant' && (
                <NumberField label="duration (ms)" value={durationMs} step={50} min={1} onChange={v => set('durationMs', v || 1)} />
            )}
            {mode !== 'constant' && (
                <NumberField label="phase offset (ms)" value={phaseOffsetMs} step={50} onChange={v => set('phaseOffsetMs', v)} />
            )}
            {usesPeak(mode) && (
                <NumberField label="peak (0..1)" value={peakTime} step={0.05} min={0} max={1} onChange={v => set('peakTime', v)} />
            )}
            {usesPlateau(mode) && (
                <NumberField label="hold width (0..1)" value={plateauHold} step={0.05} min={0} max={1} onChange={v => set('plateauHold', v)} />
            )}
            {usesEasing(mode) && (
                <SelectField label="easing" value={easing} options={EASINGS} onChange={v => set('easing', v)} />
            )}
            {mode === 'constant' && (
                <NumberField label="value (0..1)" value={constantValue} step={0.05} min={0} max={1} onChange={v => set('constantValue', v)} />
            )}
            <SwitchField label="reverse" checked={reverse} onChange={v => set('reverse', v)} />
        </BaseNodeShell>
    )
})

function drawTimer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    mode: AutoTimerMode,
    durationMs: number,
    constantValue: number,
    peakTime: number,
    plateauHold: number,
    easing: Easing,
    reverse: boolean,
    sig: Signal | undefined,
): void {
    ctx.clearRect(0, 0, w, h)

    /* Background grid: vertical thirds + horizontal midline. */
    ctx.strokeStyle = '#1d2029'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i <= 3; i++) {
        const x = (i / 4) * w
        ctx.moveTo(x, 0); ctx.lineTo(x, h)
    }
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5)
    ctx.stroke()

    const pad = 4
    const innerW = w - pad * 2
    const innerH = h - pad * 2

    /* Shape outline. For wrapped modes we sweep one period (elapsed = t * duration).
       For 'unbounded' we draw a diagonal that hits the top at the right edge,
       conveying continuous growth. For 'constant' we draw a horizontal line.
       The `reverse` flag is applied identically to the runtime via computeValue. */
    ctx.strokeStyle = '#5b9dff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        let v: number
        if (mode === 'unbounded') v = reverse ? 1 - t : t
        else if (mode === 'constant') v = reverse ? 1 - constantValue : constantValue
        else v = computeValue(mode, t * durationMs, durationMs, constantValue, peakTime, plateauHold, easing, reverse)
        const x = pad + t * innerW
        const y = pad + (1 - clamp01(v)) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()

    /* Live play-head. For wrapped modes we map elapsed to phase; for unbounded
       we use the same phase as 'saw' so the indicator wraps visually instead
       of disappearing off the right edge. The visualised value goes through
       computeValue with the reverse flag so it always matches the curve. */
    if (sig) {
        let xt = 0
        let visualValue = 0
        if (mode === 'constant') {
            xt = 0
            visualValue = clamp01(reverse ? 1 - constantValue : constantValue)
        } else if (isLooping(mode)) {
            const r = sig.time / Math.max(1, durationMs)
            xt = r - Math.floor(r)
            visualValue = clamp01(computeValue(mode, sig.time, durationMs, constantValue, peakTime, plateauHold, easing, reverse))
        } else {
            /* unbounded: phase wraps visually, value tracks the diagonal. */
            const r = sig.time / Math.max(1, durationMs)
            xt = r - Math.floor(r)
            visualValue = clamp01(reverse ? 1 - xt : xt)
        }
        const x = pad + xt * innerW
        const y = pad + (1 - visualValue) * innerH

        ctx.strokeStyle = 'rgba(255, 220, 80, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, pad); ctx.lineTo(x, pad + innerH)
        ctx.stroke()

        ctx.fillStyle = '#ffdc50'
        ctx.beginPath()
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#9aa3b2'
        ctx.font = '10px ui-monospace, Menlo, monospace'
        ctx.fillText(`val ${sig.value.toFixed(3)}`, 6, h - 6)
        ctx.fillText(mode, w - 70, h - 6)
    } else {
        ctx.fillStyle = '#666'
        ctx.font = '10px sans-serif'
        ctx.fillText('idle', 8, h - 8)
    }
}

function clamp01(v: number): number {
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}
