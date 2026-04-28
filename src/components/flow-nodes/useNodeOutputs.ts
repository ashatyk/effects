import { useState, useEffect } from 'react'
import { useEngine } from './EngineContext'

export function useNodeOutputs(nodeId: string): Record<string, unknown> {
    const engine = useEngine()
    const [outputs, setOutputs] = useState<Record<string, unknown>>({})

    useEffect(() => {
        return engine.subscribeNode(nodeId, () => {
            const o = engine.getOutputs(nodeId)
            if (o) setOutputs({ ...o })
        })
    }, [engine, nodeId])

    return outputs
}
