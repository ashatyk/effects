import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { remapDef } from '@effects/runtime/node-engine/processors/remap'
import type { PipelineNodeData } from '../types'

export const RemapNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const p = data.params
    const op = (p.op ?? 'passthrough') as string
    const strength = (p.strength ?? 2) as number
    return (
        <BaseNodeShell title={remapDef.title} category={remapDef.category} inputs={remapDef.inputs} outputs={remapDef.outputs}>
            <StatusLine tone="muted">
                {op}{op === 'contrast' ? ` · ${strength.toFixed(1)}` : ''}
            </StatusLine>
        </BaseNodeShell>
    )
})
