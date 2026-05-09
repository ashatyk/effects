import { memo, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { useUpstreamSourceId } from '../hooks/useUpstreamSourceId'
import { animationControllerDef } from '@effects/runtime/node-engine/processors/animation-controller'
import type { SlotDef } from '@effects/runtime/pipeline/types'
import { effects } from '@effects/runtime'
import type { PipelineNodeData } from '../types'

function useUpstreamSlots(nodeId: string): Map<number, SlotDef> {
    const upstreamId = useUpstreamSourceId(nodeId, 'config')
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
