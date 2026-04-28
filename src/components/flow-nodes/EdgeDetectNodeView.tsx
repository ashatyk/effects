import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useSetParam } from './useSetParam'
import { SliderField } from './widgets'
import { edgeDetectDef } from '../../node-engine/processors/edge-detect'
import type { PipelineNodeData } from './types'

export const EdgeDetectNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title="Edge Detect" category={edgeDetectDef.category} inputs={edgeDetectDef.inputs} outputs={edgeDetectDef.outputs}>
            <SliderField label="threshold" value={(p.threshold ?? 0.05) as number} min={0} max={0.5} step={0.01} fixed={2} onChange={v => set('threshold', v)} />
            <SliderField label="strength" value={(p.strength ?? 1.5) as number} min={0.1} max={10} step={0.1} fixed={1} onChange={v => set('strength', v)} />
        </BaseNodeShell>
    )
})
