import { memo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { COL_SECONDARY, LABEL_W } from './constants'

type FieldProps = {
    label: string
    children: React.ReactNode
    layout?: 'column' | 'row'
    /* Legacy boolean shorthand kept for back-compat with call sites that
     * pass `column` directly: `true` → column (no-op vs default), `false`
     * → row. Explicit `layout` wins. */
    column?: boolean
}

export const Field = memo(function Field({ label, children, layout, column }: FieldProps) {
    const mode: 'column' | 'row' =
        layout ?? (column === false ? 'row' : 'column')

    if (mode === 'column') {
        return (
            <Stack direction="column" sx={{ minHeight: 'auto', gap: 0.5 }}>
                <Typography
                    component="span"
                    sx={{
                        fontSize: 12,
                        fontWeight: 500,
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        color: COL_SECONDARY,
                        /* `overflowWrap: 'anywhere'` lets unbroken Cyrillic /
                         * monospace runs break too. */
                        overflowWrap: 'anywhere',
                    }}
                    title={label}
                >
                    {label}
                </Typography>
                <Box sx={{ minWidth: 0, width: '100%' }}>
                    {children}
                </Box>
            </Stack>
        )
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: `${LABEL_W}px 1fr`,
                alignItems: 'center',
                columnGap: 1.25,
                /* Match the unified small-input height (`sizeSmall = 28px`)
                 * so the label and control share a vertical centre. */
                minHeight: 28,
            }}
        >
            <Typography
                component="span"
                noWrap
                sx={{
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.2,
                    letterSpacing: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: COL_SECONDARY,
                }}
                title={label}
            >
                {label}
            </Typography>
            <Box sx={{ minWidth: 0, width: '100%' }}>
                {children}
            </Box>
        </Box>
    )
})
