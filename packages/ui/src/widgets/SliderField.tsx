import { memo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Slider from '@mui/material/Slider'
import { COL_SECONDARY } from './constants'
import { Field } from './Field'

interface SliderFieldProps {
    label: string
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    step?: number
    fixed?: number
    disabled?: boolean
}

export const SliderField = memo(function SliderField({
    label, value, onChange, min = 0, max = 1, step = 0.01, fixed = 2, disabled,
}: SliderFieldProps) {
    const display = fixed === 0
        ? Math.round(value).toString()
        : value.toFixed(fixed)
    return (
        <Field label={label}>
            <Stack
                direction="row"
                /* `alignItems` lives in `sx` because MUI 8's `Stack` typing
                 * dropped the top-level prop. Centring keeps the readout on
                 * the thumb's mid-line without hard-coding a row height. */
                sx={{ width: '100%', alignItems: 'center' }}
            >
                <Slider
                    value={Number.isFinite(value) ? value : min}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(_, v) => onChange(typeof v === 'number' ? v : v[0])}
                    disabled={disabled}
                    className="nodrag"
                    sx={{ flex: 1, minWidth: 0, display: 'block' }}
                    size="small"
                />
                <Typography
                    variant="caption"
                    sx={{
                        width: 44,
                        textAlign: 'right',
                        flexShrink: 0,
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        color: COL_SECONDARY,
                        fontVariantNumeric: 'tabular-nums',
                        /* `lineHeight: 1` collapses the caption's line-box
                         * to its glyph height so flex centring lands on the
                         * digits' midline, not the caption's 1.66 midline. */
                        lineHeight: 1,
                    }}
                >
                    {display}
                </Typography>
            </Stack>
        </Field>
    )
})
