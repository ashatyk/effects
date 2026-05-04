import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import TextField from '@mui/material/TextField'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { textDef } from '../../../node-engine/processors/text'
import type { PipelineNodeData } from '../types'

export const TextNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? '') as string
    return (
        <BaseNodeShell title={textDef.title} category={textDef.category} inputs={textDef.inputs} outputs={textDef.outputs} minWidth={240}>
            <TextField
                value={value}
                onChange={e => set('value', e.target.value)}
                multiline
                rows={2}
                slotProps={{ htmlInput: { className: 'nodrag' } }}
                fullWidth
            />
        </BaseNodeShell>
    )
})
