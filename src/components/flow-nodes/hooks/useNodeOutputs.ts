import { useState, useEffect } from 'react'
import { useEngine } from '../context/EngineContext'

/**
 * Subscribe to a node's engine outputs and re-render when they change.
 *
 * Initial state is hydrated synchronously from `engine.getOutputs(nodeId)` so
 * a freshly-mounted view sees the latest produced values immediately — for
 * non-alwaysDirty processors (e.g. Config) the next subscription
 * notification might never fire on its own after mount, so without this we'd
 * show stale/empty data until the user touches an upstream param.
 *
 * Passing an empty `nodeId` is safe: subscribeNode bails out and the hook
 * just returns `{}`.
 */
export function useNodeOutputs(nodeId: string): Record<string, unknown> {
    const engine = useEngine()
    const [outputs, setOutputs] = useState<Record<string, unknown>>(
        () => (nodeId ? { ...(engine.getOutputs(nodeId) ?? {}) } : {}),
    )

    useEffect(() => {
        if (!nodeId) {
            setOutputs({})
            return
        }
        const initial = engine.getOutputs(nodeId)
        if (initial) setOutputs({ ...initial })
        return engine.subscribeNode(nodeId, () => {
            const o = engine.getOutputs(nodeId)
            if (o) setOutputs({ ...o })
        })
    }, [engine, nodeId])

    return outputs
}
