import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type ReactFlowState } from '@xyflow/react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import { useSetParam } from '../hooks/useSetParam'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { ANIMATION_CHANNEL_COUNT, type SlotDef } from '@effects/runtime/pipeline/types'
import { effects } from '@effects/runtime'
import { COL_MUTED, COL_SECONDARY } from '@effects/ui/widgets/constants'
import type { NodeSettingsProps } from './types'

/**
 * Settings pane for `animationController`. Surfaces the per-channel
 * `min` / `max` knobs that map an upstream Signal into a `ChannelSignal`.
 *
 * Slot labels are pulled live from the upstream Config node (same trick
 * the in-graph view uses to relabel `signal_N` handles), so when an
 * effect is wired up the editor sees `0  primary phase  0.0  1.0`
 * instead of `slot 0  0.0  1.0`.
 */

function selectUpstreamConfigId(nodeId: string) {
    return (s: ReactFlowState) =>
        s.edges.find(e => e.target === nodeId && e.targetHandle === 'config')?.source ?? ''
}

function useUpstreamSlots(nodeId: string): Map<number, SlotDef> {
    const upstreamId = useStore(useMemo(() => selectUpstreamConfigId(nodeId), [nodeId]))
    const upstreamOutputs = useNodeOutputs(upstreamId)

    return useMemo(() => {
        if (!upstreamId) return new Map()
        const cfg = upstreamOutputs.config as { __effectName?: string } | undefined
        const name = cfg?.__effectName
        if (!name) return new Map()
        const effect = effects.find(e => e.name === name)
        if (!effect) return new Map()
        return new Map(effect.animation.slots.map(s => [s.slot, s]))
    }, [upstreamId, upstreamOutputs])
}

const ROW_GRID = '14px 1fr 56px 56px'
const ROW_GAP = 0.75

const COMPACT_INPUT_SX = {
    '& .MuiOutlinedInput-input': {
        textAlign: 'right' as const,
        fontVariantNumeric: 'tabular-nums',
    },
}

const PARTIAL_NUMERIC = /^-?(?:\d+\.?\d*|\.\d*)?$/

interface CompactNumberProps {
    value: number
    onChange: (v: number) => void
}

const CompactNumber = memo(function CompactNumber({ value, onChange }: CompactNumberProps) {
    const [text, setText] = useState(() => formatExternal(value))
    const lastExternal = useRef(value)

    useEffect(() => {
        if (value !== lastExternal.current) {
            lastExternal.current = value
            setText(formatExternal(value))
        }
    }, [value])

    const handleChange = (raw: string) => {
        if (!PARTIAL_NUMERIC.test(raw)) return
        setText(raw)
        const n = parseFloat(raw)
        if (Number.isFinite(n)) {
            lastExternal.current = n
            onChange(n)
        }
    }

    const handleBlur = () => {
        const n = parseFloat(text)
        if (Number.isFinite(n)) {
            const normalised = formatExternal(n)
            setText(normalised)
            lastExternal.current = n
            if (n !== value) onChange(n)
        } else {
            setText(formatExternal(value))
        }
    }

    return (
        <TextField
            type="text"
            size="small"
            value={text}
            onChange={e => handleChange(e.target.value)}
            onBlur={handleBlur}
            slotProps={{
                htmlInput: {
                    inputMode: 'decimal',
                    pattern: '-?[0-9]*\\.?[0-9]*',
                    className: 'nodrag',
                },
            }}
            sx={COMPACT_INPUT_SX}
            fullWidth
        />
    )
})

function formatExternal(n: number): string {
    if (!Number.isFinite(n)) return '0'
    return String(n)
}

interface ChannelRowProps {
    index: number
    slot: SlotDef | undefined
    minV: number
    maxV: number
    onMin: (v: number) => void
    onMax: (v: number) => void
}

const ChannelRow = memo(function ChannelRow({ index, slot, minV, maxV, onMin, onMax }: ChannelRowProps) {
    const declared = slot != null
    const label = slot?.label ?? `slot ${index}`
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: ROW_GRID,
                alignItems: 'center',
                columnGap: ROW_GAP,
                opacity: declared ? 1 : 0.55,
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
                {index}
            </Typography>
            <Typography
                component="span"
                noWrap
                title={label}
                sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: COL_SECONDARY,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                    textTransform: 'lowercase',
                }}
            >
                {label}
            </Typography>
            <CompactNumber value={minV} onChange={onMin} />
            <CompactNumber value={maxV} onChange={onMax} />
        </Box>
    )
})

const ColumnHeader = memo(function ColumnHeader() {
    const cell = {
        fontSize: 9,
        fontWeight: 700,
        color: COL_MUTED,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.6,
        textAlign: 'center' as const,
    }
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: ROW_GRID,
                alignItems: 'center',
                columnGap: ROW_GAP,
                pb: 0.25,
            }}
        >
            <span />
            <span />
            <Typography component="span" sx={cell}>min</Typography>
            <Typography component="span" sx={cell}>max</Typography>
        </Box>
    )
})

export const AnimationControllerNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const slotByIndex = useUpstreamSlots(id)
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', rowGap: 0.5 }}>
            <ColumnHeader />
            {Array.from({ length: ANIMATION_CHANNEL_COUNT }, (_, i) => {
                const slot = slotByIndex.get(i)
                const minRaw = data.params[`min_${i}`]
                const maxRaw = data.params[`max_${i}`]
                const minV = minRaw !== undefined ? Number(minRaw) : (slot?.defaultMin ?? 0)
                const maxV = maxRaw !== undefined ? Number(maxRaw) : (slot?.defaultMax ?? 1)
                return (
                    <ChannelRow
                        key={i}
                        index={i}
                        slot={slot}
                        minV={minV}
                        maxV={maxV}
                        onMin={v => set(`min_${i}`, v)}
                        onMax={v => set(`max_${i}`, v)}
                    />
                )
            })}
        </Box>
    )
})
