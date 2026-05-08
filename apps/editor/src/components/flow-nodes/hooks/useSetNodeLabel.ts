import { useCallback } from 'react'
import { useScene } from '../../node-editor/SceneContext'

// Writes data.label via SceneContext (source of truth = pages[], not RF view). Empty clears it.
export function useSetNodeLabel(nodeId: string) {
    const { updateNodeData } = useScene()
    return useCallback((label: string) => {
        const trimmed = label.trim()
        updateNodeData(nodeId, { label: trimmed || undefined })
    }, [nodeId, updateNodeData])
}
