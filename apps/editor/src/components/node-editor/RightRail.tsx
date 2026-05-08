import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import SettingsIcon from '@mui/icons-material/Settings'
import PushPinIcon from '@mui/icons-material/PushPin'
import { PublishInspector } from './PublishInspector'
import { PinsPanel } from './PinsPanel'

const STORAGE_KEY = 'nodeEditor.rightRail.width.v1'
const PINS_HEIGHT_KEY = 'nodeEditor.rightRail.pinsHeight.v1'
const MIN_WIDTH = 280
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 360
const MIN_PINS_HEIGHT = 80
const MIN_SETTINGS_HEIGHT = 120
const DEFAULT_PINS_HEIGHT = 280

function readStoredWidth(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_WIDTH
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_WIDTH
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n))
    } catch { return DEFAULT_WIDTH }
}

function readStoredPinsHeight(): number {
    try {
        const raw = localStorage.getItem(PINS_HEIGHT_KEY)
        if (!raw) return DEFAULT_PINS_HEIGHT
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_PINS_HEIGHT
        return Math.max(MIN_PINS_HEIGHT, n)
    } catch { return DEFAULT_PINS_HEIGHT }
}

// Both Settings + Pins panels stay mounted so engine subscriptions inside pinned cards keep ticking.
export const RightRail = memo(function RightRail() {
    const [width, setWidth] = useState<number>(() => readStoredWidth())
    const [resizing, setResizing] = useState(false)
    const [pinsHeight, setPinsHeight] = useState<number>(() => readStoredPinsHeight())
    const [resizingPins, setResizingPins] = useState(false)
    const railRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* */ }
    }, [width])

    useEffect(() => {
        try { localStorage.setItem(PINS_HEIGHT_KEY, String(pinsHeight)) } catch { /* */ }
    }, [pinsHeight])

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setResizing(true)
        const onMove = (ev: MouseEvent) => {
            const next = window.innerWidth - ev.clientX
            const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next))
            setWidth(clamped)
        }
        const onUp = () => {
            setResizing(false)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [])

    const onPinsResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setResizingPins(true)
        const onMove = (ev: MouseEvent) => {
            const rail = railRef.current
            if (!rail) return
            const rect = rail.getBoundingClientRect()
            const next = rect.bottom - ev.clientY
            const max = Math.max(MIN_PINS_HEIGHT, rect.height - MIN_SETTINGS_HEIGHT)
            const clamped = Math.max(MIN_PINS_HEIGHT, Math.min(max, next))
            setPinsHeight(clamped)
        }
        const onUp = () => {
            setResizingPins(false)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [])

    return (
        <Box
            ref={railRef}
            component="aside"
            sx={{
                position: 'relative',
                width,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
                overflow: 'hidden',
                transition: resizing ? 'none' : 'width 120ms ease',
            }}
        >
            <Box
                role="separator"
                aria-orientation="vertical"
                onMouseDown={onResizeStart}
                sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 6,
                    marginLeft: '-3px',
                    cursor: 'col-resize',
                    zIndex: 3,
                    '&:hover::after': { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 3,
                        width: 1,
                        backgroundColor: resizing ? 'rgba(255, 255, 255, 0.40)' : 'transparent',
                        transition: 'background-color 120ms ease',
                    },
                }}
            />

            <SectionHeader icon={<SettingsIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />}>
                Settings
            </SectionHeader>
            <Box
                sx={{
                    flex: 1,
                    minHeight: MIN_SETTINGS_HEIGHT,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <PublishInspector />
            </Box>

            <Box
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={onPinsResizeStart}
                sx={{
                    position: 'relative',
                    height: 6,
                    marginTop: '-3px',
                    marginBottom: '-3px',
                    cursor: 'row-resize',
                    flexShrink: 0,
                    zIndex: 2,
                    '&:hover::after': { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 3,
                        height: 1,
                        backgroundColor: resizingPins ? 'rgba(255, 255, 255, 0.40)' : 'transparent',
                        transition: 'background-color 120ms ease',
                    },
                }}
            />

            <Box
                sx={{
                    height: pinsHeight,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: 1,
                    borderColor: 'divider',
                    overflow: 'hidden',
                }}
            >
                <SectionHeader icon={<PushPinIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />}>
                    Pins
                </SectionHeader>
                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <PinsPanel />
                </Box>
            </Box>
        </Box>
    )
})

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                // Match Scene Outline header height so both rails align across the editor's top edge.
                height: 32,
                flexShrink: 0,
                px: 1.5,
                bgcolor: 'background.default',
                borderBottom: 1,
                borderColor: 'divider',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, lineHeight: 1 }}>
                {icon}
                <Typography
                    variant="caption"
                    component="span"
                    sx={{
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        fontWeight: 700,
                        color: 'text.primary',
                        lineHeight: 1,
                    }}
                >
                    {children}
                </Typography>
            </Box>
        </Box>
    )
}
