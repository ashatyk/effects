import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '../widgets'
import { blurDef } from '../../../node-engine/processors/blur'
import type { PipelineNodeData } from '../types'

const MODES = ['box', 'gaussian', 'sdf-packed'] as const
type BlurMode = typeof MODES[number]

export const BlurNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title={blurDef.title} category={blurDef.category} inputs={blurDef.inputs} outputs={blurDef.outputs}>
            <SelectField label="mode" value={(p.mode ?? 'box') as BlurMode} options={MODES} onChange={v => set('mode', v)} />
            <NumberField label="radius" value={(p.radius ?? 8) as number} min={1} max={60} step={1}
                onChange={v => set('radius', Math.max(1, Math.round(v)))} />
            <NumberField label="step/σ" value={(p.step_sigma ?? 2.0) as number} min={0.5} max={15} step={0.5}
                onChange={v => set('step_sigma', v || 0.5)} />
            <NumberField label="passes" value={(p.passes ?? 1) as number} min={1} max={6} step={1}
                onChange={v => set('passes', Math.max(1, Math.round(v)))} />
        </BaseNodeShell>
    )
})
