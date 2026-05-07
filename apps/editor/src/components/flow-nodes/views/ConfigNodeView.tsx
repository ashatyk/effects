import { memo, useMemo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { configDef } from '@effects/runtime/node-engine/processors/config'
import { effects } from '@effects/runtime'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: visual-only — shows the active effect name. The effect
 * picker, export button, and per-field uniform widgets all live in
 * `ConfigNodeSettings`.
 */
export const ConfigNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const effectName = (data.params.effect ?? effects[0]?.name ?? '') as string
    const effectCfg = useMemo(() => effects.find(e => e.name === effectName), [effectName])
    const fieldCount = effectCfg?.fields.length ?? 0

    return (
        <BaseNodeShell title={configDef.title} category={configDef.category} inputs={configDef.inputs} outputs={configDef.outputs} minWidth={220}>
            <StatusLine>{effectName || '— no effect —'}</StatusLine>
            <StatusLine tone="muted">{fieldCount} field{fieldCount === 1 ? '' : 's'}</StatusLine>
        </BaseNodeShell>
    )
})
