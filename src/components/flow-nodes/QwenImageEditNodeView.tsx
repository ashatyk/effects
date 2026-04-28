import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { useSetParam } from './useSetParam'
import { NumberField, SelectField, StatusLine, TextFieldRow } from './widgets'
import { qwenImageEditDef, QwenImageEditProcessor, AVAILABLE_MODELS } from '../../node-engine/processors/qwen-image-edit'
import type { PipelineNodeData } from './types'

type ModelName = typeof AVAILABLE_MODELS[number]

export const QwenImageEditNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const p = data.params
    const [statusText, setStatusText] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<QwenImageEditProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatusText(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title="AI Image Edit" category={qwenImageEditDef.category}
            inputs={qwenImageEditDef.inputs} outputs={qwenImageEditDef.outputs} minWidth={260}>
            <StatusLine>{statusText}</StatusLine>
            <SelectField
                label="model"
                value={(p.model ?? 'qwen-image-edit') as ModelName}
                options={AVAILABLE_MODELS}
                onChange={v => set('model', v)}
            />
            <TextFieldRow
                label="prompt"
                value={(p.prompt ?? qwenImageEditDef.defaultParams.prompt) as string}
                onChange={v => set('prompt', v)}
                multiline rows={3}
            />
            <TextFieldRow
                label="negative"
                value={(p.negative_prompt ?? qwenImageEditDef.defaultParams.negative_prompt) as string}
                onChange={v => set('negative_prompt', v)}
                multiline rows={2}
            />
            <NumberField label="seed (-1=rand)" value={(p.seed ?? -1) as number} step={1} onChange={v => set('seed', v)} />
        </BaseNodeShell>
    )
})
