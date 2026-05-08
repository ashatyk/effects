import { useState, useEffect } from 'react'
import { useEngine } from '../context/EngineContext'

const EMPTY: Record<string, unknown> = Object.freeze({})

// Hydrates synchronously from getOutputs so non-alwaysDirty processors (e.g. Config) don't
// render empty until the user touches an upstream param. We store the engine reference directly
// (no spread) — the engine already diff-gates notifications via outputsEqual.
export function useNodeOutputs(nodeId: string): Record<string, unknown> {
    const engine = useEngine()
    const [outputs, setOutputs] = useState<Record<string, unknown>>(
        () => (nodeId ? (engine.getOutputs(nodeId) ?? EMPTY) : EMPTY),
    )

    useEffect(() => {
        if (!nodeId) {
            setOutputs(EMPTY)
            return
        }
        const initial = engine.getOutputs(nodeId)
        if (initial) setOutputs(initial)
        return engine.subscribeNode(nodeId, () => {
            const o = engine.getOutputs(nodeId)
            if (o) setOutputs(o)
        })
    }, [engine, nodeId])

    return outputs
}
