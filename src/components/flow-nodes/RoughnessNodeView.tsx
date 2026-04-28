import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useSetParam } from './useSetParam'
import { SliderField } from './widgets'
import { roughnessDef } from '../../node-engine/processors/roughness'
import type { PipelineNodeData } from './types'

export const RoughnessNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title="Texture Detail" category={roughnessDef.category} inputs={roughnessDef.inputs} outputs={roughnessDef.outputs}>
            <SliderField label="radius" value={(p.radius ?? 6) as number} min={2} max={10} step={1} fixed={0} onChange={v => set('radius', v)} />
            <SliderField label="scale" value={(p.scale ?? 2) as number} min={0.5} max={10} step={0.1} fixed={1} onChange={v => set('scale', v)} />
            <SliderField label="threshold" value={(p.threshold ?? 0.0005) as number} min={0} max={0.005} step={0.0001} fixed={4} onChange={v => set('threshold', v)} />
        </BaseNodeShell>
    )
})
