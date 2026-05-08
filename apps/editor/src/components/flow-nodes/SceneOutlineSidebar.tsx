/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { useScene } from '../node-editor/SceneContext'
import { CLONE_DRAG_MIME } from '../node-editor/constants'
import { categoryColor } from './categoryColors'

const STORAGE_KEY = 'nodeEditor.outlineSidebarWidth.v1'
const COLLAPSED_KEY = 'nodeEditor.outlineCollapsedPages.v1'
const MIN_WIDTH = 220
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 280

function readStoredWidth(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_WIDTH
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) return DEFAULT_WIDTH
        return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n))
    } catch { return DEFAULT_WIDTH }
}

function readCollapsedPages(): Set<string> {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY)
        if (!raw) return new Set()
        const arr = JSON.parse(raw)
        return new Set(Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [])
    } catch { return new Set() }
}

// Click row → jumpToNode (switches page + centres). Drag row → clone at drop coords.
export const SceneOutlineSidebar = memo(function SceneOutlineSidebar() {
    const { pages, activePageId, switchPage, jumpToNode } = useScene()
    const [width, setWidth] = useState<number>(() => readStoredWidth())
    const [resizing, setResizing] = useState(false)
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => readCollapsedPages())

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* */ }
    }, [width])

    useEffect(() => {
        try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedIds])) } catch { /* */ }
    }, [collapsedIds])

    const togglePageCollapse = useCallback((pageId: string) => {
        setCollapsedIds(prev => {
            const next = new Set(prev)
            if (next.has(pageId)) next.delete(pageId)
            else next.add(pageId)
            return next
        })
    }, [])

    const onNodeDragStart = useCallback((event: React.DragEvent, originId: string) => {
        event.dataTransfer.setData(CLONE_DRAG_MIME, originId)
        event.dataTransfer.effectAllowed = 'copy'
    }, [])

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setResizing(true)
        const onMove = (ev: MouseEvent) => {
            const next = ev.clientX
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

    // Outline = originals only (clones are aliases; frames are UI-only markup).
    const pageContents = useMemo(() => pages.map(page => ({
        page,
        originals: page.nodes.filter(n => !n.data.cloneOf && n.data.processor !== 'frame'),
    })), [pages])

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
                borderRight: 1,
                borderColor: 'divider',
                overflow: 'hidden',
                transition: resizing ? 'none' : 'width 120ms ease',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    // Match NodeEditorTabs row height so the header lines up with the tab strip.
                    height: 32,
                    flexShrink: 0,
                    px: 1.5,
                    bgcolor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, lineHeight: 1 }}>
                    <AccountTreeIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />
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
                        Scene outline
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
                {pageContents.map(({ page, originals }) => {
                    const collapsed = collapsedIds.has(page.id)
                    const active = page.id === activePageId
                    return (
                        <Box key={page.id}>
                            <PageRow
                                name={page.name}
                                count={originals.length}
                                active={active}
                                collapsed={collapsed}
                                onClick={() => {
                                    if (!active) switchPage(page.id)
                                    togglePageCollapse(page.id)
                                }}
                                onDoubleClick={() => { if (!active) switchPage(page.id) }}
                            />
                            {!collapsed && (
                                <Box>
                                    {originals.length === 0 ? (
                                        <Typography
                                            sx={{
                                                fontSize: 10,
                                                color: 'text.disabled',
                                                fontStyle: 'italic',
                                                pl: 4,
                                                pr: 1.5,
                                                py: 0.5,
                                            }}
                                        >
                                            empty page
                                        </Typography>
                                    ) : originals.map(node => {
                                        const def = PROCESSOR_CATALOG[node.data.processor]?.def
                                        return (
                                            <NodeRow
                                                key={node.id}
                                                id={node.id}
                                                label={(node.data.label ?? '').trim() || def?.title || node.data.processor}
                                                typeTitle={def?.title || node.data.processor}
                                                typeKey={node.data.processor}
                                                category={def?.category}
                                                onClick={() => jumpToNode(node.id)}
                                                onDragStart={(e) => onNodeDragStart(e, node.id)}
                                            />
                                        )
                                    })}
                                </Box>
                            )}
                        </Box>
                    )
                })}
            </Box>
            <Box
                role="separator"
                aria-orientation="vertical"
                onMouseDown={onResizeStart}
                sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: 6,
                    marginRight: '-3px',
                    cursor: 'col-resize',
                    zIndex: 2,
                    '&:hover::after': {
                        backgroundColor: 'rgba(255, 255, 255, 0.18)',
                    },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: 3,
                        width: 1,
                        backgroundColor: resizing ? 'rgba(255, 255, 255, 0.40)' : 'transparent',
                        transition: 'background-color 120ms ease',
                    },
                }}
            />
        </Box>
    )
})

interface PageRowProps {
    name: string
    count: number
    active: boolean
    collapsed: boolean
    onClick: () => void
    onDoubleClick: () => void
}

const PageRow = memo(function PageRow({ name, count, active, collapsed, onClick, onDoubleClick }: PageRowProps) {
    return (
        <Box
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.5,
                userSelect: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: active ? 700 : 600,
                color: active ? 'text.primary' : 'text.secondary',
                bgcolor: active ? 'action.selected' : 'transparent',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
        >
            {collapsed
                ? <ChevronRightIcon sx={{ fontSize: 14 }} />
                : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            <span style={{ opacity: 0.55, fontWeight: 500, fontSize: 10 }}>{count}</span>
        </Box>
    )
})

interface NodeRowProps {
    id: string
    label: string
    typeTitle: string
    typeKey: string
    category: string | undefined
    onClick: () => void
    onDragStart: (event: React.DragEvent) => void
}

const NodeRow = memo(function NodeRow({ id, label, typeTitle, typeKey, category, onClick, onDragStart }: NodeRowProps) {
    const accent = categoryColor(category)
    const typeLabel = typeTitle === typeKey ? typeKey : `${typeTitle} (${typeKey})`
    return (
        <Tooltip
            title={
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, lineHeight: 1.3 }}>
                    <Box sx={{ fontWeight: 600 }}>{typeLabel}</Box>
                    <Box sx={{ opacity: 0.7, fontSize: 10 }}>{id}</Box>
                    <Box sx={{ opacity: 0.7, fontSize: 10 }}>click to jump</Box>
                    <Box sx={{ opacity: 0.7, fontSize: 10 }}>drag to add reference</Box>
                </Box>
            }
            placement="right"
            enterDelay={400}
        >
            <Box
                draggable
                onDragStart={onDragStart}
                onClick={onClick}
                sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    pr: 1,
                    pl: 2,
                    py: 0.5,
                    userSelect: 'none',
                    cursor: 'grab',
                    fontSize: 12,
                    color: 'text.primary',
                    '&:hover': {
                        bgcolor: 'action.hover',
                        '& .so-grip': { opacity: 0.55 },
                    },
                    '&:active': { cursor: 'grabbing' },
                }}
            >
                <Box
                    sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: 6,
                        background: accent,
                    }}
                />
                <span style={{
                    flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{label}</span>
                <DragIndicatorIcon
                    className="so-grip"
                    sx={{ fontSize: 14, color: 'text.disabled', opacity: 0, transition: 'opacity 120ms ease' }}
                />
            </Box>
        </Tooltip>
    )
})
