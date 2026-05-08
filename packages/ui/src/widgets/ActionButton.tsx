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

/* Two surfaces with opposite palettes:
 *   1. Inside `.pn` (light graph-card): needs a near-black fill to read
 *      against `--pn-bg ≈ #d4d4d4`.
 *   2. Outside `.pn` (dark Settings rail): the theme's
 *      `MuiButton-containedPrimary` paints white-on-black, which is right.
 * The `.pn &` scope confines the inverted overrides to case (1); without
 * it the `--pn-*` fallbacks leaked into the dark rail and produced
 * "black on black" buttons. */
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
                    '.pn &': {
                        backgroundColor: COL_TEXT,
                        color: 'var(--pn-bg-input, #fff)',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.20)',
                        '&:hover': {
                            backgroundColor: '#000',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.30)',
                        },
                    },
                }),
                ...(variant === 'secondary' && {
                    '.pn &': {
                        borderColor: COL_DIVIDER_STRONG,
                        color: COL_TEXT,
                        '&:hover': {
                            borderColor: COL_TEXT,
                            background: 'rgba(0, 0, 0, 0.04)',
                        },
                    },
                }),
                ...sx,
            }}
        >
            {children}
        </Button>
    )
})
