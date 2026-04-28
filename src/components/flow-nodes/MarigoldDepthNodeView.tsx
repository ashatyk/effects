import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { StatusLine } from './widgets'
import { marigoldDepthDef, MarigoldDepthProcessor } from '../../node-engine/processors/marigold-depth'
import type { PipelineNodeData } from './types'

export const MarigoldDepthNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [statusText, setStatusText] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<MarigoldDepthProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatusText(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title="Marigold Depth" category={marigoldDepthDef.category}
            inputs={marigoldDepthDef.inputs} outputs={marigoldDepthDef.outputs}>
            <StatusLine>{statusText}</StatusLine>
            <StatusLine tone="muted">Marigold Depth (local backend)</StatusLine>
        </BaseNodeShell>
    )
})
