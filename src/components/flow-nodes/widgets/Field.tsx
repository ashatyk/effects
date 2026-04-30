import { memo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { COL_SECONDARY, LABEL_W } from './constants'

type FieldProps = {
    label: string
    children: React.ReactNode
    column?: boolean
}

export const Field = memo(function Field({ label, children, column }: FieldProps) {
    if (column) {
        return (
            <Stack direction="column" sx={{ minHeight: 'auto' }}>
                <Typography
                    component="span"
                    noWrap
                    sx={{
                        fontSize: 12,
                        fontWeight: 500,
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        color: COL_SECONDARY,
                    }}
                >
                    {label}
                </Typography>
                {children}
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
                minHeight: 22,
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
