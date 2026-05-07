import { memo, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Box from '@mui/material/Box'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { TextFieldRow, StatusLine } from '@effects/ui'
import { publishRootDef } from '@effects/runtime'
import type { DerivePublishedSurfaceResult, PublishError } from '@effects/runtime'
import { useScene } from '../../node-editor/SceneContext'
import { deriveFromPages } from '../../node-editor/publish-from-pages'
import type { PipelineNodeData } from '../types'

/**
 * Node card for the Tier-2 publish entry point. Three text fields
 * drive the supplier-facing metadata (`name` / `version` / `effectId`
 * slug); the bottom block runs `derivePublishedSurface` against the
 * current scene on every render and shows a counters summary so the
 * author sees, at a glance, what the supplier will receive. Errors
 * surface inline (red) instead of being hidden until the toolbar
 * Publish button is pressed.
 *
 * The traversal is cheap (Map walks + BFS over edges; no GPU work)
 * so we recompute on every render against `pages`. If the scene grows
 * past tens of thousands of nodes a `useMemo` keyed on
 * `publishStructuralHash` would be the next step.
 */
export const PublishRootNodeView = memo(function PublishRootNodeView(
    { id, data }: NodeProps & { data: PipelineNodeData },
) {
    const { pages } = useScene()
    const set = useSetParam(id)

    const name = (data.params.name as string | undefined) ?? 'Untitled'
    const version = (data.params.version as string | undefined) ?? 'v1'
    const effectId = (data.params.effectId as string | undefined) ?? ''

    const result = useMemo(() => deriveFromPages(pages), [pages])

    return (
        <BaseNodeShell
            title={publishRootDef.title}
            category={publishRootDef.category}
            inputs={publishRootDef.inputs}
            outputs={publishRootDef.outputs}
            minWidth={320}
        >
            <TextFieldRow
                label="name"
                value={name}
                onChange={v => set('name', v)}
                placeholder="Untitled"
            />
            <TextFieldRow
                label="version"
                value={version}
                onChange={v => set('version', v)}
                placeholder="v1"
            />
            <TextFieldRow
                label="id (slug)"
                value={effectId}
                onChange={v => set('effectId', slugify(v))}
                placeholder="my-effect"
                monospace
            />
            <Summary result={result} />
        </BaseNodeShell>
    )
})

function Summary({ result }: { result: DerivePublishedSurfaceResult }) {
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
            <StatusLine tone="muted">tap zones: {s.tapZones.length}</StatusLine>
            <StatusLine tone="muted">fields: {s.fields.length}</StatusLine>
            <StatusLine tone="muted">whole nodes: {s.wholeNodes.length}</StatusLine>
            <StatusLine tone="muted">
                graph: {result.pipeline.graph.nodes.length} nodes / {result.pipeline.graph.edges.length} edges
            </StatusLine>
        </Box>
    )
}

function describeError(e: PublishError): string {
    switch (e.kind) {
        case 'no-root':
            return 'No PublishRoot node — the publish surface is empty.'
        case 'multiple-roots':
            return `Multiple PublishRoot nodes (${e.nodeIds.join(', ')}) — only one per scene is supported.`
        case 'orphan-exposed':
            return `Node ${e.nodeId} is marked exposed but isn't connected to PublishRoot.`
        case 'duplicate-tap-id':
            return `Duplicate tap event id "${e.eventId}" on nodes ${e.nodeIds.join(', ')}.`
        case 'image-slot-missing-label':
            return `Exposed image node ${e.nodeId} needs a supplier-facing label.`
        case 'effect-id-missing':
            return 'PublishRoot.id (slug) is empty — required for publish.'
        default:
            return 'Unknown publish error.'
    }
}

/* Conservative ASCII slug: lowercase alphanumerics + hyphen, no
   trailing hyphens, capped length. Keeps cyrillic/unicode out because
   Tier-3 runtimes pin URL routes and file names to this id. */
function slugify(v: string): string {
    return v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
}
