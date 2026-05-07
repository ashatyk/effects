import { memo } from 'react'
import Typography from '@mui/material/Typography'
import { COL_SECONDARY } from './constants'

interface SectionTitleProps {
    children: React.ReactNode
}

export const SectionTitle = memo(function SectionTitle({ children }: SectionTitleProps) {
    return (
        <Typography
            variant="caption"
            component="div"
            sx={{
                fontSize: 10,
                fontWeight: 800,
                color: COL_SECONDARY,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                lineHeight: 1.4,
                pt: 0.25,
                pb: 0.25,
            }}
        >
            {children}
        </Typography>
    )
})
