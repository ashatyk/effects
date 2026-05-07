import { memo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { COL_SECONDARY, COL_DIVIDER } from './constants'
import { Field } from './Field'

interface ColorFieldProps {
    label: string
    value: string
    onChange: (hex: string) => void
    extra?: string
}

export const ColorField = memo(function ColorField({ label, value, onChange, extra }: ColorFieldProps) {
    return (
        <Field label={label}>
            <Stack direction="row" sx={{ width: '100%' }}>
                <Box
                    component="input"
                    type="color"
                    value={value}
                    onChange={e => onChange((e.target as HTMLInputElement).value)}
                    className="nodrag"
                    sx={{
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        width: 28,
                        height: 22,
                        border: '1px solid',
                        borderColor: COL_DIVIDER,
                        borderRadius: 1,
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&::-webkit-color-swatch-wrapper': { padding: '2px' },
                        '&::-webkit-color-swatch': { border: 'none', borderRadius: '3px' },
                    }}
                />
                {extra && (
                    <Typography
                        variant="caption"
                        sx={{
                            flex: 1,
                            textAlign: 'right',
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            color: COL_SECONDARY,
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {extra}
                    </Typography>
                )}
            </Stack>
        </Field>
    )
})
