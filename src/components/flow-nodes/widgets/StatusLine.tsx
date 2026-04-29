import { memo } from 'react'
import Typography from '@mui/material/Typography'
import { COL_SECONDARY, COL_MUTED } from './constants'

interface StatusLineProps {
    children: React.ReactNode
    tone?: 'normal' | 'muted' | 'error'
}

export const StatusLine = memo(function StatusLine({ children, tone = 'normal' }: StatusLineProps) {
    const color = tone === 'error'
        ? '#c4201d'
        : tone === 'muted'
            ? COL_MUTED
            : COL_SECONDARY
    return (
        <Typography
            variant="caption"
            sx={{
                color,
                fontSize: 10,
                lineHeight: 1.4,
                py: 0.25,
                wordBreak: 'break-word',
            }}
        >
            {children}
        </Typography>
    )
})
