import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { Field } from './Field'

interface SelectFieldProps<T extends string> {
    label: string
    value: T
    options: readonly T[] | T[]
    onChange: (v: T) => void
    column?: boolean
    formatOption?: (v: T) => string
    optionStyle?: (v: T) => React.CSSProperties | undefined
    selectStyle?: React.CSSProperties
}

export function SelectField<T extends string>({
    label, value, options, onChange, column, formatOption, optionStyle, selectStyle,
}: SelectFieldProps<T>) {
    return (
        <Field label={label} column={column}>
            <TextField
                select
                value={value}
                onChange={e => onChange(e.target.value as T)}
                slotProps={{
                    htmlInput: { className: 'nodrag' },
                    select: {
                        sx: selectStyle,
                        /* No `MenuProps.classes.paper`: legacy `.pn-menu-paper`
                           force-painted the dropdown white (for light-card
                           popovers) and read as a glaring bright rectangle on
                           the dark Settings rail. Expose a `light` prop if a
                           future consumer needs the light variant. */
                    },
                }}
                fullWidth
            >
                {options.map(o => (
                    <MenuItem key={o} value={o} style={optionStyle?.(o)}>
                        {formatOption ? formatOption(o) : o}
                    </MenuItem>
                ))}
            </TextField>
        </Field>
    )
}
