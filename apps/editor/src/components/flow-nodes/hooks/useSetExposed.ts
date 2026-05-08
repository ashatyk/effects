import { useCallback } from 'react'
import { useScene } from '../../node-editor/SceneContext'
import type { ExposedMeta } from '../types'

// Writes data.exposed via SceneContext so the update reaches whichever page hosts the node.
// undefined clears it; partial records replace wholesale (inspector always sends a full record).
export function useSetExposed(nodeId: string) {
    const { updateNodeData } = useScene()
    return useCallback((exposed: ExposedMeta | undefined) => {
        updateNodeData(nodeId, { exposed })
    }, [nodeId, updateNodeData])
}
