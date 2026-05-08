/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useMemo, type ComponentType, type ReactNode } from 'react'
import { useStore } from '@xyflow/react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { PROCESSOR_CATALOG, effects } from '@effects/runtime'
import type { DerivePublishedSurfaceResult, PublishError } from '@effects/runtime'
import { useScene } from './SceneContext'
import { useSetExposed } from '../flow-nodes/hooks/useSetExposed'
import { useSetRuntimeDynamic } from '../flow-nodes/hooks/useSetRuntimeDynamic'
import { TextFieldRow, SwitchField, SectionTitle, StatusLine } from '@effects/ui'
import { deriveFromPages, publishStructuralHash } from './publish-from-pages'
import { pipelineNodeSettings } from '../flow-nodes/settingsTypes'
import { pipelineNodeActions } from '../flow-nodes/actionsTypes'
import type { PipelineNodeData, ExposedMeta } from '../flow-nodes/types'

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

    const showExposure = isSupplierExposable(proc)
    const showBakeBehaviour = isBakeEligibleProcessor(proc)

    const SettingsComp = pipelineNodeSettings[proc]
    const ActionsComp = pipelineNodeActions[proc]
    // Skip Parameters section when processor is actions-only (avoids "No editable parameters" above an Actions block).
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

            {showParameters && (
                <SectionBlock heading="Parameters">
                    <NodeSettingsPane node={node} SettingsComp={SettingsComp} />
                </SectionBlock>
            )}

            {ActionsComp && (
                <SectionBlock heading="Actions">
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

            {showBakeBehaviour && (
                <SectionBlock heading="Bake behaviour">
                    <BakeBehaviourInspector
                        nodeId={node.id}
                        runtimeDynamic={node.data.runtimeDynamic === true}
                    />
                </SectionBlock>
            )}
        </Box>
    )
})

function BakeBehaviourInspector({ nodeId, runtimeDynamic }: {
    nodeId: string
    runtimeDynamic: boolean
}) {
    const setRuntimeDynamic = useSetRuntimeDynamic(nodeId)
    return (
        <SwitchField
            label="Compute live in player"
            checked={runtimeDynamic}
            onChange={v => setRuntimeDynamic(v)}
        />
    )
}

// Excludes publishRoot/frame, processors with no Settings widgets, and terminal sinks (no outputs).
function isSupplierExposable(processor: string): boolean {
    if (processor === 'publishRoot') return false
    if (processor === 'frame') return false
    if (!pipelineNodeSettings[processor]) return false
    const def = PROCESSOR_CATALOG[processor]?.def
    if (!def) return false
    if (def.outputs.length === 0) return false
    return true
}

// Mirror of bakePipeline's pure+bakeable-output check (editor cannot depend on @effects/player).
// segmentation is included: the bake treats it as pure-equivalent when an override polygon exists.
// When in doubt return true — a false positive is a no-op toggle, a false negative hides a real choice.
function isBakeEligibleProcessor(processor: string): boolean {
    if (processor === 'segmentation') return true
    const def = PROCESSOR_CATALOG[processor]?.def
    if (!def?.pure) return false
    for (const out of def.outputs) {
        if (out.type === 'CONTOUR' || out.type === 'TEXTURE') return true
    }
    return false
}

function SectionBlock({ heading, children }: { heading?: string; children: ReactNode }) {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                px: 3,
                pt: 3,
                pb: 3,
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
