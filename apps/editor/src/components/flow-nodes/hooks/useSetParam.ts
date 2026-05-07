import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useEngine } from '../context/EngineContext'
import type { PipelineNodeData } from '../types'

export function useSetParam(nodeId: string) {
    const engine = useEngine()
    const { updateNodeData } = useReactFlow()

    return useCallback((key: string, value: unknown) => {
        updateNodeData(nodeId, (node: any) => {
            const data = node.data as PipelineNodeData
            return { params: { ...data.params, [key]: value } }
        })
        const current = engine.getNodeParams(nodeId)
        engine.updateNodeParams(nodeId, { ...current, [key]: value })
    }, [nodeId, engine, updateNodeData])
}
