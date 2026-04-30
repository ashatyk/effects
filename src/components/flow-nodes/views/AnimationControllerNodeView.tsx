import { memo, useMemo } from 'react'
import { useStore, type NodeProps, type ReactFlowState } from '@xyflow/react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { animationControllerDef } from '../../../node-engine/processors/animation-controller'
import { ANIMATION_CHANNEL_COUNT, type SlotDef } from '../../../pipeline/types'
import { effects } from '../../../effects'
import type { PipelineNodeData } from '../types'
import { COL_MUTED, COL_SECONDARY } from '../widgets/constants'

/**
 * Look upstream through the React Flow graph for a Config node feeding our
 * `config` input. Returns slot metadata for the active effect when present.
 *
 * Reactivity comes from two places:
 *   1. `useStore` selector against React Flow's edge list — re-renders the
 *      view when the wire is added / removed / re-routed.
 *   2. `useNodeOutputs` on the resolved upstream id — re-renders when the
 *      Config processor publishes a new `__effectName` (e.g. user picks a
 *      different effect from the dropdown).
 *
 * Without both, the labels would only refresh on a full mount (page reload).
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

/* Layout constants. The grid is shared between the header row and every
   channel row so the `min`/`max` columns stay perfectly aligned regardless
   of label length. */
const ROW_GRID = '14px 1fr 56px 56px'
const ROW_GAP = 0.75

/* Channel-row specifics on top of the global compact `.pn` input chrome:
   right-aligned tabular numerics so digits line up across the 8 rows, and
   no native spinner buttons (rows are too tight; keyboard arrows still
   step the value). */
const COMPACT_INPUT_SX = {
    '& .MuiOutlinedInput-input': {
        textAlign: 'right' as const,
        fontVariantNumeric: 'tabular-nums',
    },
    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
        WebkitAppearance: 'none',
        margin: 0,
    },
    '& input[type=number]': { MozAppearance: 'textfield' },
}

interface CompactNumberProps {
    value: number
    onChange: (v: number) => void
    step?: number
}

const CompactNumber = memo(function CompactNumber({ value, onChange, step = 0.1 }: CompactNumberProps) {
    return (
        <TextField
            type="number"
            size="small"
            value={Number.isFinite(value) ? value : 0}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            slotProps={{ htmlInput: { step, className: 'nodrag' } }}
            sx={COMPACT_INPUT_SX}
            fullWidth
        />
    )
})

interface ChannelRowProps {
    index: number
    slot: SlotDef | undefined
    minV: number
    maxV: number
    onMin: (v: number) => void
    onMax: (v: number) => void
}

const ChannelRow = memo(function ChannelRow({ index, slot, minV, maxV, onMin, onMax }: ChannelRowProps) {
    /* Slots not declared by the active effect are still rendered — shaders
       can opt into any pool index regardless of manifest, and we want the
       user to be able to wire them up — but they're visually muted so the
       active slots stand out. */
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

export const AnimationControllerNodeView = memo(function AnimationControllerNodeView(
    { id, data }: NodeProps & { data: PipelineNodeData },
) {
    const set = useSetParam(id)
    const slotByIndex = useUpstreamSlots(id)

    return (
        <BaseNodeShell
            title="Animation Controller"
            category={animationControllerDef.category}
            inputs={animationControllerDef.inputs}
            outputs={animationControllerDef.outputs}
            minWidth={240}
        >
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
        </BaseNodeShell>
    )
})
