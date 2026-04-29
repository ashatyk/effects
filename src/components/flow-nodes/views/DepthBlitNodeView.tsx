import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { depthBlitDef } from '../../../node-engine/processors/depth-blit'
import type { PipelineNodeData } from '../types'

export const DepthBlitNodeView = memo(({ }: NodeProps & { data: PipelineNodeData }) => {
    return (
        <BaseNodeShell title={depthBlitDef.title} category={depthBlitDef.category} inputs={depthBlitDef.inputs} outputs={depthBlitDef.outputs} />
    )
})
