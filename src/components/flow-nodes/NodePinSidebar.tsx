/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import './styles/pin-sidebar.css'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import PushPinIcon from '@mui/icons-material/PushPin'
import { pipelineNodeTypes } from './nodeTypes'
import { HeadlessNodeProvider } from './context/HeadlessNodeContext'
import { NodeIdProvider } from './context/NodeIdContext'
import { usePinning } from './context/PinContext'
import type { PipelineNodeData } from './types'

interface Props {
    nodes: Node<PipelineNodeData>[]
    visible: boolean
    onClose: () => void
}

const STORAGE_KEY = 'nodeEditor.pinSidebarWidth.v1'
const MIN_WIDTH = 240
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 320

function readStoredWidth(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_WIDTH
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_WIDTH
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n))
    } catch {
        return DEFAULT_WIDTH
    }
}

/**
 * Right-hand panel that re-renders any pinned node's view with full live
 * state (preview canvases, controls, animation curves) regardless of where
 * the node sits on the graph or whether it's currently scrolled into view.
 *
 * Architecture: each pinned NodeView is rendered with `HeadlessNodeProvider`
 * (suppresses Handles + NodeResizer) and `NodeIdProvider` (supplies the id
 * since react-flow's `useNodeId()` returns null outside the graph). The
 * EngineProvider higher up the tree means processors, subscriptions, and
 * `useSetParam(id)` writes work identically to the in-graph copy — sidebar
 * controls propagate to the same react-flow store and trigger the same
 * recompute pipeline.
 *
 * Width is user-resizable via a 4px hit-strip on the panel's left edge.
 * The drag is tracked with viewport-coords (not deltas) and clamped to
 * [MIN_WIDTH, MAX_WIDTH]; the chosen width is persisted to localStorage
 * so it survives reloads. Cards inside use `width: 100%` so they
 * naturally stretch with the container.
 */
export const NodePinSidebar = memo(function NodePinSidebar({ nodes, visible, onClose }: Props) {
    const { pinnedIds } = usePinning()
    const [width, setWidth] = useState<number>(() => readStoredWidth())
    const [resizing, setResizing] = useState(false)
    const widthRef = useRef(width)
    widthRef.current = width

    /* Persist width — debounced via the natural rhythm of mouseup. */
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* */ }
    }, [width])

    /* Drag tracking. Listeners are attached to window so the cursor can
     * leave the thin handle without losing the gesture. */
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

    if (!visible) return null

    const byId = new Map(nodes.map(n => [n.id, n]))
    const pinned = pinnedIds.map(id => byId.get(id)).filter(Boolean) as Node<PipelineNodeData>[]

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
                /* Disable transitions while actively dragging so width
                 * tracks the cursor 1:1; otherwise CSS smoothing makes
                 * the resize feel laggy. */
                transition: resizing ? 'none' : 'width 120ms ease',
            }}
        >
            {/* Resize hit-strip — sits flush against the left edge of the
                sidebar. Wider than the visible 1px line so it's easy to
                grab even at high DPI; visible only on hover/active. */}
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
                    marginLeft: '-3px', // half-overhang for easier grabbing
                    cursor: 'col-resize',
                    zIndex: 2,
                    /* Faint highlight on hover, accent line during drag */
                    '&:hover::after': {
                        backgroundColor: 'rgba(255, 255, 255, 0.18)',
                    },
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
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: 40,
                    flexShrink: 0,
                    px: 1.5,
                    bgcolor: 'background.default',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, lineHeight: 1 }}>
                    <PushPinIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />
                    <Typography
                        variant="caption"
                        component="span"
                        sx={{
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                            fontWeight: 700,
                            color: 'text.primary',
                            lineHeight: 1,
                            display: 'block',
                        }}
                    >
                        Pinned
                    </Typography>
                </Box>
                <IconButton
                    size="small"
                    onClick={onClose}
                    aria-label="Hide sidebar"
                    sx={{ p: 0.25 }}
                >
                    <CloseIcon sx={{ fontSize: 16, display: 'block' }} />
                </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {pinned.length === 0 && (
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.disabled', textAlign: 'center', fontStyle: 'italic', px: 1, py: 3 }}
                    >
                        Click the pin in any node header to keep it visible here.
                    </Typography>
                )}
                {pinned.map(node => (
                    <PinnedNodeCard key={node.id} node={node} />
                ))}
            </Box>
        </Box>
    )
})

const PinnedNodeCard = memo(function PinnedNodeCard({ node }: { node: Node<PipelineNodeData> }) {
    const Component = (pipelineNodeTypes as Record<string, React.ComponentType<any>>)[node.type ?? node.data.processor]
    if (!Component) return null

    /* Synthesize a NodeProps-like object. We deliberately set `selected=false`
       and don't pass dragging/zIndex flags — those gate behaviours that have
       no meaning outside react-flow (e.g. NodeResizer overlay). */
    const props = {
        id: node.id,
        type: node.type,
        data: node.data,
        selected: false,
        dragging: false,
        isConnectable: false,
        xPos: 0,
        yPos: 0,
        zIndex: 0,
    }

    return (
        <div className="pn-sidebar-card">
            <HeadlessNodeProvider value={true}>
                <NodeIdProvider value={node.id}>
                    <Component {...props} />
                </NodeIdProvider>
            </HeadlessNodeProvider>
        </div>
    )
})
