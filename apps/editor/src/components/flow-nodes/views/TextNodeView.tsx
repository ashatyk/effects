import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { textDef } from '@effects/runtime/node-engine/processors/text'
import type { PipelineNodeData } from '../types'

export const TextNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const value = (data.params.value ?? '') as string
    const trimmed = value.trim()
    return (
        <BaseNodeShell title={textDef.title} category={textDef.category} inputs={textDef.inputs} outputs={textDef.outputs} minWidth={220}>
            {trimmed.length > 0
                ? (
                    <Typography
                        variant="body2"
                        sx={{
                            fontSize: 12,
                            lineHeight: 1.4,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            /* `--pn-text` is dark on the light card; MUI's `text.primary`
                               would resolve to dark-theme white (invisible here). */
                            color: 'var(--pn-text, #0a0a0a)',
                        }}
                    >
                        {value}
                    </Typography>
                )
                : <StatusLine tone="muted">empty — edit in Settings</StatusLine>}
        </BaseNodeShell>
    )
})
