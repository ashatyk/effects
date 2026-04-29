import { memo } from 'react'
import TextField from '@mui/material/TextField'
import { Field } from './Field'

interface TextFieldRowProps {
    label: string
    value: string
    onChange: (v: string) => void
    multiline?: boolean
    rows?: number
    maxLength?: number
    monospace?: boolean
    column?: boolean
    placeholder?: string
}

export const TextFieldRow = memo(function TextFieldRow({
    label, value, onChange, multiline, rows, maxLength, monospace, column = true, placeholder,
}: TextFieldRowProps) {
    return (
        <Field label={label} column={column}>
            <TextField
                value={value}
                onChange={e => onChange(e.target.value)}
                multiline={multiline}
                rows={multiline ? (rows ?? 3) : undefined}
                placeholder={placeholder}
                slotProps={{
                    htmlInput: {
                        className: 'nodrag',
                        maxLength,
                        spellCheck: !monospace,
                        style: monospace
                            ? { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11 }
                            : undefined,
                    },
                }}
                fullWidth
            />
        </Field>
    )
})
