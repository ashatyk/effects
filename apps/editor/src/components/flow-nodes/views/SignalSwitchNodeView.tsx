import { memo, useCallback, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { SectionTitle } from '@effects/ui'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    signalSwitchDef, SignalSwitchProcessor, applyEasing,
    type SwitchProfile, type SwitchSide,
} from '@effects/runtime/node-engine/processors/signal-switch'
import type { Signal } from '@effects/runtime/node-engine/types'
import type { PipelineNodeData } from '../types'

const SCOPE_H = 60
const PROFILE_H = 50
const HISTORY = 120
const SAMPLES = 96

interface RingBuffer {
    a: number[]
    b: number[]
    out: number[]
    side: number[]
    event: number[]
    head: number
}

const makeRing = (): RingBuffer => ({
    a: new Array(HISTORY).fill(0),
    b: new Array(HISTORY).fill(0),
    out: new Array(HISTORY).fill(0),
    side: new Array(HISTORY).fill(0),
    event: new Array(HISTORY).fill(0),
    head: 0,
})

export const SignalSwitchNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()

    const profileAb      = (data.params.profileAb      ?? 'easeInOut') as SwitchProfile
    const profileBa      = (data.params.profileBa      ?? 'easeInOut') as SwitchProfile

    const scopeRef   = useRef<HTMLCanvasElement | null>(null)
    const profileRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef     = useRef<number | null>(null)
    const ringRef    = useRef<RingBuffer>(makeRing())
    const scopeSizeRef   = useRef({ w: 240, h: SCOPE_H,   ctx: null as CanvasRenderingContext2D | null })
    const profileSizeRef = useRef({ w: 240, h: PROFILE_H, ctx: null as CanvasRenderingContext2D | null })

    const onScopeResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        scopeSizeRef.current = { w, h, ctx }
    }, [])
    const onProfileResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        profileSizeRef.current = { w, h, ctx }
    }, [])

    useCanvasFill(scopeRef,   SCOPE_H,   onScopeResize)
    useCanvasFill(profileRef, PROFILE_H, onProfileResize)

    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<SignalSwitchProcessor>(id)
            const a    = proc?.lastA       ?? null
            const b    = proc?.lastB       ?? null
            const out  = proc?.lastSignal  ?? null
            const snap = proc?.snapshot    ?? null

            const r = ringRef.current
            r.a    [r.head] = a   ? a.value   : 0
            r.b    [r.head] = b   ? b.value   : 0
            r.out  [r.head] = out ? out.value : 0
            r.side [r.head] = snap?.currentSide === 'b' ? 1 : 0
            r.event[r.head] = snap?.flippedThisFrame ? 1 : 0
            r.head = (r.head + 1) % HISTORY

            const s = scopeSizeRef.current
            if (s.ctx) drawScope(s.ctx, s.w, s.h, r, snap, out)
            const p = profileSizeRef.current
            if (p.ctx) drawProfiles(p.ctx, p.w, p.h, profileAb, profileBa, snap)
            rafRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [engine, id, profileAb, profileBa])

    return (
        <BaseNodeShell title={signalSwitchDef.title} category={signalSwitchDef.category} inputs={signalSwitchDef.inputs} outputs={signalSwitchDef.outputs} minWidth={280}>
            <canvas
                ref={scopeRef}
                className="nodrag"
                style={{
                    width: '100%', height: SCOPE_H, display: 'block',
                    background: '#000',
                    border: '1px solid rgba(0, 0, 0, 0.20)', borderRadius: 4,
                    margin: '4px 0',
                }}
            />
            <Stack
                direction="row"
                spacing={1.5}
                sx={{ fontSize: 10, opacity: 0.7, py: 0.25, flexWrap: 'wrap' }}
            >
                <Typography variant="caption" sx={{ color: '#5b9dff' }}>■ a</Typography>
                <Typography variant="caption" sx={{ color: '#ff8a5b' }}>■ b</Typography>
                <Typography variant="caption" sx={{ color: '#ffdc50' }}>■ out</Typography>
                <Typography variant="caption" sx={{ color: '#9ce28b' }}>▌ event</Typography>
            </Stack>

            <SectionTitle>Profile preview</SectionTitle>
            <canvas
                ref={profileRef}
                className="nodrag"
                style={{
                    width: '100%', height: PROFILE_H, display: 'block',
                    background: '#000',
                    border: '1px solid rgba(0, 0, 0, 0.20)', borderRadius: 4,
                    margin: '4px 0',
                }}
            />
        </BaseNodeShell>
    )
})

function drawScope(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    r: RingBuffer,
    snap: { currentSide: SwitchSide; alpha: number; transitioning: boolean; eventCount: number } | null,
    out: Signal | null,
): void {
    ctx.clearRect(0, 0, w, h)

    /* Clamp lower to 0; let upper expand past 1 (combine 'add' / unbounded
       Timer can push values > 1). */
    let hi = 1
    for (const arr of [r.a, r.b, r.out]) {
        for (const v of arr) if (Number.isFinite(v) && v > hi) hi = v
    }
    const lo = 0

    /* Side band makes flips visible even when both signals overlap. */
    const cellW = w / r.side.length
    for (let i = 0; i < r.side.length; i++) {
        const idx = (r.head + i) % r.side.length
        ctx.fillStyle = r.side[idx] === 1 ? 'rgba(255, 138, 91, 0.18)' : 'rgba(91, 157, 255, 0.18)'
        ctx.fillRect(i * cellW, 0, cellW + 1, 6)
    }

    ctx.fillStyle = 'rgba(156, 226, 139, 0.55)'
    for (let i = 0; i < r.event.length; i++) {
        const idx = (r.head + i) % r.event.length
        if (r.event[idx] === 1) {
            const x = (i / (r.event.length - 1)) * w
            ctx.fillRect(x - 0.5, 6, 1.5, h - 6)
        }
    }

    ctx.strokeStyle = '#1d2029'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5)
    if (hi > 1) {
        const yOne = mapY(1, lo, hi, h)
        ctx.moveTo(0, yOne); ctx.lineTo(w, yOne)
    }
    ctx.stroke()

    drawTrace(ctx, r.a,    r.head, w, h, lo, hi, '#5b9dff', 1)
    drawTrace(ctx, r.b,    r.head, w, h, lo, hi, '#ff8a5b', 1)
    drawTrace(ctx, r.out,  r.head, w, h, lo, hi, '#ffdc50', 1.75)

    ctx.fillStyle = '#9aa3b2'
    ctx.font = '10px ui-monospace, Menlo, monospace'
    if (out) ctx.fillText(`out ${out.value.toFixed(3)}`, 6, h - 6)
    if (snap) {
        const tag = snap.transitioning
            ? `${snap.currentSide.toUpperCase()} α${snap.alpha.toFixed(2)}`
            : `→ ${snap.currentSide.toUpperCase()}`
        ctx.fillText(tag, w - 80, h - 6)
        ctx.fillText(`events ${snap.eventCount}`, 6, 18)
    }
}

function drawProfiles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    profileAb: SwitchProfile,
    profileBa: SwitchProfile,
    snap: { transitioning: boolean; alpha: number; currentSide: SwitchSide } | null,
): void {
    ctx.clearRect(0, 0, w, h)

    const pad = 4
    const innerW = w - pad * 2
    const innerH = h - pad * 2

    ctx.strokeStyle = '#1d2029'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i <= 3; i++) {
        const x = pad + (i / 4) * innerW
        ctx.moveTo(x, 0); ctx.lineTo(x, h)
    }
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5)
    ctx.stroke()

    drawProfileCurve(ctx, w, h, pad, innerW, innerH, profileAb, '#ff8a5b')
    drawProfileCurve(ctx, w, h, pad, innerW, innerH, profileBa, '#5b9dff')

    if (snap?.transitioning) {
        const profile = snap.currentSide === 'b' ? profileAb : profileBa
        const t = clamp01(snap.alpha === 1
            ? 1
            : invertMonotonic(profile, snap.alpha))
        const v = applyEasing(profile, t)
        const x = pad + t * innerW
        const y = pad + (1 - clamp01(v)) * innerH

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
    ctx.fillText(`A→B ${profileAb}`, 6, h - 6)
    const baLabel = `B→A ${profileBa}`
    ctx.fillText(baLabel, w - 6 - ctx.measureText(baLabel).width, h - 6)
}

function drawProfileCurve(
    ctx: CanvasRenderingContext2D,
    _w: number,
    _h: number,
    pad: number,
    innerW: number,
    innerH: number,
    profile: SwitchProfile,
    color: string,
): void {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let prevValue: number | null = null
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const v = applyEasing(profile, t)
        const x = pad + t * innerW
        const y = pad + (1 - clamp01(v)) * innerH
        if (i === 0) ctx.moveTo(x, y)
        else if (prevValue != null && Math.abs(v - prevValue) > 0.4) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        prevValue = v
    }
    ctx.stroke()
}

/* Coarse monotonic inverter — play-head only needs to be visually plausible. */
function invertMonotonic(profile: SwitchProfile, alpha: number): number {
    if (profile === 'instant') return 1
    if (profile === 'linear')  return alpha
    let lo = 0, hi = 1
    for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) * 0.5
        const v = applyEasing(profile, mid)
        if (v < alpha) lo = mid
        else hi = mid
    }
    return (lo + hi) * 0.5
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

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}
