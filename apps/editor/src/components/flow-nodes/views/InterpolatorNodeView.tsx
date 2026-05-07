import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    interpolatorDef, InterpolatorProcessor, applyProfile,
    type InterpolatorProfile, type ProfileParams,
} from '@effects/runtime/node-engine/processors/interpolator'
import type { Easing } from '@effects/runtime/node-engine/processors/envelope'
import type { Signal } from '@effects/runtime/node-engine/types'
import type { PipelineNodeData } from '../types'

const PREVIEW_H = 60
const SAMPLES = 256

/**
 * Graph card: live profile curve + play-head. The full param surface
 * (profile, peak/plateau/easing, discrete steps/teeth, smoothness,
 * reverse) lives in `InterpolatorNodeSettings`.
 */
export const InterpolatorNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
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
        <BaseNodeShell title={interpolatorDef.title} category={interpolatorDef.category} inputs={interpolatorDef.inputs} outputs={interpolatorDef.outputs} minWidth={240}>
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
            ctx.moveTo(x, y)
        }
        else ctx.lineTo(x, y)
        prevValue = v
    }
    ctx.stroke()

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
