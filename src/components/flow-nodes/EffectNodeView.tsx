import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { effectDef } from '../../node-engine/processors/effect'
import type { PipelineNodeData } from './types'

export const EffectNodeView = memo(({ }: NodeProps & { data: PipelineNodeData }) => {
    return (
        <BaseNodeShell title="Effect" category={effectDef.category} inputs={effectDef.inputs} outputs={effectDef.outputs} />
    )
})
