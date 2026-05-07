import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { contourResampleDef } from '@effects/runtime/node-engine/processors/contour-resample'
import type { PipelineNodeData } from '../types'

export const ContourResampleNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const p = data.params
    const samples = (p.sampleCount ?? 256) as number
    const offset = (p.offsetPx ?? 0) as number
    const adaptive = Boolean(p.adaptive ?? false)
    return (
        <BaseNodeShell title={contourResampleDef.title} category={contourResampleDef.category} inputs={contourResampleDef.inputs} outputs={contourResampleDef.outputs}>
            <StatusLine tone="muted">
                {samples} samples{offset !== 0 ? ` · ${offset > 0 ? '+' : ''}${offset}px` : ''}{adaptive ? ' · adaptive' : ''}
            </StatusLine>
        </BaseNodeShell>
    )
})
