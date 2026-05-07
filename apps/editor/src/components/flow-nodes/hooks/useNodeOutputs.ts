import { useState, useEffect } from 'react'
import { useEngine } from '../context/EngineContext'

const EMPTY: Record<string, unknown> = Object.freeze({})

/**
 * Subscribe to a node's engine outputs and re-render when they change.
 *
 * Initial state is hydrated synchronously from `engine.getOutputs(nodeId)` so
 * a freshly-mounted view sees the latest produced values immediately — for
 * processors that aren't alwaysDirty (e.g. Config) the next subscription
 * notification might never fire on its own after mount, so without this we'd
 * show stale/empty data until the user touches an upstream param.
 *
 * The hook stores the engine's outputs reference directly — no shallow
 * spread. The engine already diff-gates notifications (see
 * `dataflow-engine.ts → outputsEqual`), so subscribers are only invoked
 * when the produced values actually change. Spreading would re-allocate
 * `{...o}` on every notify and force every consumer to re-render even
 * when the underlying data is value-equal across ticks.
 *
 * Passing an empty `nodeId` is safe: subscribeNode bails out and the hook
 * returns a frozen empty record.
 */
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
