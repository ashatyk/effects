import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField } from '../widgets'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    combineSignalsDef, CombineSignalsProcessor,
    type CombineMode,
} from '../../../node-engine/processors/combine-signals'
import type { Signal } from '../../../node-engine/types'
import type { PipelineNodeData } from '../types'

const MODES: CombineMode[] = ['add', 'max', 'min', 'multiply', 'a_overrides_b', 'b_overrides_a', 'mix']

const PREVIEW_H = 60
const HISTORY = 120

interface RingBuffer {
    a: number[]
    b: number[]
    out: number[]
    head: number
}

const makeRing = (): RingBuffer => ({
    a: new Array(HISTORY).fill(0),
    b: new Array(HISTORY).fill(0),
    out: new Array(HISTORY).fill(0),
    head: 0,
})

export const CombineSignalsNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const mode = (data.params.mode ?? 'a_overrides_b') as CombineMode
    const mixFactor = (data.params.mixFactor ?? 0.5) as number

    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const ringRef = useRef<RingBuffer>(makeRing())
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    /* Live oscilloscope: pushes a/b/out values into a ring buffer and renders
       all three traces overlaid. This makes it obvious what the combine is
       doing (e.g. envelope spike on top of a saw input). */
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<CombineSignalsProcessor>(id)
            const a = proc?.lastA ?? null
            const b = proc?.lastB ?? null
            const out = proc?.lastSignal ?? null

            const r = ringRef.current
            r.a[r.head] = a ? a.value : 0
            r.b[r.head] = b ? b.value : 0
            r.out[r.head] = out ? out.value : 0
            r.head = (r.head + 1) % HISTORY

            const { w, h, ctx } = sizeRef.current
            if (ctx) drawScope(ctx, w, h, r, out)
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id])

    return (
        <BaseNodeShell title={combineSignalsDef.title} category={combineSignalsDef.category} inputs={combineSignalsDef.inputs} outputs={combineSignalsDef.outputs} minWidth={260}>
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
            <SelectField
                label="mode" value={mode} options={MODES}
                onChange={v => set('mode', v)}
                formatOption={m => m.replace(/_/g, ' ')}
            />
            {mode === 'mix' && (
                <NumberField label="mix (a→b)" value={mixFactor} step={0.05} min={0} max={1} onChange={v => set('mixFactor', v)} />
            )}
            <Stack sx={{ fontSize: 10, opacity: 0.7, py: 0.25 }}>
                <Typography variant="caption" sx={{ color: '#5b9dff' }}>■ a</Typography>
                <Typography variant="caption" sx={{ color: '#ff8a5b' }}>■ b</Typography>
                <Typography variant="caption" sx={{ color: '#ffdc50' }}>■ out</Typography>
            </Stack>
        </BaseNodeShell>
    )
})

function drawScope(ctx: CanvasRenderingContext2D, w: number, h: number, r: RingBuffer, out: Signal | null): void {
    ctx.clearRect(0, 0, w, h)

    /* Find the displayable range: clamp lower bound to 0, but allow the upper
       to expand if any trace exceeds 1 (combine 'add' or unbounded auto-timer
       can produce values > 1). */
    let hi = 1
    for (const arr of [r.a, r.b, r.out]) {
        for (const v of arr) if (Number.isFinite(v) && v > hi) hi = v
    }
    const lo = 0

    /* Background grid */
    ctx.strokeStyle = '#1d2029'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5)
    /* horizontal line at value=1 if range expanded above 1 */
    if (hi > 1) {
        const yOne = mapY(1, lo, hi, h)
        ctx.moveTo(0, yOne); ctx.lineTo(w, yOne)
    }
    ctx.stroke()

    drawTrace(ctx, r.a, r.head, w, h, lo, hi, '#5b9dff', 1)
    drawTrace(ctx, r.b, r.head, w, h, lo, hi, '#ff8a5b', 1)
    drawTrace(ctx, r.out, r.head, w, h, lo, hi, '#ffdc50', 1.75)

    if (out) {
        ctx.fillStyle = '#9aa3b2'
        ctx.font = '10px ui-monospace, Menlo, monospace'
        ctx.fillText(`out ${out.value.toFixed(3)}`, 6, h - 6)
    }
}

function drawTrace(
    ctx: CanvasRenderingContext2D,
    buf: number[],
    head: number,
    w: number,
    h: number,
    lo: number,
    hi: number,
    color: string,
    width: number,
): void {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    for (let i = 0; i < buf.length; i++) {
        const idx = (head + i) % buf.length
        const v = buf[idx]
        const x = (i / (buf.length - 1)) * w
        const y = mapY(v, lo, hi, h)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()
}

function mapY(v: number, lo: number, hi: number, h: number): number {
    const t = (v - lo) / Math.max(1e-6, hi - lo)
    return (1 - t) * h
}
