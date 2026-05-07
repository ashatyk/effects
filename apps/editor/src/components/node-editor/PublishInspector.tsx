/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useMemo, type ComponentType, type ReactNode } from 'react'
import { useStore } from '@xyflow/react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import SettingsIcon from '@mui/icons-material/Settings'
import { PROCESSOR_CATALOG, effects } from '@effects/runtime'
import type { DerivePublishedSurfaceResult, PublishError } from '@effects/runtime'
import { useScene } from './SceneContext'
import { useSetExposed } from '../flow-nodes/hooks/useSetExposed'
import { TextFieldRow, SwitchField, SectionTitle, StatusLine } from '@effects/ui'
import { deriveFromPages, publishStructuralHash } from './publish-from-pages'
import { pipelineNodeSettings } from '../flow-nodes/settingsTypes'
import { pipelineNodeActions } from '../flow-nodes/actionsTypes'
import type { PipelineNodeData, ExposedMeta } from '../flow-nodes/types'

/**
 * Right-rail Settings panel. **Permanent** surface — no `onClose`
 * prop, no close button in the header. The toolbar carries no toggle
 * for it either; the Settings panel is always visible alongside the
 * canvas (rail width is the only user control, owned by `RightRail`).
 *
 * Two responsibilities:
 *
 *   1. Surface the per-node Settings pane of the currently-selected
 *      node. Each processor ships an independent `*NodeSettings`
 *      component (registered in `pipelineNodeSettings`) — distinct
 *      from the in-graph `*NodeView`. Authors control the two visual
 *      surfaces independently: the graph card stays visual + handles,
 *      the Settings pane carries the editable controls (and any extra
 *      readouts the author wants on this surface).
 *
 *   2. Tier-2 supplier-exposure controls — toggles `data.exposed` per
 *      the processor's nature (whole-node toggle for image / segmentation
 *      / tap-zone / event / generic; per-FieldDef checkboxes for config
 *      nodes), plus a live publication summary on the PublishRoot.
 *      These are unique to Settings.
 *
 * Selection is read straight from the React Flow store so the panel
 * picks up clicks without threading state through every parent.
 */
export const PublishInspector = memo(function PublishInspector() {
    const { pages } = useScene()

    const selectedId = useStore((s: any) => {
        const all = (s.nodeLookup as Map<string, any> | undefined)
        if (!all) return null
        for (const n of all.values()) {
            if (n?.selected) return n.id as string
        }
        return null
    })

    const selectedNode = useMemo(() => {
        if (!selectedId) return null
        for (const p of pages) {
            const n = p.nodes.find(x => x.id === selectedId)
            if (n) return n
        }
        return null
    }, [selectedId, pages])

    return (
        <Box
            sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    /* Match the Scene Outline header height (32 px) so
                     * both rails line up across the editor's top edge.
                     * If you change this, change `SceneOutlineSidebar`'s
                     * header in lockstep. */
                    height: 32,
                    flexShrink: 0,
                    px: 1.5,
                    bgcolor: 'background.default',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, lineHeight: 1 }}>
                    <SettingsIcon sx={{ fontSize: 14, color: 'text.secondary', display: 'block' }} />
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
                        Settings
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
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
            Select a node on the canvas to edit its settings.
        </Typography>
    )
}

interface NodeInspectorProps {
    node: { id: string; data: PipelineNodeData; type?: string }
    pages: ReturnType<typeof useScene>['pages']
}

const NodeInspector = memo(function NodeInspector({ node, pages }: NodeInspectorProps) {
    const proc = node.data.processor
    const def = PROCESSOR_CATALOG[proc]?.def
    const exposed = node.data.exposed
    const setExposed = useSetExposed(node.id)

    if (node.data.cloneOf) {
        return (
            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic', px: 1 }}>
                Clones are UI-only references. Select the original to edit it.
            </Typography>
        )
    }

    const titleFallback = (node.data.label ?? '').trim() || def?.title || proc

    /* PublishRoot is the publication itself — no exposure toggle.
       Its summary is rendered by PublishRootSummary below. */
    const showExposure = proc !== 'publishRoot'

    const SettingsComp = pipelineNodeSettings[proc]
    const ActionsComp = pipelineNodeActions[proc]
    /* Skip the `Parameters` section entirely when the processor only
     * carries actions (e.g. `preview`'s Save image). Otherwise the
     * panel would print "No editable parameters" right above an
     * `Actions` block that clearly proves it has *something* to
     * offer — confusing and noisy. If both registries miss the
     * processor we still render the Parameters section so the
     * empty-state hint surfaces (covers `effect`, `clone`, etc.). */
    const showParameters = !!SettingsComp || !ActionsComp

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <SectionBlock>
                <Box>
                    <SectionTitle>{titleFallback}</SectionTitle>
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>
                        {proc} · {node.id}
                    </Typography>
                </Box>
            </SectionBlock>

            {/* Per-node Settings pane — each processor ships its own
                `*NodeSettings` component, registered in
                `pipelineNodeSettings`. Independent from the in-graph
                `*NodeView` so authors can control the visual layout of
                each surface separately. */}
            {showParameters && (
                <SectionBlock heading="Parameters">
                    <NodeSettingsPane node={node} SettingsComp={SettingsComp} />
                </SectionBlock>
            )}

            {/* Per-node Actions pane — export / snapshot / reset
                buttons that produce side-effects (file download,
                clipboard write) but do NOT mutate scene state. Kept
                in its own section so users don't read "Save image"
                as a tunable parameter. */}
            {ActionsComp && (
                <SectionBlock heading="Actions">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <ActionsComp id={node.id} data={node.data} />
                    </Box>
                </SectionBlock>
            )}

            {proc === 'publishRoot' && (
                <SectionBlock heading="Publish summary">
                    <PublishRootSummary pages={pages} />
                </SectionBlock>
            )}

            {showExposure && (
                <SectionBlock heading="Supplier exposure">
                    {proc === 'config'
                        ? <ConfigFieldsInspector node={node} exposed={exposed} setExposed={setExposed} />
                        : <WholeNodeInspector exposed={exposed} setExposed={setExposed} />}
                    <SharedExposureFields exposed={exposed} setExposed={setExposed} />
                </SectionBlock>
            )}
        </Box>
    )
})

/**
 * Visually-divided section in the right rail. Each block carries an
 * uppercase heading + a top divider so the parameters / publish-summary
 * / supplier-exposure groups read as distinct concerns instead of one
 * flat scroll of widgets. The first block in the panel passes no
 * `heading` so the per-node title group sits flush against the panel
 * header without a redundant divider above it.
 */
function SectionBlock({ heading, children }: { heading?: string; children: ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                /* Generous vertical rhythm: dividers + heading need air on
                 * both sides so blocks parse as distinct concerns rather
                 * than a continuous scroll. The heading also gets a bit
                 * more bottom margin (`mb: 1`) to separate it from the
                 * first row of controls. */
                gap: 1,
                px: 2,
                pt: 2,
                pb: 2,
                ...(heading && {
                    borderTop: 1,
                    borderColor: 'divider',
                }),
            }}
        >
            {heading && (
                <Typography
                    variant="caption"
                    sx={{
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        fontWeight: 700,
                        fontSize: 10,
                        color: 'text.secondary',
                        lineHeight: 1,
                        mb: 0.5,
                    }}
                >
                    {heading}
                </Typography>
            )}
            {children}
        </Box>
    )
}

/**
 * Renders the resolved per-processor Settings component inline.
 * Resolution happens in the parent (`NodeInspector`) so it can also
 * decide whether to skip the surrounding `Parameters` SectionBlock
 * altogether — see the `showParameters` gate. The surrounding
 * `SectionBlock` already supplies padding, gap, and the upper
 * divider, so the pane carries no card frame of its own — controls
 * sit flush with the section heading.
 *
 * Falls back to a friendly placeholder when the processor has no
 * Settings entry AND no Actions entry (covers pure visualisers
 * `effect`, `clone`, `contourPreview`, `textStrip`, `sdfFromContour`).
 */
const NodeSettingsPane = memo(function NodeSettingsPane({ node, SettingsComp }: {
    node: { id: string; data: PipelineNodeData; type?: string }
    SettingsComp: ComponentType<{ id: string; data: PipelineNodeData }> | undefined
}) {
    if (!SettingsComp) {
        return (
            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                This node has no editable parameters.
            </Typography>
        )
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <SettingsComp id={node.id} data={node.data} />
        </Box>
    )
})

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

function PublishRootSummary({ pages }: { pages: ReturnType<typeof useScene>['pages'] }) {
    const hash = publishStructuralHash(pages)
    const result = useMemo(
        () => deriveFromPages(pages),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hash],
    )
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <SectionTitle>publish summary</SectionTitle>
            <PublishSummaryBody result={result} />
        </Box>
    )
}

function PublishSummaryBody({ result }: { result: DerivePublishedSurfaceResult }) {
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
