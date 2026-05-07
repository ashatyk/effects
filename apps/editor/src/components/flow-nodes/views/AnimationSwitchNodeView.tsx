import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useEngine } from '../context/EngineContext'
import { NumberField, SelectField, SectionTitle } from '@effects/ui'
import { useCanvasFill } from '../hooks/useCanvasFill'
import {
    animationSwitchDef, AnimationSwitchProcessor,
    type AnimationSwitchSnapshot,
} from '@effects/runtime/node-engine/processors/animation-switch'
import {
    applyEasing,
    type SwitchProfile, type SwitchSide,
} from '@effects/runtime/node-engine/processors/signal-switch'
import { COL_MUTED, COL_SECONDARY } from '@effects/ui/widgets/constants'
import type { PipelineNodeData } from '../types'

const PROFILES: SwitchProfile[] = [
    'instant', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'smoothstep', 'sine',
]
const SIDES: SwitchSide[] = ['a', 'b']
const PROFILE_H = 50
const SAMPLES = 96
const READOUT_THROTTLE_MS = 90

interface ChannelReadout {
    id: string
    value: number
    aValue: number
    bValue: number
    state: 0 | 1
}

interface LiveReadout {
    snap: AnimationSwitchSnapshot | null
    channels: ChannelReadout[]
}

const EMPTY_READOUT: LiveReadout = { snap: null, channels: [] }

export const AnimationSwitchNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)

    const initialSide    = (data.params.initialSide    ?? 'a') as SwitchSide
    const transitionAbMs = (data.params.transitionAbMs ?? 500) as number
    const transitionBaMs = (data.params.transitionBaMs ?? 500) as number
    const profileAb      = (data.params.profileAb      ?? 'easeInOut') as SwitchProfile
    const profileBa      = (data.params.profileBa      ?? 'easeInOut') as SwitchProfile

    const profileRef = useRef<HTMLCanvasElement | null>(null)
    const profileSizeRef = useRef({ w: 240, h: PROFILE_H, ctx: null as CanvasRenderingContext2D | null })
    const onProfileResize = useCallback((w: number, h: number, ctx: CanvasRenderingContext2D) => {
        profileSizeRef.current = { w, h, ctx }
    }, [])
    useCanvasFill(profileRef, PROFILE_H, onProfileResize)

    /* Live readout: poll the processor every ~90ms instead of subscribing to
       outputs every frame. The view never needs sub-frame precision — the
       table + per-channel bars are quasi-instantaneous at this rate, and we
       avoid forcing React re-renders on the engine's actual tick rate. */
    const [readout, setReadout] = useState<LiveReadout>(EMPTY_READOUT)
    useEffect(() => {
        let mounted = true
        const tick = () => {
            const proc = engine.getProcessor<AnimationSwitchProcessor>(id)
            if (!proc) {
                if (mounted) setReadout(EMPTY_READOUT)
                return
            }
            const snap = proc.snapshot
            const out = proc.lastAnimation
            const a   = proc.lastA
            const b   = proc.lastB
            const channels: ChannelReadout[] = snap.channelIds.map(cid => ({
                id: cid,
                value:  out?.channels[cid]?.value ?? 0,
                aValue: a?.channels[cid]?.value ?? 0,
                bValue: b?.channels[cid]?.value ?? 0,
                state:  out?.channels[cid]?.state ?? 0,
            }))
            if (mounted) setReadout({ snap, channels })
        }
        tick()
        const t = setInterval(tick, READOUT_THROTTLE_MS)
        return () => {
            mounted = false
            clearInterval(t)
        }
    }, [engine, id])

    /* Profile preview is a separate per-frame pass — it draws the static
       A→B / B→A curves plus a play-head that needs to track the morph
       smoothly, so it's worth a rAF instead of the slower readout poll. */
    useEffect(() => {
        let raf = 0
        const draw = () => {
            const proc = engine.getProcessor<AnimationSwitchProcessor>(id)
            const snap = proc?.snapshot ?? null
            const p = profileSizeRef.current
            if (p.ctx) drawProfiles(p.ctx, p.w, p.h, profileAb, profileBa, snap)
            raf = requestAnimationFrame(draw)
        }
        draw()
        return () => { if (raf) cancelAnimationFrame(raf) }
    }, [engine, id, profileAb, profileBa])

    return (
        <BaseNodeShell
            title={animationSwitchDef.title}
            category={animationSwitchDef.category}
            inputs={animationSwitchDef.inputs}
            outputs={animationSwitchDef.outputs}
            minWidth={300}
        >
            <SectionTitle>Live</SectionTitle>
            <ChannelTable readout={readout} />

            <SectionTitle>Control</SectionTitle>
            <SelectField label="initial side" value={initialSide} options={SIDES} onChange={v => set('initialSide', v)} formatOption={s => s.toUpperCase()} />

            <SectionTitle>Transition A → B</SectionTitle>
            <NumberField label="duration (ms)" value={transitionAbMs} step={50} min={0} max={10000} onChange={v => set('transitionAbMs', v)} />
            <SelectField label="profile"       value={profileAb}      options={PROFILES} onChange={v => set('profileAb', v)} />

            <SectionTitle>Transition B → A</SectionTitle>
            <NumberField label="duration (ms)" value={transitionBaMs} step={50} min={0} max={10000} onChange={v => set('transitionBaMs', v)} />
            <SelectField label="profile"       value={profileBa}      options={PROFILES} onChange={v => set('profileBa', v)} />

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

interface ChannelTableProps {
    readout: LiveReadout
}

const ChannelTable = memo(function ChannelTable({ readout }: ChannelTableProps) {
    const { snap, channels } = readout

    /* Auto-scale the bars so a side that ranges 0..50 stays readable next to
       a side that ranges 0..1. Symmetric around 0 when any value goes
       negative (per-direction Interpolator can produce negative drives). */
    let mag = 0.001
    for (const c of channels) {
        mag = Math.max(mag, Math.abs(c.value), Math.abs(c.aValue), Math.abs(c.bValue))
    }

    const sideTag = snap
        ? (snap.transitioning
            ? `${snap.currentSide.toUpperCase()} α${snap.alpha.toFixed(2)}`
            : `→ ${snap.currentSide.toUpperCase()}`)
        : '— idle'

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', rowGap: 0.25 }}>
            <Stack direction="row" spacing={1.5} sx={{ pb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ color: COL_MUTED }}>{sideTag}</Typography>
                <Typography variant="caption" sx={{ color: COL_MUTED }}>events {snap?.eventCount ?? 0}</Typography>
                <Typography variant="caption" sx={{ color: COL_MUTED }}>scale ±{mag.toFixed(2)}</Typography>
            </Stack>
            {channels.map(c => (
                <ChannelRow key={c.id} ch={c} mag={mag} />
            ))}
        </Box>
    )
})

interface ChannelRowProps {
    ch: ChannelReadout
    mag: number
}

const ChannelRow = memo(function ChannelRow({ ch, mag }: ChannelRowProps) {
    /* Bar for the live `out.value`, with side dots showing the contribution
       from a (blue) and b (orange) at full saturation. Centred at mid-line
       to handle negative drives. */
    const barFrac = clamp(ch.value / mag, -1, 1)
    const aFrac   = clamp(ch.aValue / mag, -1, 1)
    const bFrac   = clamp(ch.bValue / mag, -1, 1)
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr 56px',
                alignItems: 'center',
                columnGap: 0.75,
            }}
        >
            <Typography
                component="span"
                sx={{
                    fontSize: 10,
                    color: COL_MUTED,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                }}
            >
                {ch.id}
            </Typography>
            <Box sx={{ position: 'relative', height: 12, background: '#000', borderRadius: 1, overflow: 'hidden' }}>
                {/* Centre line */}
                <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: '#1d2029' }} />
                {/* Output bar */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: 1, bottom: 1,
                        left: barFrac >= 0 ? '50%' : `${50 + barFrac * 50}%`,
                        width: `${Math.abs(barFrac) * 50}%`,
                        background: ch.state ? '#ffdc50' : 'rgba(255, 220, 80, 0.55)',
                        borderRadius: 1,
                    }}
                />
                {/* a / b ticks */}
                <Tick frac={aFrac} color="#5b9dff" />
                <Tick frac={bFrac} color="#ff8a5b" />
            </Box>
            <Typography
                component="span"
                sx={{
                    fontSize: 10,
                    color: COL_SECONDARY,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                }}
            >
                {formatValue(ch.value)}
            </Typography>
        </Box>
    )
})

const Tick = memo(function Tick({ frac, color }: { frac: number; color: string }) {
    return (
        <Box
            sx={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: `${50 + frac * 50}%`,
                width: '2px',
                background: color,
                opacity: 0.85,
                transform: 'translateX(-1px)',
            }}
        />
    )
})

function drawProfiles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    profileAb: SwitchProfile,
    profileBa: SwitchProfile,
    snap: AnimationSwitchSnapshot | null,
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

    drawProfileCurve(ctx, pad, innerW, innerH, profileAb, '#ff8a5b')
    drawProfileCurve(ctx, pad, innerW, innerH, profileBa, '#5b9dff')

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

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v <= 0) return 0
    if (v >= 1) return 1
    return v
}

function clamp(v: number, lo: number, hi: number): number {
    if (!Number.isFinite(v)) return 0
    if (v < lo) return lo
    if (v > hi) return hi
    return v
}

function formatValue(v: number): string {
    if (!Number.isFinite(v)) return '—'
    const abs = Math.abs(v)
    if (abs >= 100) return v.toFixed(0)
    if (abs >= 10)  return v.toFixed(1)
    return v.toFixed(2)
}
