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
                /* `alignItems: 'center'` (via sx — MUI 8's `Stack` typing
                 * dropped the top-level `alignItems` prop) puts the
                 * slider's vertical mid-line (the thumb) on the same
                 * horizontal line as the value text. Without it Stack
                 * defaults to `stretch` and the readout floats relative
                 * to the thumb, which the user sees as mis-centred
                 * values right of every slider. The slider also carries
                 * its own ~16 px small-size height; flex centring keeps
                 * us robust to that without hard-coding a row height. */
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
                        /* `lineHeight: 1` makes the text box its own
                         * tight glyph height so flex centring lands
                         * the visual midline of the digits exactly on
                         * the slider's thumb, not the caption's full
                         * 1.66 line-box midline. */
                        lineHeight: 1,
                    }}
                >
                    {display}
                </Typography>
            </Stack>
        </Field>
    )
})
