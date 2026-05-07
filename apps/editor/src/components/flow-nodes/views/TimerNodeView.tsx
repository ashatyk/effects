import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField, SwitchField } from '@effects/ui'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    timerDef, TimerProcessor,
    type TimerMode,
} from '@effects/runtime/node-engine/processors/timer'
import type { Signal } from '@effects/runtime/node-engine/types'
import type { PipelineNodeData } from '../types'

const MODES: TimerMode[] = ['looped', 'unbounded']

const PREVIEW_H = 60

export const TimerNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const mode = (data.params.mode ?? 'looped') as TimerMode
    const durationMs = (data.params.durationMs ?? 2000) as number
    const phaseOffsetMs = (data.params.phaseOffsetMs ?? 0) as number
    const paused = Boolean(data.params.paused ?? false)

    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    /* Live size kept in a ref so the rAF tick reads the latest value
     * without re-subscribing every resize. */
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    /* Live preview: draws the phase curve and a play-head from the processor's
       last emitted Signal. The static curve depends solely on params and is
       cheap to recompute every frame. */
    useEffect(() => {
        const tick = () => {
            const { w, h, ctx } = sizeRef.current
            if (ctx) {
                const proc = engine.getProcessor<TimerProcessor>(id)
                const sig = proc?.lastSignal ?? undefined
                drawTimer(ctx, w, h, mode, sig)
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id, mode])

    return (
        <BaseNodeShell title={timerDef.title} category={timerDef.category} inputs={timerDef.inputs} outputs={timerDef.outputs} minWidth={260}>
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
            <NumberField label="duration (ms)" value={durationMs} step={50} min={1} onChange={v => set('durationMs', v || 1)} />
            <NumberField label="phase offset (ms)" value={phaseOffsetMs} step={50} onChange={v => set('phaseOffsetMs', v)} />
            <SwitchField label="paused" checked={paused} onChange={v => set('paused', v)} />
        </BaseNodeShell>
    )
})

function drawTimer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    mode: TimerMode,
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

    /* Static curve: looped → saw 0→1 with an instant reset at the right edge;
       unbounded → diagonal hitting the top right (visualises continuous growth
       even though the runtime value would keep climbing past 1). */
    ctx.strokeStyle = '#5b9dff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const SAMPLES = 128
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const v = t
        const x = pad + t * innerW
        const y = pad + (1 - v) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()

    /* Play-head: looped uses fract(value), unbounded uses the same fract for
       the visual indicator so it wraps instead of running off the canvas.
       The y position tracks the visualised phase so the dot rides the line. */
    if (sig) {
        const xt = sig.value - Math.floor(sig.value)
        const x = pad + xt * innerW
        const y = pad + (1 - xt) * innerH

        ctx.strokeStyle = sig.state === 0 ? 'rgba(154, 163, 178, 0.35)' : 'rgba(255, 220, 80, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, pad); ctx.lineTo(x, pad + innerH)
        ctx.stroke()

        ctx.fillStyle = sig.state === 0 ? '#9aa3b2' : '#ffdc50'
        ctx.beginPath()
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#9aa3b2'
        ctx.font = '10px ui-monospace, Menlo, monospace'
        const valueLabel = mode === 'unbounded' ? sig.value.toFixed(2) : sig.value.toFixed(3)
        ctx.fillText(`val ${valueLabel}`, 6, h - 6)
        ctx.fillText(sig.state === 0 ? `${mode} · paused` : mode, w - 100, h - 6)
    } else {
        ctx.fillStyle = '#666'
        ctx.font = '10px sans-serif'
        ctx.fillText('idle', 8, h - 8)
    }
}
