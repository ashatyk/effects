import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useNodeOutputs } from '../hooks/useNodeOutputs'
import { StatusLine } from '../widgets'
import { textStripDef } from '../../../node-engine/processors/text-strip'
import type { PipelineNodeData } from '../types'

export const TextStripNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const outputs = useNodeOutputs(id)
    const tex = outputs.texture as { width?: number; height?: number } | null | undefined
    const ready = tex != null
    const aspect = ready && tex?.width && tex?.height && tex.height > 0
        ? tex.width / tex.height
        : null
    const status = ready
        ? `aspect ${aspect != null ? aspect.toFixed(2) : '?'}`
        : 'idle'
    return (
        <BaseNodeShell
            title={textStripDef.title}
            category={textStripDef.category}
            inputs={textStripDef.inputs}
            outputs={textStripDef.outputs}
            minWidth={240}
        >
            <StatusLine tone={ready ? 'normal' : 'muted'}>{status}</StatusLine>
        </BaseNodeShell>
    )
})
