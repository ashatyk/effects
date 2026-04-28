import { memo, useCallback, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { ActionButton } from './widgets'
import { imageDef } from '../../node-engine/processors/image'
import { ImageProcessor } from '../../node-engine/processors/image'
import type { PipelineNodeData } from './types'

export const ImageNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [label, setLabel] = useState(data.label ?? 'Image')

    const pickFile = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                const proc = engine.getProcessor<ImageProcessor>(id)
                proc?.setImageUrl(reader.result as string, engine)
                setLabel(`Image: ${file.name}`)
            }
            reader.readAsDataURL(file)
        }
        input.click()
    }, [engine, id])

    return (
        <BaseNodeShell title={label} category={imageDef.category} inputs={imageDef.inputs} outputs={imageDef.outputs}>
            <ActionButton onClick={pickFile} variant="primary">Load image</ActionButton>
        </BaseNodeShell>
    )
})
