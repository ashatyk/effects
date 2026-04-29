import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { SliderField } from '../widgets'
import { denoiseDef } from '../../../node-engine/processors/denoise'
import type { PipelineNodeData } from '../types'

export const DenoiseNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title={denoiseDef.title} category={denoiseDef.category} inputs={denoiseDef.inputs} outputs={denoiseDef.outputs}>
            <SliderField label="radius" value={(p.radius ?? 4) as number} min={1} max={8} step={1} fixed={0} onChange={v => set('radius', v)} />
            <SliderField label="spatial σ" value={(p.spatial_sigma ?? 3) as number} min={0.5} max={10} step={0.1} fixed={1} onChange={v => set('spatial_sigma', v)} />
            <SliderField label="range σ" value={(p.range_sigma ?? 0.1) as number} min={0.01} max={0.5} step={0.01} fixed={2} onChange={v => set('range_sigma', v)} />
            <SliderField label="passes" value={(p.passes ?? 1) as number} min={1} max={5} step={1} fixed={0} onChange={v => set('passes', v)} />
        </BaseNodeShell>
    )
})
