import { useCallback } from 'react'
import { useScene } from '../../node-editor/SceneContext'

/**
 * Update a node's user-given display name. Symmetric with
 * `useSetParam` but writes `data.label` instead of a `params.<key>`,
 * and routes through `SceneContext.updateNodeData` so the mutation
 * reaches whichever page hosts the node (not just the active page —
 * the active page is React Flow's view, but the SOURCE OF TRUTH is the
 * scene's `pages[]`).
 *
 * Empty / whitespace-only strings clear the label so the header falls
 * back to `def.title`.
 */
export function useSetNodeLabel(nodeId: string) {
    const { updateNodeData } = useScene()
    return useCallback((label: string) => {
        const trimmed = label.trim()
        updateNodeData(nodeId, { label: trimmed || undefined })
    }, [nodeId, updateNodeData])
}
