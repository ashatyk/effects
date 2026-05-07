import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { blurDef } from '@effects/runtime/node-engine/processors/blur'
import type { PipelineNodeData } from '../types'

export const BlurNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const p = data.params
    const mode = (p.mode ?? 'box') as string
    const radius = (p.radius ?? 8) as number
    const passes = (p.passes ?? 1) as number
    return (
        <BaseNodeShell title={blurDef.title} category={blurDef.category} inputs={blurDef.inputs} outputs={blurDef.outputs}>
            <StatusLine tone="muted">{mode} · r{radius} · {passes}×</StatusLine>
        </BaseNodeShell>
    )
})
