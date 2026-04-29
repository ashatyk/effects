import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { SelectField, SliderField } from '../widgets'
import { blendDef, BLEND_MODES } from '../../../node-engine/processors/blend'
import type { PipelineNodeData } from '../types'

type BlendMode = typeof BLEND_MODES[number]

export const BlendNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title={blendDef.title} category={blendDef.category} inputs={blendDef.inputs} outputs={blendDef.outputs}>
            <SelectField label="mode" value={(p.mode ?? 'normal') as BlendMode} options={BLEND_MODES} onChange={v => set('mode', v)} />
            <SliderField label="opacity" value={(p.opacity ?? 1) as number} min={0} max={1} step={0.05} fixed={2}
                onChange={v => set('opacity', v)} />
        </BaseNodeShell>
    )
})
