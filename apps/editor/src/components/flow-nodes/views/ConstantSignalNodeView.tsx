import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { constantSignalDef } from '@effects/runtime/node-engine/processors/constant-signal'
import type { PipelineNodeData } from '../types'

export const ConstantSignalNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const value = (data.params.value ?? 0) as number
    const state = Boolean(data.params.state ?? false)
    return (
        <BaseNodeShell
            title={constantSignalDef.title}
            category={constantSignalDef.category}
            inputs={constantSignalDef.inputs}
            outputs={constantSignalDef.outputs}
        >
            <StatusLine tone="muted">value: {value}</StatusLine>
            <StatusLine tone="muted">state: {state ? 'active' : 'idle'}</StatusLine>
        </BaseNodeShell>
    )
})
