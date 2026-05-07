import { createContext, useContext } from 'react'
import { useNodeId } from '@xyflow/react'
import type { PipelineNodeData } from '../types'

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

/**
 * Carries the live `data` of a node when its view is rendered outside
 * the React Flow store (i.e. in headless mode — pin sidebar). Inside
 * the React Flow canvas, BaseNodeShell can read live data via
 * `useStore`; for headless cards the React Flow store is irrelevant
 * (the pinned node may even live on a different page), so the parent
 * provides it explicitly.
 *
 * Keeping it as a separate context (vs piggy-backing on NodeIdContext)
 * means components that only need the id don't subscribe to data
 * mutations and re-render needlessly.
 */
const HeadlessNodeDataCtx = createContext<PipelineNodeData | null>(null)

export const HeadlessNodeDataProvider = HeadlessNodeDataCtx.Provider

export function useHeadlessNodeData(): PipelineNodeData | null {
    return useContext(HeadlessNodeDataCtx)
}
