import { memo } from 'react'
import TextField from '@mui/material/TextField'
import { Field } from './Field'

interface NumberFieldProps {
    label: string
    value: number
    onChange: (v: number) => void
    step?: number
    min?: number
    max?: number
    disabled?: boolean
}

export const NumberField = memo(function NumberField({ label, value, onChange, step, min, max, disabled }: NumberFieldProps) {
    return (
        <Field label={label}>
            <TextField
                type="number"
                value={Number.isFinite(value) ? value : 0}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                disabled={disabled}
                slotProps={{
                    htmlInput: { step, min, max, className: 'nodrag' },
                }}
                fullWidth
            />
        </Field>
    )
})
