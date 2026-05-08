import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    envelopeDef, EnvelopeProcessor, sampleShape,
    type EnvelopeShape, type Easing, type EnvelopeSnapshot,
} from '@effects/runtime/node-engine/processors/envelope'
import type { PipelineNodeData } from '../types'

const PREVIEW_H = 70
const SAMPLES = 96

export const EnvelopeNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    useEffect(() => {
        const tick = () => {
            const { w, h, ctx } = sizeRef.current
            if (ctx) {
                const proc = engine.getProcessor<EnvelopeProcessor>(id)
                const snap = proc?.getSnapshot()
                drawEnvelope(ctx, w, h, snap)
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id])

    return (
        <BaseNodeShell title={envelopeDef.title} category={envelopeDef.category} inputs={envelopeDef.inputs} outputs={envelopeDef.outputs} minWidth={240}>
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
                    marginBottom: 6,
                }}
            />
        </BaseNodeShell>
    )
})

function drawEnvelope(ctx: CanvasRenderingContext2D, w: number, h: number, snap: EnvelopeSnapshot | undefined) {
    ctx.clearRect(0, 0, w, h)

    ctx.strokeStyle = '#1d2029'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i <= 3; i++) {
        const x = (i / 4) * w
        ctx.moveTo(x, 0); ctx.lineTo(x, h)
    }
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5)
    ctx.stroke()

    if (!snap) {
        ctx.fillStyle = '#666'
        ctx.font = '10px sans-serif'
        ctx.fillText('no signal yet', 8, h - 8)
        return
    }

    const pad = 4
    const innerW = w - pad * 2
    const innerH = h - pad * 2
    ctx.strokeStyle = '#5b9dff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const v = sampleShape(
            snap.shape as EnvelopeShape,
            clampOpen01(t),
            snap.peakTime,
            snap.plateauHold,
            snap.attackEasing as Easing,
            snap.decayEasing as Easing,
        )
        const x = pad + t * innerW
        const y = pad + (1 - v) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.stroke()

    const now = performance.now()
    for (const clip of snap.clips) {
        const t = (now - clip.startMs) / Math.max(1, snap.durationMs)
        if (t < 0 || t > 1) continue
        const v = sampleShape(
            snap.shape as EnvelopeShape,
            clampOpen01(t),
            snap.peakTime,
            snap.plateauHold,
            snap.attackEasing as Easing,
            snap.decayEasing as Easing,
        )
        const x = pad + t * innerW
        const y = pad + (1 - v) * innerH

        ctx.strokeStyle = 'rgba(255, 220, 80, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, pad); ctx.lineTo(x, pad + innerH)
        ctx.stroke()

        ctx.fillStyle = '#ffdc50'
        ctx.beginPath()
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
    }

    ctx.fillStyle = '#9aa3b2'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(`val ${snap.value.toFixed(3)}`, 6, h - 6)
    ctx.fillText(`${snap.durationMs}ms`, w - 50, h - 6)
}

function clampOpen01(v: number): number {
    if (v <= 0) return 0.0001
    if (v >= 1) return 0.9999
    return v
}
