import { createContext, useContext } from 'react'
import { useNodeId } from '@xyflow/react'

/**
 * Mirrors react-flow's `useNodeId()` for environments where the NodeView is
 * rendered outside of a ReactFlow node — e.g. the pin sidebar. Inside react-
 * flow, `useNodeId()` already returns the id; outside, this provider supplies
 * the missing piece. `useResolvedNodeId()` consults both.
 */
const NodeIdCtx = createContext<string | null>(null)

export const NodeIdProvider = NodeIdCtx.Provider

export function useResolvedNodeId(): string | null {
    const fromCtx = useContext(NodeIdCtx)
    const fromFlow = useNodeId()
    return fromCtx ?? fromFlow
}
