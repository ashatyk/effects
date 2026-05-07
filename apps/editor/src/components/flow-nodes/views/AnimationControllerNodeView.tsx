import { memo, useMemo } from 'react'
import { useStore, type NodeProps, type ReactFlowState } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { animationControllerDef } from '@effects/runtime/node-engine/processors/animation-controller'
import type { SlotDef } from '@effects/runtime/pipeline/types'
import { effects } from '@effects/runtime'
import type { PipelineNodeData } from '../types'

/**
 * Look upstream through the React Flow graph for a Config node feeding our
 * `config` input. Returns slot metadata for the active effect when present.
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

/**
 * Graph card: visual-only — handles + slot-aware input labels (`ch4 ·
 * intensity multiplier`). Editable per-slot min/max grid lives in
 * `AnimationControllerNodeSettings`.
 */
export const AnimationControllerNodeView = memo(function AnimationControllerNodeView(
    { id }: NodeProps & { data: PipelineNodeData },
) {
    const slotByIndex = useUpstreamSlots(id)

    const labelledInputs = useMemo(() => {
        return animationControllerDef.inputs.map(h => {
            const m = /^signal_(\d+)$/.exec(h.name)
            if (!m) return h
            const idx = parseInt(m[1], 10)
            const slot = slotByIndex.get(idx)
            if (!slot) return h
            return { ...h, label: `ch${idx} · ${slot.label}` }
        })
    }, [slotByIndex])

    return (
        <BaseNodeShell
            title="Animation Controller"
            category={animationControllerDef.category}
            inputs={labelledInputs}
            outputs={animationControllerDef.outputs}
            minWidth={240}
        />
    )
})
