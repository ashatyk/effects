import { memo } from 'react'
import Button from '@mui/material/Button'
import { COL_TEXT, COL_DIVIDER_STRONG } from './constants'

interface ActionButtonProps {
    children: React.ReactNode
    onClick: () => void
    variant?: 'primary' | 'secondary'
    fullWidth?: boolean
    disabled?: boolean
    sx?: object
}

export const ActionButton = memo(function ActionButton({
    children, onClick, variant = 'secondary', fullWidth = true, disabled, sx,
}: ActionButtonProps) {
    return (
        <Button
            onClick={onClick}
            variant={variant === 'primary' ? 'contained' : 'outlined'}
            color={variant === 'primary' ? 'primary' : 'inherit'}
            fullWidth={fullWidth}
            disabled={disabled}
            className="nodrag"
            sx={{
                fontSize: 12,
                fontWeight: 600,
                ...(variant === 'primary' && {
                    backgroundColor: COL_TEXT,
                    color: 'var(--pn-bg-input, #fff)',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.20)',
                    '&:hover': {
                        backgroundColor: '#000',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.30)',
                    },
                }),
                ...(variant === 'secondary' && {
                    borderColor: COL_DIVIDER_STRONG,
                    color: COL_TEXT,
                    '&:hover': {
                        borderColor: COL_TEXT,
                        background: 'rgba(0, 0, 0, 0.04)',
                    },
                }),
                ...sx,
            }}
        >
            {children}
        </Button>
    )
})
