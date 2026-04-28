import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { useSetParam } from './useSetParam'
import { SliderField, StatusLine } from './widgets'
import { textRemovalMaskDef, TextRemovalMaskProcessor } from '../../node-engine/processors/text-removal-mask'
import type { PipelineNodeData } from './types'

export const TextRemovalMaskNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const p = data.params
    const [statusText, setStatusText] = useState('Waiting for image...')

    useEffect(() => {
        const proc = engine.getProcessor<TextRemovalMaskProcessor>(id)
        if (!proc) return
        proc.onChange = () => setStatusText(proc.statusText)
        return () => { if (proc) proc.onChange = null }
    }, [engine, id])

    return (
        <BaseNodeShell title="Text OBB Mask" category={textRemovalMaskDef.category}
            inputs={textRemovalMaskDef.inputs} outputs={textRemovalMaskDef.outputs}>
            <StatusLine>{statusText}</StatusLine>
            <SliderField label="min conf" value={(p.threshold ?? 0.35) as number} min={0.05} max={0.5} step={0.01} fixed={2} onChange={v => set('threshold', v)} />
            <SliderField label="dilate" value={(p.dilate ?? 2) as number} min={0} max={8} step={1} fixed={0} onChange={v => set('dilate', v)} />
            <SliderField label="blur" value={(p.blur ?? 1) as number} min={0} max={6} step={1} fixed={0} onChange={v => set('blur', v)} />
            <SliderField label="min area" value={(p.min_area ?? 32) as number} min={4} max={400} step={4} fixed={0} onChange={v => set('min_area', v)} />
            <SliderField label="box padding" value={(p.box_padding ?? 0.08) as number} min={0} max={0.35} step={0.01} fixed={2} onChange={v => set('box_padding', v)} />
        </BaseNodeShell>
    )
})
