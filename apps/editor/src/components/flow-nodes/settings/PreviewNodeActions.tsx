import { memo, useCallback } from 'react'
import { useEngine } from '../context/EngineContext'
import { ActionButton } from '@effects/ui'
import { PreviewProcessor } from '@effects/runtime/node-engine/processors/preview'
import type { NodeSettingsProps } from './types'

export const PreviewNodeActions = memo(({ id }: NodeSettingsProps) => {
    const engine = useEngine()

    const saveImage = useCallback(() => {
        const proc = engine.getProcessor<PreviewProcessor>(id)
        if (!proc?.imgCanvas) return
        const dataUrl = proc.imgCanvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `preview-${id}.png`
        a.click()
    }, [engine, id])

    return <ActionButton onClick={saveImage} variant="primary">Save image</ActionButton>
})
