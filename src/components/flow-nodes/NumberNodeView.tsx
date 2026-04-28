import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import TextField from '@mui/material/TextField'
import { BaseNodeShell } from './BaseNodeShell'
import { useSetParam } from './useSetParam'
import { numberDef } from '../../node-engine/processors/number'
import type { PipelineNodeData } from './types'

export const NumberNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? 0) as number

    return (
        <BaseNodeShell title="Number" category={numberDef.category} inputs={numberDef.inputs} outputs={numberDef.outputs}>
            <TextField
                type="number"
                value={value}
                onChange={e => set('value', parseFloat(e.target.value) || 0)}
                fullWidth
                slotProps={{ htmlInput: { step: 0.1, className: 'nodrag' } }}
            />
        </BaseNodeShell>
    )
})
