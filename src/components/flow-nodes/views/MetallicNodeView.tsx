import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { SliderField } from '../widgets'
import { metallicDef } from '../../../node-engine/processors/metallic'
import type { PipelineNodeData } from '../types'

export const MetallicNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title={metallicDef.title} category={metallicDef.category} inputs={metallicDef.inputs} outputs={metallicDef.outputs}>
            <SliderField label="radius" value={(p.radius ?? 4) as number} min={1} max={10} step={1} fixed={0} onChange={v => set('radius', v)} />
            <SliderField label="scale" value={(p.scale ?? 3) as number} min={0.5} max={10} step={0.5} fixed={1} onChange={v => set('scale', v)} />
            <SliderField label="highlight bias" value={(p.highlight_bias ?? 0.5) as number} min={0} max={2} step={0.1} fixed={1} onChange={v => set('highlight_bias', v)} />
        </BaseNodeShell>
    )
})
