import { useCallback } from 'react'
import { useScene } from '../../node-editor/SceneContext'

// Toggle data.runtimeDynamic. When true, bakePipeline keeps the node live (taint seed) instead
// of folding it into a constant payload. Stored as undefined when false so untouched nodes stay
// structurally identical.
export function useSetRuntimeDynamic(nodeId: string) {
    const { updateNodeData } = useScene()
    return useCallback((on: boolean) => {
        updateNodeData(nodeId, { runtimeDynamic: on ? true : undefined })
    }, [nodeId, updateNodeData])
}
