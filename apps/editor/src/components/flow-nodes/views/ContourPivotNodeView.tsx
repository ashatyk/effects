import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField, StatusLine } from '@effects/ui'
import {
    contourPivotDef,
    ContourPivotProcessor,
    PIVOT_MODES,
    type PivotMode,
} from '@effects/runtime/node-engine/processors/contour-pivot'
import type { PipelineNodeData } from '../types'

const MODE_LABELS: Record<PivotMode, string> = {
    aabb: 'aabb · centre of bounding box',
    vertexMean: 'vertex mean · arithmetic average',
    area: 'area · polygon centroid (centre of mass)',
    arc: 'arc · perimeter-weighted centroid',
    min: 'min · bottom-left of bbox',
    max: 'max · top-right of bbox',
}

const numberParam = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

export const ContourPivotNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const p = data.params

    const mode = (PIVOT_MODES.includes(p.mode as PivotMode) ? p.mode : 'area') as PivotMode
    const offsetX = numberParam(p.offsetX, 0)
    const offsetY = numberParam(p.offsetY, 0)

    const [pivot, setPivot] = useState<[number, number] | null>(null)
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<ContourPivotProcessor>(id)
            setPivot(proc?.lastPivot ?? null)
        }
        tick()
        return engine.subscribeNode(id, tick)
    }, [engine, id])

    return (
        <BaseNodeShell
            title={contourPivotDef.title}
            category={contourPivotDef.category}
            inputs={contourPivotDef.inputs}
            outputs={contourPivotDef.outputs}
            minWidth={220}
        >
            <SelectField
                label="mode"
                value={mode}
                options={PIVOT_MODES}
                onChange={v => set('mode', v)}
                formatOption={v => MODE_LABELS[v]}
            />
            <NumberField
                label="offset x"
                value={offsetX}
                step={1}
                onChange={v => set('offsetX', numberParam(v, 0))}
            />
            <NumberField
                label="offset y"
                value={offsetY}
                step={1}
                onChange={v => set('offsetY', numberParam(v, 0))}
            />
            {pivot && (
                <StatusLine tone="muted">{`pivot: ${pivot[0].toFixed(1)}, ${pivot[1].toFixed(1)} px`}</StatusLine>
            )}
        </BaseNodeShell>
    )
})
