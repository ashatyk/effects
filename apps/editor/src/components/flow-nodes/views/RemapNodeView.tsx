import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '@effects/ui'
import { remapDef, REMAP_OPS } from '@effects/runtime/node-engine/processors/remap'
import type { PipelineNodeData } from '../types'

type RemapOp = typeof REMAP_OPS[number]

export const RemapNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <BaseNodeShell title={remapDef.title} category={remapDef.category} inputs={remapDef.inputs} outputs={remapDef.outputs}>
            <SelectField label="op" value={(p.op ?? 'passthrough') as RemapOp} options={REMAP_OPS} onChange={v => set('op', v)} />
            <NumberField label="strength" value={(p.strength ?? 2) as number} min={0} max={10} step={0.1} onChange={v => set('strength', v)} />
        </BaseNodeShell>
    )
})
