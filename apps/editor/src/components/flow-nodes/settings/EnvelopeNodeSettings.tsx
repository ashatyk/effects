import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '@effects/ui'
import {
    type EnvelopeShape, type Easing, type RetriggerMode,
} from '@effects/runtime/node-engine/processors/envelope'
import type { NodeSettingsProps } from './types'

const SHAPES = ['bell', 'rise', 'fall', 'plateau', 'gaussian', 'triangle'] as const
const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const
const MODES = ['restart', 'add', 'max'] as const

export const EnvelopeNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const shape = (data.params.shape ?? 'bell') as string
    const durationMs = (data.params.durationMs ?? 600) as number
    const peakTime = (data.params.peakTime ?? 0.5) as number
    const plateauHold = (data.params.plateauHold ?? 0.4) as number
    const attackEasing = (data.params.attackEasing ?? 'linear') as string
    const decayEasing = (data.params.decayEasing ?? 'linear') as string
    const retriggerMode = (data.params.retriggerMode ?? 'restart') as string

    const showPeak = shape !== 'bell' && shape !== 'rise' && shape !== 'fall'
    const showPlateau = shape === 'plateau'
    const showAttack = shape === 'rise' || shape === 'plateau'
    const showDecay = shape === 'fall' || shape === 'plateau'

    return (
        <>
            <SelectField label="shape" value={shape as EnvelopeShape} options={SHAPES} onChange={v => set('shape', v)} />
            <NumberField label="duration (ms)" value={durationMs} step={50} min={1} onChange={v => set('durationMs', v || 1)} />
            {showPeak && (
                <NumberField label="peak (0..1)" value={peakTime} step={0.05} min={0} max={1} onChange={v => set('peakTime', v)} />
            )}
            {showPlateau && (
                <NumberField label="hold (0..1)" value={plateauHold} step={0.05} min={0} max={1} onChange={v => set('plateauHold', v)} />
            )}
            {showAttack && (
                <SelectField label="attack" value={attackEasing as Easing} options={EASINGS} onChange={v => set('attackEasing', v)} />
            )}
            {showDecay && (
                <SelectField label="decay" value={decayEasing as Easing} options={EASINGS} onChange={v => set('decayEasing', v)} />
            )}
            <SelectField label="retrigger" value={retriggerMode as RetriggerMode} options={MODES} onChange={v => set('retriggerMode', v)} />
        </>
    )
})
