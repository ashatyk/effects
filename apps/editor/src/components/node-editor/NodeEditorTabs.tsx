import { memo, useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import { useScene } from './SceneContext'

/**
 * Horizontal tab strip between the toolbar and the canvas. One tab per
 * scenario page. Clicking a tab switches; double-clicking renames
 * inline; the small "x" deletes (with a confirm if the page isn't
 * empty); the trailing "+" appends a new page.
 *
 * The strip is intentionally compact (32px) so it doesn't eat editor
 * surface; the active tab is the only one with the accent fill so the
 * eye locks onto it without scanning.
 */
export const NodeEditorTabs = memo(function NodeEditorTabs() {
    const { pages, activePageId, addPage, removePage, renamePage, switchPage } = useScene()
    const [editingId, setEditingId] = useState<string | null>(null)

    const onAdd = useCallback(() => {
        const id = addPage()
        switchPage(id)
    }, [addPage, switchPage])

    const onDelete = useCallback((id: string) => {
        const page = pages.find(p => p.id === id)
        if (!page) return
        if (pages.length <= 1) return
        const isEmpty = page.nodes.length === 0
        if (!isEmpty) {
            const ok = window.confirm(
                `Delete page "${page.name}"? It has ${page.nodes.length} node${page.nodes.length === 1 ? '' : 's'}.`,
            )
            if (!ok) return
        }
        removePage(id)
    }, [pages, removePage])

    return (
        <Box
            component="nav"
            sx={{
                display: 'flex',
                alignItems: 'stretch',
                height: 32,
                flexShrink: 0,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
                overflowX: 'auto',
                overflowY: 'hidden',
            }}
        >
            {pages.map(page => (
                <PageTab
                    key={page.id}
                    id={page.id}
                    name={page.name}
                    active={page.id === activePageId}
                    canDelete={pages.length > 1}
                    editing={editingId === page.id}
                    onActivate={() => switchPage(page.id)}
                    onStartRename={() => setEditingId(page.id)}
                    onCommitRename={(name) => { renamePage(page.id, name); setEditingId(null) }}
                    onCancelRename={() => setEditingId(null)}
                    onDelete={() => onDelete(page.id)}
                />
            ))}
            <Tooltip title="Add page">
                <IconButton
                    size="small"
                    onClick={onAdd}
                    sx={{
                        height: 32,
                        width: 32,
                        borderRadius: 0,
                        color: 'text.secondary',
                        '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                    }}
                >
                    <AddIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>
        </Box>
    )
})

interface PageTabProps {
    id: string
    name: string
    active: boolean
    canDelete: boolean
    editing: boolean
    onActivate: () => void
    onStartRename: () => void
    onCommitRename: (name: string) => void
    onCancelRename: () => void
    onDelete: () => void
}

const PageTab = memo(function PageTab({
    name, active, canDelete, editing,
    onActivate, onStartRename, onCommitRename, onCancelRename, onDelete,
}: PageTabProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [draft, setDraft] = useState(name)
    /* When entering edit mode, seed the draft with the current name and
       focus + select the input so the user can replace it immediately. */
    useEffect(() => {
        if (editing) {
            setDraft(name)
            requestAnimationFrame(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            })
        }
    }, [editing, name])

    const commit = useCallback(() => {
        onCommitRename(draft.trim() || name)
    }, [draft, name, onCommitRename])

    return (
        <Box
            onClick={editing ? undefined : onActivate}
            onDoubleClick={editing ? undefined : onStartRename}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                cursor: editing ? 'text' : 'pointer',
                userSelect: 'none',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? 'text.primary' : 'text.secondary',
                bgcolor: active ? 'action.selected' : 'transparent',
                borderRight: 1,
                borderColor: 'divider',
                /* Active tab gets a subtle accent strip on top so the
                   selected page is unmistakable even when colour
                   contrast is low (high-DPI dark themes can wash out
                   selected-bg by themselves). */
                position: 'relative',
                '&::after': active ? {
                    content: '""',
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 2,
                    background: 'currentColor',
                    opacity: 0.6,
                } : undefined,
                '&:hover': { color: 'text.primary' },
            }}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commit() }
                        if (e.key === 'Escape') { e.preventDefault(); onCancelRename() }
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'inherit',
                        font: 'inherit',
                        padding: 0,
                        width: Math.max(60, draft.length * 7),
                    }}
                />
            ) : (
                <span style={{ whiteSpace: 'nowrap' }}>{name}</span>
            )}
            {canDelete && !editing && (
                <Tooltip title="Delete page">
                    <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); onDelete() }}
                        sx={{
                            p: 0.125,
                            opacity: active ? 0.7 : 0.4,
                            '&:hover': { opacity: 1, color: 'error.main' },
                        }}
                    >
                        <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    )
})
