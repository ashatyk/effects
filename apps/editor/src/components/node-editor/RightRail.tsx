import { memo, useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import { PublishInspector } from './PublishInspector'

const STORAGE_KEY = 'nodeEditor.rightRail.width.v1'
const MIN_WIDTH = 280
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 360

function readStoredWidth(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_WIDTH
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_WIDTH
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n))
    } catch { return DEFAULT_WIDTH }
}

/**
 * Right-side rail. Hosts the Settings panel as a **permanent**
 * surface — no open/closed state, no toolbar toggle, no close
 * affordance. The rail's width is the only thing the user controls,
 * via a single resize handle on its left edge (persisted to
 * `localStorage[STORAGE_KEY]`).
 *
 * Historically this rail also stacked a Pin terminal under the
 * Settings panel. The pin terminal was retired; the underlying
 * `PinContext` + per-card `PinToggle` survive as latent
 * infrastructure should we resurrect a different pinning UI later,
 * but no surface in the editor currently consumes pinned-node IDs
 * for display.
 */
export const RightRail = memo(function RightRail() {
    const [width, setWidth] = useState<number>(() => readStoredWidth())
    const [resizing, setResizing] = useState(false)

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* */ }
    }, [width])

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

    return (
        <Box
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
            <PublishInspector />
        </Box>
    )
})
