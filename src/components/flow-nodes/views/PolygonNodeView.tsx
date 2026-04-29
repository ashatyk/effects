import { memo, useCallback, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { ActionButton } from '../widgets'
import { polygonDef } from '../../../node-engine/processors/polygon'
import { PolygonProcessor } from '../../../node-engine/processors/polygon'
import type { PipelineNodeData } from '../types'

export const PolygonNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [label, setLabel] = useState('Polygon')

    const loadJSON = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            const text = await file.text()
            const parsed = JSON.parse(text)
            const arr = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray)
            if (Array.isArray(arr)) {
                const proc = engine.getProcessor<PolygonProcessor>(id)
                proc?.setContour(arr as number[], engine)
                setLabel(`Polygon: ${file.name}`)
            }
        }
        input.click()
    }, [engine, id])

    return (
        <BaseNodeShell title={label} category={polygonDef.category} inputs={polygonDef.inputs} outputs={polygonDef.outputs}>
            <ActionButton onClick={loadJSON} variant="primary">Load JSON</ActionButton>
        </BaseNodeShell>
    )
})
