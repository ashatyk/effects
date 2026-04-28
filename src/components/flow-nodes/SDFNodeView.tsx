import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { sdfDef } from '../../node-engine/processors/sdf'
import type { PipelineNodeData } from './types'

export const SDFNodeView = memo(({ }: NodeProps & { data: PipelineNodeData }) => {
    return (
        <BaseNodeShell title="SDF" category={sdfDef.category} inputs={sdfDef.inputs} outputs={sdfDef.outputs} />
    )
})
