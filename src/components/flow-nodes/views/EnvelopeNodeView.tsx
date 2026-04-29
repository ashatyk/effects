import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField } from '../widgets'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    envelopeDef, EnvelopeProcessor, sampleShape,
    type EnvelopeShape, type Easing, type EnvelopeSnapshot, type RetriggerMode,
} from '../../../node-engine/processors/envelope'
import type { PipelineNodeData } from '../types'

const SHAPES = ['bell', 'rise', 'fall', 'plateau', 'gaussian', 'triangle'] as const
const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const
const MODES = ['restart', 'add', 'max'] as const

const PREVIEW_H = 70
const SAMPLES = 96

export const EnvelopeNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const shape = (data.params.shape ?? 'bell') as string
    const durationMs = (data.params.durationMs ?? 600) as number
    const peakTime = (data.params.peakTime ?? 0.5) as number
    const plateauHold = (data.params.plateauHold ?? 0.4) as number
    const attackEasing = (data.params.attackEasing ?? 'linear') as string
    const decayEasing = (data.params.decayEasing ?? 'linear') as string
    const retriggerMode = (data.params.retriggerMode ?? 'restart') as string

    const showPeak = shape !== 'bell' && shape !== 'rise' && shape !== 'fall'
    const showPlateau = shape === 'plateau'
    const showAttack = shape === 'rise' || shape === 'plateau'
    const showDecay = shape === 'fall' || shape === 'plateau'

    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    /* Live curve preview: redraws every frame, reads the processor's snapshot
       to overlay current play-head(s) and the active value. The static shape
       outline is recomputed when params change; the play-head moves with the
       clip's elapsed time. */
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
        <BaseNodeShell title={envelopeDef.title} category={envelopeDef.category} inputs={envelopeDef.inputs} outputs={envelopeDef.outputs} minWidth={260}>
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
            <SelectField label="shape" value={shape as EnvelopeShape} options={SHAPES} onChange={v => set('shape', v)} />
            <NumberField label="duration (ms)" value={durationMs} step={50} min={1} onChange={v => set('durationMs', v || 1)} />
            {showPeak && (
                <NumberField label="peak (0..1)" value={peakTime} step={0.05} min={0} max={1} onChange={v => set('peakTime', v)} />
            )}
            {showPlateau && (
                <NumberField label="hold (0..1)" value={plateauHold} step={0.05} min={0} max={1} onChange={v => set('plateauHold', v)} />
            )}
            {showAttack && (
                <SelectField label="attack" value={attackEasing as Easing} options={EASINGS} onChange={v => set('attackEasing', v)} />
            )}
            {showDecay && (
                <SelectField label="decay" value={decayEasing as Easing} options={EASINGS} onChange={v => set('decayEasing', v)} />
            )}
            <SelectField label="retrigger" value={retriggerMode as RetriggerMode} options={MODES} onChange={v => set('retriggerMode', v)} />
        </BaseNodeShell>
    )
})

function drawEnvelope(ctx: CanvasRenderingContext2D, w: number, h: number, snap: EnvelopeSnapshot | undefined) {
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

    if (!snap) {
        ctx.fillStyle = '#666'
        ctx.font = '10px sans-serif'
        ctx.fillText('no signal yet', 8, h - 8)
        return
    }

    /* Static envelope curve sampled across [0..1]. */
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

    /* Active clip play-heads + value markers. */
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

    /* Numeric readout. */
    ctx.fillStyle = '#9aa3b2'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.fillText(`val ${snap.value.toFixed(3)}`, 6, h - 6)
    ctx.fillText(`${snap.durationMs}ms`, w - 50, h - 6)
}

function clampOpen01(v: number): number {
    /* sampleShape returns 0 at exactly t=0 and t=1; clamp slightly inside the
       range so the curve preview looks continuous to the eye. */
    if (v <= 0) return 0.0001
    if (v >= 1) return 0.9999
    return v
}
