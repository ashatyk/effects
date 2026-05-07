import { useCallback } from 'react'
import { useScene } from '../../node-editor/SceneContext'
import type { ExposedMeta } from '../types'

/**
 * Update a node's supplier-exposure metadata. Symmetric with
 * `useSetParam` / `useSetNodeLabel` but writes `data.exposed` and
 * routes through `SceneContext.updateNodeData` so the mutation
 * reaches whichever page hosts the node (not just the active page).
 *
 * Passing `undefined` clears the exposure metadata entirely (the
 * supplier won't see this node at all). Passing a partial mode update
 * (e.g. `{ mode: 'whole' }`) replaces the previous metadata wholesale
 * — this is intentional, the inspector always sends a full record so
 * the call site doesn't have to merge.
 */
export function useSetExposed(nodeId: string) {
    const { updateNodeData } = useScene()
    return useCallback((exposed: ExposedMeta | undefined) => {
        updateNodeData(nodeId, { exposed })
    }, [nodeId, updateNodeData])
}
