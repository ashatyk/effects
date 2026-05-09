import { useMemo } from 'react'
import { useStore, type ReactFlowState } from '@xyflow/react'

// React Flow edges keep the *visual* source — a Clone (ref) wrapper still owns its own id.
// `resolveSceneForEngine` collapses clones to their origin before `engine.setEdges`, so any
// editor-side lookup that wants to talk to the engine (`useNodeOutputs`) MUST go through the
// origin id too. Otherwise the engine returns nothing for the clone's id and downstream UI
// (slot labels, default min/max, etc.) silently falls back to empty.
export function useUpstreamSourceId(nodeId: string, handle: string): string {
    const selector = useMemo(
        () => (s: ReactFlowState) => {
            const edge = s.edges.find(e => e.target === nodeId && e.targetHandle === handle)
            if (!edge) return ''
            const lookup = (s as unknown as { nodeLookup?: Map<string, { data?: { cloneOf?: string } }> }).nodeLookup
            const cloneOf = lookup?.get?.(edge.source)?.data?.cloneOf
            return cloneOf || edge.source
        },
        [nodeId, handle],
    )
    return useStore(selector)
}
