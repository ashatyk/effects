import { createTheme, alpha } from '@mui/material/styles'

/* Softer dark: pure-black chrome with off-white node cards read as too
 * punchy. Canvas is lifted to a near-black warm gray; chrome surfaces sit
 * just below it for a Figma-like z-stack; inputs/borders use slightly
 * higher alpha so they don't disappear against the lifted base. */
export const geist = {
    bg:        '#141414',  // canvas / page background
    surface:   '#0e0e0e',  // chrome (toolbar / sidebar / popover) — sits below canvas
    surfaceHi: '#1c1c1c',  // input/control fill on dark chrome
    gray100:   '#1a1a1a',
    gray200:   '#1f1f1f',
    gray300:   '#292929',
    gray400:   '#2e2e2e',
    gray500:   '#454545',
    gray600:   '#878787',
    gray700:   '#8f8f8f',
    gray800:   '#a1a1a1',
    gray900:   '#ededed',
    gray1000:  '#ffffff',
    blue:      '#0070f3',
    red:       '#e5484d',
    amber:     '#f5a623',
    green:     '#50e3c2',
    purple:    '#8b5cf6',
    border:    'rgba(255, 255, 255, 0.08)',
    borderHi:  'rgba(255, 255, 255, 0.14)',
}

export const theme = createTheme({
    palette: {
        mode: 'dark',
        primary:   { main: geist.gray900, contrastText: '#000' },
        secondary: { main: geist.blue },
        success:   { main: geist.green },
        warning:   { main: geist.amber },
        error:     { main: geist.red },
        background: {
            default: geist.bg,
            paper:   geist.surface,
        },
        divider: geist.border,
        text: {
            primary:   geist.gray900,
            secondary: geist.gray800,
            disabled:  geist.gray600,
        },
    },
    typography: {
        /* Mono default per design direction; weight 700 reads as the regular
         * baseline. Mono fonts are inherently wider, so caps-tracking and
         * numeric variants get slightly relaxed letter-spacing. */
        fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
        fontSize: 12,
        fontWeightLight: 500,
        fontWeightRegular: 700,
        fontWeightMedium: 700,
        fontWeightBold: 800,
        button:  { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
        body1:   { fontSize: 12, fontWeight: 700 },
        body2:   { fontSize: 11, fontWeight: 700 },
        caption: { fontSize: 10, fontWeight: 700, letterSpacing: 0.2 },
        h1: { fontWeight: 800 },
        h2: { fontWeight: 800 },
        h3: { fontWeight: 800 },
        h4: { fontWeight: 800 },
        h5: { fontWeight: 800 },
        h6: { fontWeight: 800 },
    },
    shape: { borderRadius: 6 },
    spacing: 6,
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    fontFeatureSettings: '"cv11", "ss01"',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                },
            },
        },
        MuiButton: {
            defaultProps: { size: 'small', disableElevation: true },
            styleOverrides: {
                root: {
                    paddingInline: 10,
                    minHeight: 28,
                    fontWeight: 500,
                    /* Vercel-style "white on black" primary CTA. */
                    '&.MuiButton-containedPrimary': {
                        backgroundColor: geist.gray900,
                        color: '#000',
                        '&:hover': { backgroundColor: geist.gray1000 },
                    },
                    '&.MuiButton-textInherit': {
                        color: geist.gray800,
                        '&:hover': { backgroundColor: alpha('#fff', 0.06), color: geist.gray900 },
                    },
                },
            },
        },
        MuiIconButton: {
            defaultProps: { size: 'small' },
            styleOverrides: {
                root: {
                    color: geist.gray800,
                    '&:hover': { backgroundColor: alpha('#fff', 0.06), color: geist.gray900 },
                },
            },
        },
        MuiTextField: {
            defaultProps: { size: 'small', variant: 'outlined' },
        },
        MuiInputBase: {
            styleOverrides: {
                root: { fontSize: 12 },
                /* Locked height so plain TextField, NumberField, and Select
                 * render at the same row height (MUI 8 otherwise grows the
                 * number input taller than the select). Multiline TextField
                 * is exempt — `height: 28` would clamp the wrapper to one
                 * row and the textarea would overflow visibly. */
                sizeSmall: {
                    minHeight: 28,
                    height: 28,
                    '&.MuiInputBase-multiline': {
                        height: 'auto',
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    background: geist.surfaceHi,
                    '& fieldset': { borderColor: geist.border },
                    '&:hover fieldset': { borderColor: geist.borderHi },
                    '&.Mui-focused fieldset': { borderWidth: 1, borderColor: geist.gray700 },
                    /* Single padding rule for both plain `<input>` and Select's
                     * `<div role="combobox">` (both carry `inputSizeSmall` in
                     * MUI 8). Prevents the input/select height-mismatch from
                     * recurring; `boxSizing` honours the wrapper's `height: 28`. */
                    '& .MuiInputBase-inputSizeSmall': {
                        paddingTop: 4,
                        paddingBottom: 4,
                        paddingLeft: 8,
                        paddingRight: 8,
                        minHeight: 0,
                        boxSizing: 'border-box',
                    },
                },
            },
        },
        MuiSelect: {
            defaultProps: { size: 'small' },
            styleOverrides: {
                /* No per-Select padding/minHeight — the unified
                 * MuiInputBase-inputSizeSmall rule above handles it. */
                icon: { right: 4 },
            },
        },
        MuiMenuItem: {
            styleOverrides: { root: { fontSize: 12, minHeight: 28 } },
        },
        MuiSwitch: {
            defaultProps: { size: 'small' },
        },
        MuiCheckbox: {
            defaultProps: { size: 'small' },
        },
        MuiSlider: {
            defaultProps: { size: 'small' },
        },
        MuiTooltip: {
            defaultProps: { arrow: false, enterDelay: 400 },
            styleOverrides: {
                tooltip: {
                    fontSize: 11,
                    padding: '4px 8px',
                    backgroundColor: geist.gray200,
                    border: `1px solid ${geist.border}`,
                    color: geist.gray900,
                },
            },
        },
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: ({ theme }) => ({
                    backgroundImage: 'none',
                    border: `1px solid ${theme.palette.divider}`,
                }),
            },
        },
        MuiDivider: {
            styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.06)' } },
        },
        MuiInputLabel: {
            styleOverrides: { root: { fontSize: 11 } },
        },
    },
})
