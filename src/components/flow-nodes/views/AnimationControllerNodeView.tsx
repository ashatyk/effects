import { memo, useMemo } from 'react'
import { useStore, type NodeProps, type ReactFlowState } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { NumberField, SectionTitle } from '../widgets'
import { animationControllerDef } from '../../../node-engine/processors/animation-controller'
import { ANIMATION_CHANNEL_COUNT, type SlotDef } from '../../../pipeline/types'
import { effects } from '../../../effects'
import type { PipelineNodeData } from '../types'

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
            minWidth={280}
        >
            {Array.from({ length: ANIMATION_CHANNEL_COUNT }, (_, i) => {
                const slot = slotByIndex.get(i)
                const minRaw = data.params[`min_${i}`]
                const maxRaw = data.params[`max_${i}`]
                const minV = minRaw !== undefined ? Number(minRaw) : (slot?.defaultMin ?? 0)
                const maxV = maxRaw !== undefined ? Number(maxRaw) : (slot?.defaultMax ?? 1)
                /* Slots not declared by the active effect are still rendered —
                   shaders can opt into any pool index regardless of manifest,
                   and we want the user to be able to wire them up. */
                const label = slot?.label ?? `Slot ${i}`
                return (
                    <Stack key={i} sx={{ mt: i === 0 ? 0 : 2 }}>
                        <SectionTitle>{`${i} · ${label}`}</SectionTitle>
                        <NumberField label="min" value={minV} step={0.1} onChange={v => set(`min_${i}`, v)} />
                        <NumberField label="max" value={maxV} step={0.1} onChange={v => set(`max_${i}`, v)} />
                    </Stack>
                )
            })}
        </BaseNodeShell>
    )
})
