import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { depthProjectDef } from '../../node-engine/processors/depth-project'
import type { PipelineNodeData } from './types'

export const DepthProjectNodeView = memo(({ }: NodeProps & { data: PipelineNodeData }) => {
    return (
        <BaseNodeShell title="Depth Project" category={depthProjectDef.category} inputs={depthProjectDef.inputs} outputs={depthProjectDef.outputs} />
    )
})
