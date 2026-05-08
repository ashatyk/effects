import { memo, useMemo } from 'react'
import { useStore, type NodeProps, type ReactFlowState } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { effectDef } from '@effects/runtime/node-engine/processors/effect'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { effects } from '@effects/runtime'
import type { TextureSlotDef } from '@effects/runtime/pipeline/types'
import type { PipelineNodeData } from '../types'

// One-hop upstream Config lookup → manifest texture-slot labels. Reactive on edge changes
// (useStore on edges) and Config dropdown changes (useNodeOutputs on __effectName).
function selectUpstreamConfigId(nodeId: string) {
    return (s: ReactFlowState) =>
        s.edges.find(e => e.target === nodeId && e.targetHandle === 'config')?.source ?? ''
}

function useUpstreamTextureSlots(nodeId: string): Map<number, TextureSlotDef> {
    const upstreamId = useStore(useMemo(() => selectUpstreamConfigId(nodeId), [nodeId]))
    const upstreamOutputs = useNodeOutputs(upstreamId)

    return useMemo(() => {
        if (!upstreamId) return new Map()
        const cfg = upstreamOutputs.config as { __effectName?: string } | undefined
        const name = cfg?.__effectName
        if (!name) return new Map()
        const effect = effects.find(e => e.name === name)
        if (!effect?.textures) return new Map()
        return new Map(effect.textures.slots.map(s => [s.slot, s]))
    }, [upstreamId, upstreamOutputs])
}

export const EffectNodeView = memo(function EffectNodeView(
    { id }: NodeProps & { data: PipelineNodeData },
) {
    const slotByIndex = useUpstreamTextureSlots(id)

    // Suffix txcn{N} input labels with upstream slot.label when present (mirrors AnimationController).
    const labelledInputs = useMemo(() => {
        return effectDef.inputs.map(h => {
            const m = /^txcn(\d+)$/.exec(h.name)
            if (!m) return h
            const idx = parseInt(m[1], 10)
            const slot = slotByIndex.get(idx)
            if (!slot) return h
            return { ...h, label: `txcn${idx} · ${slot.label}` }
        })
    }, [slotByIndex])

    return (
        <BaseNodeShell
            title={effectDef.title}
            category={effectDef.category}
            inputs={labelledInputs}
            outputs={effectDef.outputs}
        />
    )
})
