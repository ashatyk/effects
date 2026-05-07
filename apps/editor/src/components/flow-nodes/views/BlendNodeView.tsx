import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { blendDef } from '@effects/runtime/node-engine/processors/blend'
import type { PipelineNodeData } from '../types'

export const BlendNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const p = data.params
    const mode = (p.mode ?? 'normal') as string
    const opacity = (p.opacity ?? 1) as number
    return (
        <BaseNodeShell title={blendDef.title} category={blendDef.category} inputs={blendDef.inputs} outputs={blendDef.outputs}>
            <StatusLine tone="muted">{mode} · α {opacity.toFixed(2)}</StatusLine>
        </BaseNodeShell>
    )
})
