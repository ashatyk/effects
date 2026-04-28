import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { StatusLine } from './widgets'
import { materialEstimateDef, MaterialEstimateProcessor } from '../../node-engine/processors/material-estimate'
import type { PipelineNodeData } from './types'

export const MaterialEstimateNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [statusText, setStatusText] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<MaterialEstimateProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatusText(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title="Marigold Materials" category={materialEstimateDef.category}
            inputs={materialEstimateDef.inputs} outputs={materialEstimateDef.outputs}>
            <StatusLine>{statusText}</StatusLine>
            <StatusLine tone="muted">Marigold-IID (local backend)</StatusLine>
        </BaseNodeShell>
    )
})
