import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { StatusLine } from '../widgets'
import { marigoldNormalsDef, MarigoldNormalsProcessor } from '../../../node-engine/processors/marigold-normals'
import type { PipelineNodeData } from '../types'

export const MarigoldNormalsNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [statusText, setStatusText] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<MarigoldNormalsProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatusText(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title={marigoldNormalsDef.title} category={marigoldNormalsDef.category}
            inputs={marigoldNormalsDef.inputs} outputs={marigoldNormalsDef.outputs}>
            <StatusLine>{statusText}</StatusLine>
            <StatusLine tone="muted">Marigold Normals (local backend)</StatusLine>
        </BaseNodeShell>
    )
})
