/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useState, useMemo } from 'react'
import type { Node } from '@xyflow/react'
import './styles/pin-terminal.css'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import PushPinIcon from '@mui/icons-material/PushPin'
import { pipelineNodeTypes } from './nodeTypes'
import { HeadlessNodeProvider } from './context/HeadlessNodeContext'
import { NodeIdProvider, HeadlessNodeDataProvider } from './context/NodeIdContext'
import { usePinning } from './context/PinContext'
import { useScene } from '../node-editor/SceneContext'
import type { PipelineNodeData } from './types'

interface Props {
    visible: boolean
    onClose: () => void
}

const STORAGE_KEY = 'nodeEditor.pinTerminal.height.v1'
const MIN_HEIGHT = 160
const MAX_HEIGHT = 720
const DEFAULT_HEIGHT = 280

function readStoredHeight(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_HEIGHT
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_HEIGHT
        return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, n))
    } catch {
        return DEFAULT_HEIGHT
    }
}

/**
 * IDE-style bottom terminal that re-renders any pinned node's view
 * with full live state (preview canvases, controls, animation curves)
 * regardless of where the node sits on the graph or whether it's
 * currently scrolled into view. Replaces the previous right-rail pin
 * sidebar — the right rail now hosts the Publish Inspector.
 *
 * Architecture: each pinned NodeView is rendered with `HeadlessNodeProvider`
 * (suppresses Handles + NodeResizer) and `NodeIdProvider` (supplies
 * the id since react-flow's `useNodeId()` returns null outside the
 * graph). The EngineProvider higher up the tree means processors,
 * subscriptions, and `useSetParam(id)` writes work identically to the
 * in-graph copy.
 *
 * Layout is a horizontally-scrolling row of cards — each card sits at
 * its intrinsic width so a pinned Preview keeps its aspect ratio and
 * a pinned AnimationController keeps its widgets readable. Height is
 * user-resizable via a 4 px hit-strip on the panel's TOP edge; the
 * chosen height persists to localStorage.
 */
export const NodePinTerminal = memo(function NodePinTerminal({ visible, onClose }: Props) {
    const { pinnedIds } = usePinning()
    const { pages, activePageId } = useScene()
    const [height, setHeight] = useState<number>(() => readStoredHeight())
    const [resizing, setResizing] = useState(false)

    /* Same cross-page walk as the previous sidebar — pinning is a
       global UX preference, off-active pins still surface here. */
    const nodesWithPage = useMemo(() => {
        const out: { node: Node<PipelineNodeData>; pageId: string; pageName: string }[] = []
        for (const page of pages) {
            for (const n of page.nodes) {
                out.push({ node: n, pageId: page.id, pageName: page.name })
            }
        }
        return out
    }, [pages])

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, String(height)) } catch { /* */ }
    }, [height])

    /* Drag from the TOP edge — the bottom is anchored to the editor
       chrome. Window-level listeners so the cursor can leave the thin
       handle without losing the gesture. */
    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setResizing(true)
        const onMove = (ev: MouseEvent) => {
            const next = window.innerHeight - ev.clientY
            const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, next))
            setHeight(clamped)
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

    const byId = new Map(nodesWithPage.map(x => [x.node.id, x]))
    const pinned = pinnedIds
        .map(id => byId.get(id))
        .filter(Boolean) as { node: Node<PipelineNodeData>; pageId: string; pageName: string }[]

    return (
        <Box
            component="aside"
            sx={{
                position: 'relative',
                height,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
                overflow: 'hidden',
                transition: resizing ? 'none' : 'height 120ms ease',
            }}
        >
            {/* Resize hit-strip — sits flush against the TOP edge of
                the terminal. Wider than the visible 1 px line so it's
                easy to grab even at high DPI; visible only on
                hover/active. */}
            <Box
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={onResizeStart}
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 6,
                    marginTop: '-3px',
                    cursor: 'row-resize',
                    zIndex: 2,
                    '&:hover::after': { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 3,
                        height: 1,
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
                    height: 32,
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
                        }}
                    >
                        Pinned
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Hide pin terminal" sx={{ p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 16, display: 'block' }} />
                </IconButton>
            </Box>
            <Box
                sx={{
                    flex: 1,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    /* Cards line up horizontally, vertical centring keeps
                       short cards (e.g. Constant Signal) aligned with
                       tall cards (Preview canvas). */
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    p: 1.25,
                    gap: 1.25,
                }}
            >
                {pinned.length === 0 && (
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.disabled', fontStyle: 'italic', m: 'auto' }}
                    >
                        Click the pin in any node header to keep it visible here.
                    </Typography>
                )}
                {pinned.map(({ node, pageId, pageName }) => (
                    <PinnedNodeCard
                        key={node.id}
                        node={node}
                        pageName={pageName}
                        offActivePage={pageId !== activePageId}
                    />
                ))}
            </Box>
        </Box>
    )
})

interface PinnedNodeCardProps {
    node: Node<PipelineNodeData>
    pageName: string
    offActivePage: boolean
}

const PinnedNodeCard = memo(function PinnedNodeCard({ node, pageName, offActivePage }: PinnedNodeCardProps) {
    const Component = (pipelineNodeTypes as Record<string, React.ComponentType<any>>)[node.type ?? node.data.processor]
    if (!Component) return null

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
        <div className="pn-terminal-card">
            {offActivePage && (
                <Typography
                    component="div"
                    sx={{
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: 'text.disabled',
                        mb: 0.5,
                        pl: 0.5,
                    }}
                >
                    from {pageName}
                </Typography>
            )}
            <HeadlessNodeProvider value={true}>
                <NodeIdProvider value={node.id}>
                    <HeadlessNodeDataProvider value={node.data}>
                        <Component {...props} />
                    </HeadlessNodeDataProvider>
                </NodeIdProvider>
            </HeadlessNodeProvider>
        </div>
    )
})
