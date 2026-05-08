// UI-only section rectangle. processor: 'frame', params: { color, label }.
// Engine never sees it; every "real engine node" check excludes both cloneOf and processor==='frame'.

export const FRAME_PROCESSOR = 'frame' as const

export const FRAME_DEFAULT_WIDTH = 320
export const FRAME_DEFAULT_HEIGHT = 200

export const FRAME_MIN_WIDTH = 120
export const FRAME_MIN_HEIGHT = 80

// Only the header strip catches pointer events; body is pointer-events:none so clicks pass through.
export const FRAME_HEADER_HEIGHT = 28

export interface FramePreset {
    id: string
    name: string
    hex: string
}

export const FRAME_PRESETS: FramePreset[] = [
    { id: 'slate',  name: 'Slate',  hex: '#7890a0' },
    { id: 'indigo', name: 'Indigo', hex: '#7c77d3' },
    { id: 'teal',   name: 'Teal',   hex: '#4e9c9a' },
    { id: 'olive',  name: 'Olive',  hex: '#92a463' },
    { id: 'amber',  name: 'Amber',  hex: '#ce9e54' },
    { id: 'rose',   name: 'Rose',   hex: '#ce6682' },
    { id: 'violet', name: 'Violet', hex: '#b07ac6' },
    { id: 'stone',  name: 'Stone',  hex: '#9a9a9a' },
]

export const FRAME_DEFAULT_COLOR = FRAME_PRESETS[0].hex

// Returns the input unchanged on non-hex input — protects against legacy params.
export function hexToRgba(hex: string, alpha: number): string {
    const clean = (hex || '').trim().replace(/^#/, '')
    let r: number, g: number, b: number
    if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16)
        g = parseInt(clean[1] + clean[1], 16)
        b = parseInt(clean[2] + clean[2], 16)
    } else if (clean.length === 6) {
        r = parseInt(clean.slice(0, 2), 16)
        g = parseInt(clean.slice(2, 4), 16)
        b = parseInt(clean.slice(4, 6), 16)
    } else {
        return hex
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return hex
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function frameDefaultParams(): { color: string; label: string } {
    return { color: FRAME_DEFAULT_COLOR, label: '' }
}
