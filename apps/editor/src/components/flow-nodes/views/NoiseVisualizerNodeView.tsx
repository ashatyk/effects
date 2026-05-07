import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import {
    noiseVisualizerDef,
    type NoiseMode,
} from '@effects/runtime/node-engine/processors/noise-visualizer'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: visual-only — declares its current surface mode.
 * Surface picker + parameter sliders live in
 * `NoiseVisualizerNodeSettings`. Wire to a Preview node to see the
 * texture itself.
 */
export const NoiseVisualizerNodeView = memo(function NoiseVisualizerNodeView(
    { data }: NodeProps & { data: PipelineNodeData },
) {
    const mode = (data.params.mode ?? 'chess') as NoiseMode

    return (
        <BaseNodeShell
            title={noiseVisualizerDef.title}
            category={noiseVisualizerDef.category}
            inputs={noiseVisualizerDef.inputs}
            outputs={noiseVisualizerDef.outputs}
        >
            <StatusLine tone="muted">surface: {mode}</StatusLine>
        </BaseNodeShell>
    )
})
