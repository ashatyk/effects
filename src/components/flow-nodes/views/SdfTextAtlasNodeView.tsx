import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { StatusLine, TextFieldRow } from '../widgets'
import { sdfTextAtlasDef } from '../../../node-engine/processors/sdf-text-atlas'
import type { PipelineNodeData } from '../types'

export const SdfTextAtlasNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const text = (data.params.text ?? 'Купи в комплекте') as string
    return (
        <BaseNodeShell title={sdfTextAtlasDef.title} category={sdfTextAtlasDef.category} inputs={sdfTextAtlasDef.inputs} outputs={sdfTextAtlasDef.outputs} minWidth={220}>
            <TextFieldRow label="text (≤16 chars)" value={text} maxLength={16} onChange={v => set('text', v)} />
            <StatusLine tone="muted">4×4 SDF atlas, sequential char per cell</StatusLine>
        </BaseNodeShell>
    )
})
