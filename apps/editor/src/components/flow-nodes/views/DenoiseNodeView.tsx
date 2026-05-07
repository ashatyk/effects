import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { denoiseDef } from '@effects/runtime/node-engine/processors/denoise'
import type { PipelineNodeData } from '../types'

export const DenoiseNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const p = data.params
    const radius = (p.radius ?? 4) as number
    const passes = (p.passes ?? 1) as number
    return (
        <BaseNodeShell title={denoiseDef.title} category={denoiseDef.category} inputs={denoiseDef.inputs} outputs={denoiseDef.outputs}>
            <StatusLine tone="muted">r{radius} · {passes}× pass</StatusLine>
        </BaseNodeShell>
    )
})
