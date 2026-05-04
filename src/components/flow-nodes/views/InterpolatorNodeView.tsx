import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField, SwitchField, StatusLine } from '../widgets'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    interpolatorDef, InterpolatorProcessor, applyProfile,
    type InterpolatorProfile, type ProfileParams,
} from '../../../node-engine/processors/interpolator'
import type { Easing } from '../../../node-engine/processors/envelope'
import type { Signal } from '../../../node-engine/types'
import type { PipelineNodeData } from '../types'

const PROFILES: InterpolatorProfile[] = [
    'linear', 'sine', 'triangle', 'bell', 'gaussian', 'pulse',
    'steps', 'square', 'sawTeeth',
]
const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

const PREVIEW_H = 60
const SAMPLES = 256

const usesEasing = (p: InterpolatorProfile): boolean =>
    p === 'triangle' || p === 'bell' || p === 'gaussian' || p === 'pulse'
const usesPeak = (p: InterpolatorProfile): boolean =>
    p === 'triangle' || p === 'bell' || p === 'gaussian' || p === 'pulse'
const usesPlateau = (p: InterpolatorProfile): boolean => p === 'pulse'
const usesStepCount = (p: InterpolatorProfile): boolean => p === 'steps'
const usesTeethCount = (p: InterpolatorProfile): boolean => p === 'square' || p === 'sawTeeth'
const usesDutyCycle = (p: InterpolatorProfile): boolean => p === 'square'
const usesSmoothness = (p: InterpolatorProfile): boolean =>
    p === 'steps' || p === 'square' || p === 'sawTeeth'

export const InterpolatorNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const profile = (data.params.profile ?? 'sine') as InterpolatorProfile
    const peakTime = (data.params.peakTime ?? 0.5) as number
    const plateauHold = (data.params.plateauHold ?? 0.4) as number
    const easing = (data.params.easing ?? 'easeInOut') as Easing
    const reverse = Boolean(data.params.reverse ?? false)
    const stepCount = (data.params.stepCount ?? 4) as number
    const teethCount = (data.params.teethCount ?? 4) as number
    const dutyCycle = (data.params.dutyCycle ?? 0.5) as number
    const smoothness = (data.params.smoothness ?? 0) as number

    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const sizeRef = useRef({ w: 240, h: PREVIEW_H, ctx: null as CanvasRenderingContext2D | null })

    const onResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        sizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(canvasRef, PREVIEW_H, onResize)

    /* Live preview: redraws every frame. Polls processor for the upstream
       Signal (input) so the play-head reflects the actual phase the runtime
       is interpolating, not just the static curve. */
    useEffect(() => {
        const tick = () => {
            const { w, h, ctx } = sizeRef.current
            if (ctx) {
                const proc = engine.getProcessor<InterpolatorProcessor>(id)
                drawInterpolator(
                    ctx, w, h,
                    profile,
                    {
                        peakTime, plateauHold, easing, reverse,
                        stepCount, teethCount, dutyCycle, smoothness,
                    },
                    proc?.lastInput ?? undefined,
                    proc?.lastSignal ?? undefined,
                )
            }
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id, profile, peakTime, plateauHold, easing, reverse, stepCount, teethCount, dutyCycle, smoothness])

    return (
        <BaseNodeShell title={interpolatorDef.title} category={interpolatorDef.category} inputs={interpolatorDef.inputs} outputs={interpolatorDef.outputs} minWidth={260}>
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
            <SelectField label="profile" value={profile} options={PROFILES} onChange={v => set('profile', v)} />
            {usesPeak(profile) && (
                <NumberField label="peak (0..1)" value={peakTime} step={0.05} min={0} max={1} onChange={v => set('peakTime', v)} />
            )}
            {usesPlateau(profile) && (
                <NumberField label="hold width (0..1)" value={plateauHold} step={0.05} min={0} max={1} onChange={v => set('plateauHold', v)} />
            )}
            {usesEasing(profile) && (
                <SelectField label="easing" value={easing} options={EASINGS} onChange={v => set('easing', v)} />
            )}
            {usesStepCount(profile) && (
                <NumberField label="steps (2..64)" value={stepCount} step={1} min={2} max={64} onChange={v => set('stepCount', Math.round(v))} />
            )}
            {usesTeethCount(profile) && (
                <NumberField label="teeth (1..64)" value={teethCount} step={1} min={1} max={64} onChange={v => set('teethCount', Math.round(v))} />
            )}
            {usesDutyCycle(profile) && (
                <NumberField label="duty (0..1)" value={dutyCycle} step={0.05} min={0} max={1} onChange={v => set('dutyCycle', v)} />
            )}
            {usesSmoothness(profile) && (
                <NumberField label="smoothness (0..1)" value={smoothness} step={0.05} min={0} max={1} onChange={v => set('smoothness', v)} />
            )}
            <SwitchField label="reverse" checked={reverse} onChange={v => set('reverse', v)} />
            <StatusLine tone="muted">wire a Timer / Envelope into <code>signal</code></StatusLine>
        </BaseNodeShell>
    )
})

function drawInterpolator(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    profile: InterpolatorProfile,
    p: ProfileParams,
    input: Signal | undefined,
    output: Signal | undefined,
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

    /* Static profile curve sampled across one full cycle (phase 0..1).
       Discrete profiles produce hard jumps — use moveTo on instant
       transitions so the rendering doesn't draw a diagonal across the
       canvas at every step boundary. */
    ctx.strokeStyle = '#5b9dff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let prevValue: number | null = null
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const v = applyProfile(profile, t, p)
        const x = pad + t * innerW
        const y = pad + (1 - clamp01(v)) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else if (prevValue != null && Math.abs(v - prevValue) > 0.4) {
            /* Likely a discrete jump — break the path so the line doesn't
               cut diagonally across the canvas. */
            ctx.moveTo(x, y)
        }
        else ctx.lineTo(x, y)
        prevValue = v
    }
    ctx.stroke()

    /* Live play-head reflects the upstream phase (frac of input.value for
       wrapping profiles, raw input.value clamped to [0,1] for linear so the
       indicator stays on canvas for unbounded inputs). */
    if (input && output) {
        const phase = profile === 'linear'
            ? clamp01(input.value)
            : input.value - Math.floor(input.value)
        const x = pad + phase * innerW
        const y = pad + (1 - clamp01(output.value)) * innerH

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
        ctx.fillText(`out ${output.value.toFixed(3)}`, 6, h - 6)
        ctx.fillText(profile, w - 70, h - 6)
    } else {
        ctx.fillStyle = '#666'
        ctx.font = '10px sans-serif'
        ctx.fillText('no signal', 8, h - 8)
    }
}

function clamp01(v: number): number {
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}
