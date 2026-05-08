import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine, ActionButton } from '@effects/ui'
import { useScene } from '../../node-editor/SceneContext'
import type { PipelineNodeData } from '../types'

// UI-only viewer alias. data.cloneOf = origin id; engine never sees the clone. Outputs derive
// from origin's def. Missing origin → BrokenCloneShell (resolveSceneForEngine drops dead edges).
export const CloneNodeView = memo(function CloneNodeView({ data }: NodeProps & { data: PipelineNodeData }) {
    const { findOrigin, jumpToNode } = useScene()
    const cloneOf = data.cloneOf
    const found = cloneOf ? findOrigin(cloneOf) : null
    const def = found ? PROCESSOR_CATALOG[found.node.data.processor]?.def : null

    if (!cloneOf || !found || !def) {
        return <BrokenCloneShell cloneOfId={cloneOf} />
    }

    const originLabel = (found.node.data.label ?? '').trim() || def.title

    return (
        <BaseNodeShell
            title={originLabel}
            category={def.category}
            inputs={[]}
            outputs={def.outputs}
            isClone
            titleEditable={false}
            minWidth={180}
        >
            <Stack spacing={0.75}>
                <ActionButton onClick={() => jumpToNode(cloneOf)}>Open original</ActionButton>
            </Stack>
        </BaseNodeShell>
    )
})

function BrokenCloneShell({ cloneOfId }: { cloneOfId: string | undefined }) {
    return (
        <BaseNodeShell
            title="Broken reference"
            category="util"
            inputs={[]}
            outputs={[]}
            isClone
            titleEditable={false}
            minWidth={200}
        >
            <Stack spacing={0.75}>
                <StatusLine tone="error">
                    {cloneOfId
                        ? `Original "${cloneOfId}" not found in any page.`
                        : 'No origin id set.'}
                </StatusLine>
                <StatusLine tone="muted">
                    Recreate the original or delete this reference.
                </StatusLine>
            </Stack>
        </BaseNodeShell>
    )
}
