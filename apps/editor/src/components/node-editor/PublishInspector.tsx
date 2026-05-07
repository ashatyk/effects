/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@xyflow/react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import CloseIcon from '@mui/icons-material/Close'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { PROCESSOR_CATALOG, effects } from '@effects/runtime'
import type { DerivePublishedSurfaceResult, PublishError } from '@effects/runtime'
import { useScene } from './SceneContext'
import { useSetExposed } from '../flow-nodes/hooks/useSetExposed'
import { TextFieldRow, SwitchField, SectionTitle, StatusLine } from '@effects/ui'
import { deriveFromPages, publishStructuralHash } from './publish-from-pages'
import type { PipelineNodeData, ExposedMeta } from '../flow-nodes/types'

interface Props {
    visible: boolean
    onClose: () => void
}

const STORAGE_KEY = 'nodeEditor.inspector.width.v1'
const MIN_WIDTH = 280
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 340

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
 * Right-rail Publish Inspector. Shows the supplier-exposure controls
 * for the currently selected node — toggles `data.exposed` per the
 * processor's nature:
 *
 *   - Image / Segmentation / TapZone: only "Expose whole node" toggle
 *     (their UIs are irreducible to a list of fields).
 *   - Config: per-field checkboxes for the active effect's `FieldDef`
 *     list.
 *   - PublishRoot: live publication preview (image slots count, tap
 *     zones, fields, errors) — no exposure toggle (the root is the
 *     publication itself).
 *   - Other: "Expose whole node" toggle as a generic fallback.
 *
 * The inspector reads the React Flow store directly to pick up
 * selection changes without threading state through every parent.
 * Width is user-resizable on the LEFT edge (mirrors the outline
 * sidebar's right-edge handle) and persisted to localStorage.
 */
export const PublishInspector = memo(function PublishInspector({ visible, onClose }: Props) {
    const { pages } = useScene()
    const [width, setWidth] = useState<number>(() => readStoredWidth())
    const [resizing, setResizing] = useState(false)

    /* Track selection across the active page only — selection is a
       per-page concept (React Flow store mounts per active page). */
    const selectedId = useStore((s: any) => {
        const all = (s.nodeLookup as Map<string, any> | undefined)
        if (!all) return null
        for (const n of all.values()) {
            if (n?.selected) return n.id as string
        }
        return null
    })

    /* Resolve the selected node from the SCENE (not just React Flow's
       store) so we can mutate `data.exposed` via `updateNodeData`. */
    const selectedNode = useMemo(() => {
        if (!selectedId) return null
        for (const p of pages) {
            const n = p.nodes.find(x => x.id === selectedId)
            if (n) return n
        }
        return null
    }, [selectedId, pages])

    /* Persist width (debounced via the natural rhythm of mouseup). */
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

    if (!visible) return null

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
            {/* Resize hit-strip on the LEFT edge (mirror of outline
                sidebar's right-edge handle). */}
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
                    zIndex: 2,
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
                    <VisibilityIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />
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
                        Publish Inspector
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} aria-label="Hide inspector" sx={{ p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: 16, display: 'block' }} />
                </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
                {selectedNode
                    ? <NodeInspector node={selectedNode} pages={pages} />
                    : <EmptyHint />}
            </Box>
        </Box>
    )
})

function EmptyHint() {
    return (
        <Typography
            variant="body2"
            sx={{ color: 'text.disabled', textAlign: 'center', fontStyle: 'italic', px: 1, py: 3 }}
        >
            Select a node on the canvas to mark it exposable.
        </Typography>
    )
}

interface NodeInspectorProps {
    node: { id: string; data: PipelineNodeData }
    pages: ReturnType<typeof useScene>['pages']
}

const NodeInspector = memo(function NodeInspector({ node, pages }: NodeInspectorProps) {
    const proc = node.data.processor
    const def = PROCESSOR_CATALOG[proc]?.def
    const exposed = node.data.exposed
    const setExposed = useSetExposed(node.id)

    /* PublishRoot is the publication itself — no exposure toggle. */
    if (proc === 'publishRoot') {
        return <RootInspector pages={pages} />
    }

    if (node.data.cloneOf) {
        return (
            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic', px: 1 }}>
                Clones are UI-only references and aren't part of the published surface. Select the original to expose it.
            </Typography>
        )
    }

    const titleFallback = (node.data.label ?? '').trim() || def?.title || proc

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box>
                <SectionTitle>{titleFallback}</SectionTitle>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>
                    {proc} · {node.id}
                </Typography>
            </Box>

            {/* Image / Segmentation / TapZone / EventEmitter / Number / etc.
                — anything except `config` exposes as the whole node. */}
            {proc === 'config'
                ? <ConfigFieldsInspector node={node} exposed={exposed} setExposed={setExposed} />
                : <WholeNodeInspector exposed={exposed} setExposed={setExposed} />}

            <SharedExposureFields exposed={exposed} setExposed={setExposed} />
        </Box>
    )
})

/**
 * "Expose whole node" toggle — the only widget for nodes whose UI
 * isn't reducible to a flat list of fields (Image upload, Segmentation
 * point editor, TapZone EMIT button + label).
 */
function WholeNodeInspector({ exposed, setExposed }: {
    exposed: ExposedMeta | undefined
    setExposed: (e: ExposedMeta | undefined) => void
}) {
    const checked = exposed?.mode === 'whole'
    return (
        <SwitchField
            label="Expose to supplier"
            checked={checked}
            onChange={v => {
                if (v) setExposed({ mode: 'whole', label: exposed?.label, hint: exposed?.hint })
                else setExposed(undefined)
            }}
        />
    )
}

/**
 * Per-field checkboxes for `config` nodes. Resolves the active effect
 * from `data.params.effect` (the same lookup `ConfigNodeView` uses)
 * and lists every `FieldDef` with a checkbox; checking one adds it to
 * `data.exposed.fields[]`. The `mode` flips to `'fields'` on first
 * tick and back to `undefined` on last untick (so an unchecked Config
 * doesn't sit in the published surface as `mode='fields'` with an
 * empty list).
 */
function ConfigFieldsInspector({ node, exposed, setExposed }: {
    node: { data: PipelineNodeData }
    exposed: ExposedMeta | undefined
    setExposed: (e: ExposedMeta | undefined) => void
}) {
    const effectName = (node.data.params.effect as string | undefined) ?? effects[0]?.name
    const effectCfg = effects.find(e => e.name === effectName)
    const selected = useMemo(() => new Set(exposed?.fields ?? []), [exposed])

    if (!effectCfg) {
        return <StatusLine tone="muted">Pick an effect on the Config node first.</StatusLine>
    }

    const toggleField = (key: string, on: boolean) => {
        const next = new Set(selected)
        if (on) next.add(key)
        else next.delete(key)
        if (next.size === 0) {
            setExposed(undefined)
            return
        }
        setExposed({
            mode: 'fields',
            fields: Array.from(next),
            label: exposed?.label,
            hint: exposed?.hint,
        })
    }

    return (
        <Box>
            <SectionTitle>fields ({effectCfg.name})</SectionTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', mt: 0.5 }}>
                {effectCfg.fields.map(f => {
                    const key = f.uniformName ?? f.name
                    return (
                        <FormControlLabel
                            key={key}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={selected.has(key)}
                                    onChange={e => toggleField(key, e.target.checked)}
                                    className="nodrag"
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.2 }}>
                                        {f.label}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                                        {key}
                                    </Typography>
                                </Box>
                            }
                            sx={{ mr: 0, alignItems: 'flex-start' }}
                        />
                    )
                })}
            </Box>
        </Box>
    )
}

/** Supplier-facing label/hint editors. Shown for every exposed mode
 *  (whole or fields) so the author can override the default node
 *  label. Both are optional. */
function SharedExposureFields({ exposed, setExposed }: {
    exposed: ExposedMeta | undefined
    setExposed: (e: ExposedMeta | undefined) => void
}) {
    if (!exposed) return null
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <TextFieldRow
                label="supplier label"
                value={exposed.label ?? ''}
                onChange={v => setExposed({ ...exposed, label: v.trim() ? v : undefined })}
                placeholder="(default: node label)"
            />
            <TextFieldRow
                label="hint"
                value={exposed.hint ?? ''}
                onChange={v => setExposed({ ...exposed, hint: v.trim() ? v : undefined })}
                placeholder="optional tooltip"
            />
        </Box>
    )
}

/** PublishRoot view in the inspector — live publication summary +
 *  validation errors. Reuses `derivePublishedSurface` keyed on the
 *  publish-aware structural hash so noise (viewport, label edits on
 *  unrelated nodes, page renames) doesn't trigger re-traversal. */
function RootInspector({ pages }: { pages: ReturnType<typeof useScene>['pages'] }) {
    const hash = publishStructuralHash(pages)
    const result = useMemo(
        () => deriveFromPages(pages),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hash],
    )
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <SectionTitle>publish summary</SectionTitle>
            <PublishSummary result={result} />
        </Box>
    )
}

function PublishSummary({ result }: { result: DerivePublishedSurfaceResult }) {
    if (!result.ok) {
        return (
            <Box>
                {result.errors.map((e, i) => (
                    <StatusLine key={i} tone="error">{describeError(e)}</StatusLine>
                ))}
            </Box>
        )
    }
    const s = result.pipeline.surface
    return (
        <Box>
            <StatusLine tone="muted">image slots: {s.imageSlots.length}</StatusLine>
            {s.imageSlots.map(slot => (
                <StatusLine key={slot.nodeId}>· {slot.label} ({slot.nodeId})</StatusLine>
            ))}
            <StatusLine tone="muted">tap zones: {s.tapZones.length}</StatusLine>
            {s.tapZones.map(z => (
                <StatusLine key={z.nodeId}>· {z.eventId} — {z.label}</StatusLine>
            ))}
            <StatusLine tone="muted">fields: {s.fields.length}</StatusLine>
            {s.fields.map((f, i) => (
                <StatusLine key={`${f.nodeId}:${f.paramKey}:${i}`}>· {f.label} ({f.paramKey})</StatusLine>
            ))}
            <StatusLine tone="muted">whole nodes: {s.wholeNodes.length}</StatusLine>
            {s.wholeNodes.map(n => (
                <StatusLine key={n.nodeId}>· {n.processor} — {n.label}</StatusLine>
            ))}
            <StatusLine tone="muted">graph: {result.pipeline.graph.nodes.length} nodes / {result.pipeline.graph.edges.length} edges</StatusLine>
        </Box>
    )
}

function describeError(e: PublishError): string {
    switch (e.kind) {
        case 'no-root': return 'No PublishRoot node — the publish surface is empty.'
        case 'multiple-roots': return `Multiple PublishRoot nodes (${e.nodeIds.join(', ')}) — only one per scene is supported.`
        case 'orphan-exposed': return `Node ${e.nodeId} is marked exposed but isn't connected to PublishRoot.`
        case 'duplicate-tap-id': return `Duplicate tap event id "${e.eventId}" on nodes ${e.nodeIds.join(', ')}.`
        case 'image-slot-missing-label': return `Exposed image node ${e.nodeId} needs a supplier-facing label.`
        case 'effect-id-missing': return 'PublishRoot.id (slug) is empty — required for publish.'
    }
}
