import { memo, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Box from '@mui/material/Box'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { publishRootDef } from '@effects/runtime'
import type { DerivePublishedSurfaceResult, PublishError } from '@effects/runtime'
import { useScene } from '../../node-editor/SceneContext'
import { deriveFromPages } from '../../node-editor/publish-from-pages'
import type { PipelineNodeData } from '../types'

export const PublishRootNodeView = memo(function PublishRootNodeView(
    { data }: NodeProps & { data: PipelineNodeData },
) {
    const { pages } = useScene()

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
            minWidth={260}
        >
            <Box>
                <StatusLine tone="muted">name: {name}</StatusLine>
                <StatusLine tone="muted">version: {version}</StatusLine>
                <StatusLine tone={effectId ? 'muted' : 'error'}>
                    id: {effectId || '(unset — edit in Settings)'}
                </StatusLine>
            </Box>
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
