import { createTheme, alpha } from '@mui/material/styles'

/**
 * Dark theme tuned for a node-editor / dev-tool look — closer to Linear /
 * Vercel than to default Material. Key moves:
 *   - dense baseline: 6px spacing unit, reduced control heights, lower
 *     border-radius (6) so node cards still read as cards.
 *   - subdued surfaces with very thin borders (alpha(white, 0.07)) instead of
 *     elevation shadows. Material elevations look out of place in editor UI.
 *   - Inter Variable font from @fontsource — predictable across OSes.
 *   - palette.text.secondary slightly higher contrast than MUI default for
 *     dense forms where labels read fast.
 *
 * Customise by editing the tokens below; component overrides at the bottom
 * apply the dense sizing automatically — call sites can still pass `size`
 * explicitly to override.
 */
/**
 * Geist (Vercel) palette tokens — kept here as constants so component-level
 * sx props can reference the same values without going through the theme
 * round-trip. Numbers follow the Geist gray ramp (100 = darkest, 1000 = brightest).
 */
/* Tuned to be a softer dark — pure-black chrome combined with the new
 * off-white node cards read as too punchy. The canvas is lifted to a near-
 * black warm gray, chrome surfaces sit just below it for a subtle z-stack
 * (Figma-like), and inputs/borders use slightly higher alpha so they don't
 * disappear against the lifted base. */
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
        primary:   { main: geist.gray900, contrastText: '#000' }, // white-on-black buttons
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
        /* JetBrains Mono Variable provides 100..800 weights — we default
         * to 700 (bold) per design direction. Mono looks distinctive in
         * a node editor and improves the "tooling" vibe, but ALL caps
         * tracking/typography numerics need a touch of letter-spacing
         * relaxation since mono fonts are inherently wider. */
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
                /* Locked height so plain TextField (`<input>`), number
                 * field, and Select (`<div role="combobox">`) all
                 * render at the same row height. Without `height: 28`
                 * MUI 8's number input defaults to a taller box than
                 * the select element — the symptom users see as
                 * "duration field is huge next to the select".
                 *
                 * Multiline inputs (`rows={N}` TextField) are exempt:
                 * `height: 28` would clamp the wrapper to a single
                 * row regardless of `rows`, and the inner `<textarea>`
                 * overflows visibly above the wrapper (no `overflow:
                 * hidden` from MUI). The carve-out lets multiline
                 * grow to its rows-derived natural height. */
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
                    /* Single padding rule that targets both the plain
                     * `<input>` and the `<div role="combobox">` Select
                     * surface. Both carry `MuiInputBase-inputSizeSmall`
                     * in MUI 8, so this guarantees identical inner
                     * geometry and prevents the height-mismatch from
                     * recurring. `boxSizing` keeps the wrapper's
                     * `height: 28` honoured even when the inner
                     * element wants to grow. */
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
                 * MuiInputBase-inputSizeSmall rule above handles both
                 * input flavours uniformly. Only the dropdown chevron
                 * stays here (it's Select-only). */
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
