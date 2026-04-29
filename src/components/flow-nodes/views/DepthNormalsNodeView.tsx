import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { SliderField } from '../widgets'
import { depthNormalsDef } from '../../../node-engine/processors/depth-normals'
import type { PipelineNodeData } from '../types'

export const DepthNormalsNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    return (
        <BaseNodeShell title={depthNormalsDef.title} category={depthNormalsDef.category} inputs={depthNormalsDef.inputs} outputs={depthNormalsDef.outputs}>
            <SliderField
                label="strength"
                value={(data.params.strength ?? 2) as number}
                min={0.1}
                max={20}
                step={0.1}
                fixed={1}
                onChange={v => set('strength', v)}
            />
        </BaseNodeShell>
    )
})
