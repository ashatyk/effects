import { memo } from 'react'
import TextField from '@mui/material/TextField'
import { useSetParam } from '../hooks/useSetParam'
import type { NodeSettingsProps } from './types'

export const NumberNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? 0) as number
    return (
        <TextField
            type="number"
            value={value}
            onChange={e => set('value', parseFloat(e.target.value) || 0)}
            fullWidth
            slotProps={{ htmlInput: { step: 0.1, className: 'nodrag' } }}
        />
    )
})
