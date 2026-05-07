import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '@effects/ui'
import { textStyleDef } from '@effects/runtime/node-engine/processors/text-style'
import type { PipelineNodeData } from '../types'

const DEFAULT_FONT = '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif'

/* Curated dropdown of CSS font stacks. Each entry has:
   - label: short human name shown in the dropdown
   - stack: full CSS font-family list passed to canvas2d.
   Browsers resolve the stack left-to-right, falling back to the family
   keyword (sans-serif/serif/monospace/cursive) if nothing else is installed. */
const FONT_PRESETS: { label: string; stack: string }[] = [
    { label: 'Sans (Inter)',           stack: '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif' },
    { label: 'Sans (System)',          stack: 'system-ui, -apple-system, "Segoe UI", "Roboto", sans-serif' },
    { label: 'Sans (Helvetica)',       stack: '"Helvetica Neue", "Helvetica", "Arial", sans-serif' },
    { label: 'Sans (Arial)',           stack: 'Arial, sans-serif' },
    { label: 'Sans (Verdana)',         stack: 'Verdana, Geneva, sans-serif' },
    { label: 'Sans (Trebuchet)',       stack: '"Trebuchet MS", sans-serif' },
    { label: 'Sans (Tahoma)',          stack: 'Tahoma, Geneva, sans-serif' },
    { label: 'Serif (Georgia)',        stack: 'Georgia, "Times New Roman", Times, serif' },
    { label: 'Serif (Times)',          stack: '"Times New Roman", Times, serif' },
    { label: 'Serif (Garamond)',       stack: 'Garamond, "Times New Roman", serif' },
    { label: 'Serif (Cambria)',        stack: 'Cambria, Georgia, serif' },
    { label: 'Mono (SF Mono)',         stack: '"SF Mono", "Menlo", "Consolas", "Roboto Mono", monospace' },
    { label: 'Mono (Courier)',         stack: '"Courier New", Courier, monospace' },
    { label: 'Mono (Monaco)',          stack: 'Monaco, Menlo, Consolas, monospace' },
    { label: 'Display (Impact)',       stack: 'Impact, "Haettenschweiler", "Arial Black", sans-serif' },
    { label: 'Display (Arial Black)',  stack: '"Arial Black", "Helvetica Bold", sans-serif' },
    { label: 'Display (Matemasie)',    stack: '"Matemasie", "Impact", "Arial Black", sans-serif' },
    { label: 'Cursive (Brush Script)', stack: '"Brush Script MT", cursive' },
    { label: 'Cursive (Comic Sans)',   stack: '"Comic Sans MS", "Comic Sans", cursive' },
]

const FONT_OPTIONS = FONT_PRESETS.map(p => p.stack)
const FONT_LABEL_BY_STACK = Object.fromEntries(FONT_PRESETS.map(p => [p.stack, p.label]))

const WEIGHT_OPTIONS = ['regular', 'bold'] as const
const TRANSFORM_OPTIONS = ['none', 'upper', 'lower'] as const

export const TextStyleNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const font = (data.params.font ?? DEFAULT_FONT) as string
    const letterSpacing = (data.params.letterSpacing ?? 0) as number
    const weight = (data.params.weight ?? 'bold') as 'regular' | 'bold'
    const transform = (data.params.transform ?? 'none') as 'none' | 'upper' | 'lower'

    /* If the saved font stack is not in the preset list, surface it as a
       transient "Custom" option so the user doesn't see it as "missing". */
    const isCustom = !FONT_OPTIONS.includes(font)
    const fontOptions = isCustom ? [font, ...FONT_OPTIONS] : FONT_OPTIONS

    return (
        <BaseNodeShell title={textStyleDef.title} category={textStyleDef.category} inputs={textStyleDef.inputs} outputs={textStyleDef.outputs} minWidth={260}>
            <SelectField
                label="font"
                value={font}
                options={fontOptions}
                onChange={v => set('font', v)}
                formatOption={v => v === font && isCustom ? 'Custom' : FONT_LABEL_BY_STACK[v] ?? v}
                optionStyle={v => ({ fontFamily: v })}
                selectStyle={{ fontFamily: font }}
            />
            <NumberField label="letter spacing (px)" value={letterSpacing} step={1} onChange={v => set('letterSpacing', v)} />
            <SelectField label="weight" value={weight} options={WEIGHT_OPTIONS} onChange={v => set('weight', v)} />
            <SelectField label="case" value={transform} options={TRANSFORM_OPTIONS} onChange={v => set('transform', v)} />
        </BaseNodeShell>
    )
})
