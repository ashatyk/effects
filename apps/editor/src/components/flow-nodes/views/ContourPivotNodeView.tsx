import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { StatusLine } from '@effects/ui'
import {
    contourPivotDef,
    ContourPivotProcessor,
    type PivotMode,
} from '@effects/runtime/node-engine/processors/contour-pivot'
import type { PipelineNodeData } from '../types'

export const ContourPivotNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const mode = (data.params.mode ?? 'area') as PivotMode

    const [pivot, setPivot] = useState<[number, number] | null>(null)
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<ContourPivotProcessor>(id)
            setPivot(proc?.lastPivot ?? null)
        }
        tick()
        return engine.subscribeNode(id, tick)
    }, [engine, id])

    return (
        <BaseNodeShell
            title={contourPivotDef.title}
            category={contourPivotDef.category}
            inputs={contourPivotDef.inputs}
            outputs={contourPivotDef.outputs}
            minWidth={200}
        >
            <StatusLine tone="muted">mode: {mode}</StatusLine>
            {pivot && (
                <StatusLine tone="muted">{`pivot: ${pivot[0].toFixed(1)}, ${pivot[1].toFixed(1)} px`}</StatusLine>
            )}
        </BaseNodeShell>
    )
})
