import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { StatusLine } from '@effects/ui'
import { textStyleDef } from '@effects/runtime/node-engine/processors/text-style'
import type { PipelineNodeData } from '../types'

const DEFAULT_FONT = '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif'

/**
 * Graph card: visual-only — paints "Aa" in the selected typography so
 * the active style is recognisable at a glance, plus a one-line
 * summary of the stylistic params. Editor controls live in
 * `TextStyleNodeSettings`.
 */
export const TextStyleNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const font = (data.params.font ?? DEFAULT_FONT) as string
    const letterSpacing = (data.params.letterSpacing ?? 0) as number
    const weight = (data.params.weight ?? 'bold') as 'regular' | 'bold'
    const transform = (data.params.transform ?? 'none') as 'none' | 'upper' | 'lower'
    const sample = transform === 'upper' ? 'AA' : transform === 'lower' ? 'aa' : 'Aa'
    return (
        <BaseNodeShell title={textStyleDef.title} category={textStyleDef.category} inputs={textStyleDef.inputs} outputs={textStyleDef.outputs} minWidth={220}>
            <Typography
                sx={{
                    fontFamily: font,
                    fontWeight: weight === 'bold' ? 700 : 400,
                    fontSize: 28,
                    lineHeight: 1.1,
                    letterSpacing: `${letterSpacing}px`,
                    /* See `TextNodeView` rationale — `text.primary` is
                     * dark-theme white and reads as invisible on the
                     * light card surface. `--pn-text` is the dark token
                     * scoped to `.pn`. */
                    color: 'var(--pn-text, #0a0a0a)',
                    textAlign: 'center',
                    py: 0.5,
                }}
            >
                {sample}
            </Typography>
            <StatusLine tone="normal">
                {weight} · {transform} · spacing {letterSpacing}px
            </StatusLine>
        </BaseNodeShell>
    )
})
