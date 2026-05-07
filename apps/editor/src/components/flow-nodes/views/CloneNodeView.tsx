import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine, ActionButton } from '@effects/ui'
import { useScene } from '../../node-editor/SceneContext'
import type { PipelineNodeData } from '../types'
/* StatusLine is still used by the BrokenCloneShell error path below. */

/**
 * UI-only viewer alias of an original node. Shows the original's
 * outputs (so it can be wired downstream as if it were the original)
 * but accepts no inputs — inputs are edited in one place, on the
 * original.
 *
 * The cells of the contract:
 *   - `data.cloneOf` is the original's id (any page in the scene).
 *   - The clone has no React processor; engine never sees it.
 *   - Output handles are derived dynamically from the original's
 *     processor `def.outputs`, so changes on the original (rare —
 *     processor type is fixed at creation, but a manifest could expose
 *     more outputs in a future release) flow through automatically.
 *   - When the original is missing (deleted, unknown processor type
 *     after a snapshot import), we render a "broken reference" shell
 *     in slate. Edges that pointed at the broken clone get filtered
 *     out by `resolveSceneForEngine` so the engine doesn't choke.
 */
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
