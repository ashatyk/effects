import { memo, useCallback } from 'react'
import { useEngine } from '../context/EngineContext'
import { useScene } from '../../node-editor/SceneContext'
import { ActionButton } from '@effects/ui'
import { ImageProcessor } from '@effects/runtime/node-engine/processors/image'
import type { NodeSettingsProps } from './types'

export const ImageNodeSettings = memo(({ id }: NodeSettingsProps) => {
    const engine = useEngine()
    const { updateNodeData } = useScene()

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
                updateNodeData(id, { label: `Image: ${file.name}` })
            }
            reader.readAsDataURL(file)
        }
        input.click()
    }, [engine, id, updateNodeData])

    return <ActionButton onClick={pickFile} variant="primary">Load image</ActionButton>
})
