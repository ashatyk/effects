import { memo, useMemo } from 'react'
import { useStore, type NodeProps, type ReactFlowState } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { effectDef } from '../../../node-engine/processors/effect'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { effects } from '../../../effects'
import type { TextureSlotDef } from '../../../pipeline/types'
import type { PipelineNodeData } from '../types'

/**
 * Walk one hop upstream through React Flow to the Config node feeding our
 * `config` input, and pull the manifest's texture-slot declarations. Mirrors
 * `useUpstreamSlots` in AnimationControllerNodeView, but reads the texture
 * channel labels (`PlaygroundConfig.textures.slots`) instead of animation
 * channels — so the user sees `txcn0 · SDF` style captions next to the
 * matching input handle as soon as a Config is wired in.
 *
 * Reactivity comes from two places:
 *   1. `useStore` selector against the edge list — re-renders when the wire
 *      to `config` is added / removed / re-routed.
 *   2. `useNodeOutputs` on the resolved upstream id — re-renders when the
 *      Config processor publishes a new `__effectName` (user picks a
 *      different effect from its dropdown).
 */
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

    /* Override the static `txcn{N}` input labels with the slot.label exposed
       by the upstream config when present. Wiring is much easier when
       `txcn0` reads as "SDF (signed distance)" right next to the port —
       mirrors the AnimationController treatment of signal_{N} handles.
       Falls back to the bare `txcn{N}` label when no Config is connected
       or when the active effect declares no slot for that index. */
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
