import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { numberDef } from '@effects/runtime/node-engine/processors/number'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: visual-only — shows the live numeric value.
 * Editable input lives in `NumberNodeSettings` (right-rail / pinned).
 */
export const NumberNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const value = (data.params.value ?? 0) as number
    return (
        <BaseNodeShell title={numberDef.title} category={numberDef.category} inputs={numberDef.inputs} outputs={numberDef.outputs}>
            <StatusLine tone="muted">value: {value}</StatusLine>
        </BaseNodeShell>
    )
})
