import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { StatusLine } from './widgets'
import { depthEstimateDef } from '../../node-engine/processors/depth-estimate'
import { DepthEstimateProcessor } from '../../node-engine/processors/depth-estimate'
import type { PipelineNodeData } from './types'

export const DepthEstimateNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [status, setStatus] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<DepthEstimateProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatus(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title="Depth Estimate" category={depthEstimateDef.category} inputs={depthEstimateDef.inputs} outputs={depthEstimateDef.outputs}>
            <StatusLine>{status}</StatusLine>
        </BaseNodeShell>
    )
})
