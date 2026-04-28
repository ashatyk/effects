import { memo } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Switch from '@mui/material/Switch'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

/**
 * Compact form widgets used across NodeViews. Each widget renders a label on
 * the left and a control on the right at the dense node-card scale (≈22px
 * row height). Labels stay plain `<Typography>` rather than `<InputLabel>`
 * because MUI's float-label spec wastes vertical space the node UI doesn't
 * have.
 *
 * Colour tokens come from CSS custom properties owned by `.pn`
 * (--pn-text, --pn-text-secondary, --pn-text-muted, --pn-divider, …) so
 * widgets render correctly inside light node cards while the rest of the
 * app stays on the dark MUI theme. These widgets are only ever used
 * inside a `.pn` ancestor — both when a node is in the graph and when a
 * pinned copy renders in the sidebar — so the dependency is safe.
 *
 * The wrappers carry the `nodrag` class so dragging the control doesn't
 * accidentally pan the react-flow canvas.
 */

const COL_TEXT = 'var(--pn-text, #0a0a0a)'
const COL_SECONDARY = 'var(--pn-text-secondary, #525252)'
const COL_MUTED = 'var(--pn-text-muted, #8a8a8a)'
const COL_DIVIDER = 'var(--pn-divider, rgba(0, 0, 0, 0.10))'
const COL_DIVIDER_STRONG = 'var(--pn-divider-strong, rgba(0, 0, 0, 0.18))'

type FieldProps = {
    label: string
    children: React.ReactNode
    /** When true, stack vertically — useful for wider controls like multi-line selects. */
    column?: boolean
}

/**
 * Width of the label column for row-mode fields. Sized so common labels
 * like "phase offset (ms)" or "highlight bias" fit without ellipsis
 * truncation at the new 12px label size. Adjust here to re-align every
 * node card uniformly.
 */
const LABEL_W = 130

/**
 * Row layout uses CSS grid (`<label> 1fr`) so the right edge of every
 * control lines up perfectly across the card — flex with `width:auto`
 * gave us slightly different column widths depending on child intrinsic
 * size, which read as misaligned.
 *
 * Column layout keeps the same label width so the control still indents
 * by the same amount as its row-mode siblings.
 */
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
                /* Matches the outlined single-line TextField box height —
                   see App.css `.pn .MuiOutlinedInput-root { min-height: 28px }` */
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
            {/* Inner wrapper guarantees children honour the 1fr column even
                if they default to width:auto (e.g. <Switch />). */}
            <Box sx={{ minWidth: 0, width: '100%' }}>
                {children}
            </Box>
        </Box>
    )
})

interface NumberFieldProps {
    label: string
    value: number
    onChange: (v: number) => void
    step?: number
    min?: number
    max?: number
    disabled?: boolean
}

export const NumberField = memo(function NumberField({ label, value, onChange, step, min, max, disabled }: NumberFieldProps) {
    return (
        <Field label={label}>
            <TextField
                type="number"
                value={Number.isFinite(value) ? value : 0}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                disabled={disabled}
                slotProps={{
                    htmlInput: { step, min, max, className: 'nodrag' },
                }}
                fullWidth
            />
        </Field>
    )
})

interface TextFieldRowProps {
    label: string
    value: string
    onChange: (v: string) => void
    multiline?: boolean
    rows?: number
    maxLength?: number
    monospace?: boolean
    column?: boolean
    placeholder?: string
}

export const TextFieldRow = memo(function TextFieldRow({
    label, value, onChange, multiline, rows, maxLength, monospace, column = true, placeholder,
}: TextFieldRowProps) {
    return (
        <Field label={label} column={column}>
            <TextField
                value={value}
                onChange={e => onChange(e.target.value)}
                multiline={multiline}
                rows={multiline ? (rows ?? 3) : undefined}
                placeholder={placeholder}
                slotProps={{
                    htmlInput: {
                        className: 'nodrag',
                        maxLength,
                        spellCheck: !monospace,
                        style: monospace
                            ? { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11 }
                            : undefined,
                    },
                }}
                fullWidth
            />
        </Field>
    )
})

interface SelectFieldProps<T extends string> {
    label: string
    value: T
    options: readonly T[] | T[]
    onChange: (v: T) => void
    column?: boolean
    /** Optional pretty-printer for option labels. */
    formatOption?: (v: T) => string
    /** Optional per-option style getter (e.g. preview the font-family). */
    optionStyle?: (v: T) => React.CSSProperties | undefined
    /** Optional style for the displayed selected value. */
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
                        /* Drop-down menu is portaled to <body> outside `.pn`,
                           so it doesn't inherit the light card overrides. The
                           classes here let the global stylesheet style the
                           menu surface to match the light card palette. */
                        MenuProps: {
                            classes: { paper: 'pn-menu-paper' },
                        },
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

interface SwitchFieldProps {
    label: string
    checked: boolean
    onChange: (v: boolean) => void
}

export const SwitchField = memo(function SwitchField({ label, checked, onChange }: SwitchFieldProps) {
    return (
        <Field label={label}>
            {/* Switch is intrinsically small; wrap so it sits on the left
                of the control column rather than stretching. */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Switch
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                    className="nodrag"
                />
            </Box>
        </Field>
    )
})

interface SliderFieldProps {
    label: string
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    step?: number
    /** Decimal places when displaying the readout next to the slider. */
    fixed?: number
    disabled?: boolean
}

/**
 * Compact slider with a numeric readout to the right. Intended replacement
 * for the legacy raw `<input type="range">` + readout pattern. The readout
 * is fixed-width so values don't reflow as the user drags the thumb.
 */
export const SliderField = memo(function SliderField({
    label, value, onChange, min = 0, max = 1, step = 0.01, fixed = 2, disabled,
}: SliderFieldProps) {
    const display = fixed === 0
        ? Math.round(value).toString()
        : value.toFixed(fixed)
    return (
        <Field label={label}>
            <Stack direction="row" sx={{ width: '100%' }}>
                <Slider
                    value={Number.isFinite(value) ? value : min}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(_, v) => onChange(typeof v === 'number' ? v : v[0])}
                    disabled={disabled}
                    className="nodrag"
                    sx={{ flex: 1, minWidth: 0 }}
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
                    }}
                >
                    {display}
                </Typography>
            </Stack>
        </Field>
    )
})

interface ColorFieldProps {
    label: string
    value: string // hex like '#aabbcc'
    onChange: (hex: string) => void
    /** Optional supplementary readout (e.g. raw RGB triple). */
    extra?: string
}

/**
 * Compact color picker. Uses a native <input type="color"> wrapped in a
 * styled box so the look matches MUI inputs.
 */
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

interface ActionButtonProps {
    children: React.ReactNode
    onClick: () => void
    variant?: 'primary' | 'secondary'
    fullWidth?: boolean
    disabled?: boolean
    sx?: object
}

/**
 * Standard node-card button. Uses MUI's `Button` so theme overrides apply,
 * but defaults to `fullWidth=true` since most node controls span the card.
 * `primary` ⇒ contained, dark-on-light (the global theme's primary
 * palette is light-on-dark which would collapse to invisible against
 * the light card body, so we always force inverted colours here);
 * `secondary` ⇒ outlined (subtle border, transparent fill).
 */
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

interface StatusLineProps {
    children: React.ReactNode
    tone?: 'normal' | 'muted' | 'error'
}

/**
 * Small status / hint line typically shown at the bottom of a node. Use
 * `muted` for ambient hints (model name, byte counts) and `error` for
 * surfaced failures.
 */
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

interface SectionTitleProps {
    children: React.ReactNode
}

/**
 * Mini-header used to group several rows inside a node (e.g. one block per
 * animation channel in the controller node).
 */
export const SectionTitle = memo(function SectionTitle({ children }: SectionTitleProps) {
    /* The uppercase tracked label is enough of a visual separator on its
     * own — the previous border-top was a redundant cue and ate vertical
     * rhythm. The caller is expected to give the surrounding Stack its
     * own `gap` for breathing room. */
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
