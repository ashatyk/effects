import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useSetParam } from './useSetParam'
import { NumberField, SelectField, SwitchField } from './widgets'
import { contourResampleDef } from '../../node-engine/processors/contour-resample'
import type { PipelineNodeData } from './types'

const SMOOTH_METHODS = ['none', 'chaikin', 'laplacian', 'chaikin+laplacian'] as const
type SmoothMethod = typeof SMOOTH_METHODS[number]
const ORIENTATIONS = ['auto', 'cw', 'ccw'] as const
type Orientation = typeof ORIENTATIONS[number]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const clampInt = (v: number, lo: number, hi: number) => clamp(Math.round(v || 0), lo, hi)

export const ContourResampleNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const p = data.params
    const adaptive = Boolean(p.adaptive ?? false)
    return (
        <BaseNodeShell title="Contour Resample" category={contourResampleDef.category} inputs={contourResampleDef.inputs} outputs={contourResampleDef.outputs}>
            <SelectField label="smooth" value={(p.smoothMethod ?? 'chaikin+laplacian') as SmoothMethod} options={SMOOTH_METHODS} onChange={v => set('smoothMethod', v)} />
            <NumberField label="chaikin iters" value={(p.chaikinIters ?? 2) as number} min={0} max={4} step={1}
                onChange={v => set('chaikinIters', clampInt(v, 0, 4))} />
            <NumberField label="laplacian iters" value={(p.laplacianIters ?? 4) as number} min={0} max={16} step={1}
                onChange={v => set('laplacianIters', clampInt(v, 0, 16))} />
            <NumberField label="laplacian λ" value={(p.laplacianLambda ?? 0.5) as number} min={0} max={1} step={0.05}
                onChange={v => set('laplacianLambda', clamp(v, 0, 1))} />
            <NumberField label="samples" value={(p.sampleCount ?? 256) as number} min={8} max={2048} step={8}
                onChange={v => set('sampleCount', clampInt(v, 8, 2048))} />
            <NumberField label="offset px" value={(p.offsetPx ?? 0) as number} min={-200} max={200} step={1}
                onChange={v => set('offsetPx', clamp(v, -200, 200))} />
            <SelectField label="orientation" value={(p.forceOrientation ?? 'auto') as Orientation} options={ORIENTATIONS} onChange={v => set('forceOrientation', v)} />
            <SwitchField label="adaptive" checked={adaptive} onChange={v => set('adaptive', v)} />
            <NumberField label="adaptive strength" value={(p.adaptiveStrength ?? 0.5) as number} min={0} max={1} step={0.05}
                disabled={!adaptive}
                onChange={v => set('adaptiveStrength', clamp(v, 0, 1))} />
        </BaseNodeShell>
    )
})
