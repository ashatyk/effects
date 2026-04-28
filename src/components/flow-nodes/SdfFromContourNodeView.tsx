import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { sdfFromContourDef } from '../../node-engine/processors/sdf-from-contour'
import type { PipelineNodeData } from './types'

export const SdfFromContourNodeView = memo(({ }: NodeProps & { data: PipelineNodeData }) => {
    return (
        <BaseNodeShell
            title="SDF from Contour"
            category={sdfFromContourDef.category}
            inputs={sdfFromContourDef.inputs}
            outputs={sdfFromContourDef.outputs}
        />
    )
})
