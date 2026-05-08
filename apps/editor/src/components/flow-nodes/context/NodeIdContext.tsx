import { createContext, useContext } from 'react'
import { useNodeId } from '@xyflow/react'
import type { PipelineNodeData } from '../types'

// Mirrors useNodeId() for views rendered outside RF (pin sidebar). useResolvedNodeId() consults both.
const NodeIdCtx = createContext<string | null>(null)

export const NodeIdProvider = NodeIdCtx.Provider

export function useResolvedNodeId(): string | null {
    const fromCtx = useContext(NodeIdCtx)
    const fromFlow = useNodeId()
    return fromCtx ?? fromFlow
}

// Live `data` for headless views (pin sidebar). Separate from NodeIdCtx so id-only consumers
// don't re-render on data mutations.
const HeadlessNodeDataCtx = createContext<PipelineNodeData | null>(null)

export const HeadlessNodeDataProvider = HeadlessNodeDataCtx.Provider

export function useHeadlessNodeData(): PipelineNodeData | null {
    return useContext(HeadlessNodeDataCtx)
}
