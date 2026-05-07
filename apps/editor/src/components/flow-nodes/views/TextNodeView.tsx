import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { textDef } from '@effects/runtime/node-engine/processors/text'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: read-only preview of the live string (or empty-state
 * hint). The multiline editor lives in `TextNodeSettings`.
 */
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
                            /* `--pn-text` resolves to the dark text token
                             * defined on `.pn` (`#0a0a0a` on the light card
                             * surface). MUI's `text.primary` would resolve
                             * to the dark-theme white instead, which is
                             * invisible against the light card body. The
                             * fallback (#0a0a0a) is harmless if a host
                             * ever rendered this card outside `.pn`. */
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
