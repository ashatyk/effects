import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { imageDef } from '@effects/runtime/node-engine/processors/image'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: visual-only — title (rename to "Image: <file>" via
 * `data.label` after a load) plus a status hint when nothing is
 * loaded yet. The file picker lives in `ImageNodeSettings`.
 */
export const ImageNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const label = data.label ?? 'Image'
    const hasFile = label !== 'Image' && label !== imageDef.title
    return (
        <BaseNodeShell title={label} category={imageDef.category} inputs={imageDef.inputs} outputs={imageDef.outputs}>
            {!hasFile && (
                <StatusLine tone="muted">no image — load via Settings</StatusLine>
            )}
        </BaseNodeShell>
    )
})
