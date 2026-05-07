import { memo } from 'react'
import Switch from '@mui/material/Switch'
import Box from '@mui/material/Box'
import { Field } from './Field'

interface SwitchFieldProps {
    label: string
    checked: boolean
    onChange: (v: boolean) => void
}

export const SwitchField = memo(function SwitchField({ label, checked, onChange }: SwitchFieldProps) {
    return (
        <Field label={label}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Switch
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                    className="nodrag"
                />
            </Box>
        </Field>
    )
})
