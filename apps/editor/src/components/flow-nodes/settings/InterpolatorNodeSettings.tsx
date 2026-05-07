import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField, SwitchField } from '@effects/ui'
import { type InterpolatorProfile } from '@effects/runtime/node-engine/processors/interpolator'
import type { Easing } from '@effects/runtime/node-engine/processors/envelope'
import type { NodeSettingsProps } from './types'

const PROFILES: InterpolatorProfile[] = [
    'linear', 'sine', 'triangle', 'bell', 'gaussian', 'pulse',
    'steps', 'square', 'sawTeeth',
]
const EASINGS: Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut']

const usesEasing = (p: InterpolatorProfile): boolean =>
    p === 'triangle' || p === 'bell' || p === 'gaussian' || p === 'pulse'
const usesPeak = (p: InterpolatorProfile): boolean =>
    p === 'triangle' || p === 'bell' || p === 'gaussian' || p === 'pulse'
const usesPlateau = (p: InterpolatorProfile): boolean => p === 'pulse'
const usesStepCount = (p: InterpolatorProfile): boolean => p === 'steps'
const usesTeethCount = (p: InterpolatorProfile): boolean => p === 'square' || p === 'sawTeeth'
const usesDutyCycle = (p: InterpolatorProfile): boolean => p === 'square'
const usesSmoothness = (p: InterpolatorProfile): boolean =>
    p === 'steps' || p === 'square' || p === 'sawTeeth'

export const InterpolatorNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const profile = (data.params.profile ?? 'sine') as InterpolatorProfile
    const peakTime = (data.params.peakTime ?? 0.5) as number
    const plateauHold = (data.params.plateauHold ?? 0.4) as number
    const easing = (data.params.easing ?? 'easeInOut') as Easing
    const reverse = Boolean(data.params.reverse ?? false)
    const stepCount = (data.params.stepCount ?? 4) as number
    const teethCount = (data.params.teethCount ?? 4) as number
    const dutyCycle = (data.params.dutyCycle ?? 0.5) as number
    const smoothness = (data.params.smoothness ?? 0) as number
    return (
        <>
            <SelectField label="profile" value={profile} options={PROFILES} onChange={v => set('profile', v)} />
            {usesPeak(profile) && (
                <NumberField label="peak (0..1)" value={peakTime} step={0.05} min={0} max={1} onChange={v => set('peakTime', v)} />
            )}
            {usesPlateau(profile) && (
                <NumberField label="hold width (0..1)" value={plateauHold} step={0.05} min={0} max={1} onChange={v => set('plateauHold', v)} />
            )}
            {usesEasing(profile) && (
                <SelectField label="easing" value={easing} options={EASINGS} onChange={v => set('easing', v)} />
            )}
            {usesStepCount(profile) && (
                <NumberField label="steps (2..64)" value={stepCount} step={1} min={2} max={64} onChange={v => set('stepCount', Math.round(v))} />
            )}
            {usesTeethCount(profile) && (
                <NumberField label="teeth (1..64)" value={teethCount} step={1} min={1} max={64} onChange={v => set('teethCount', Math.round(v))} />
            )}
            {usesDutyCycle(profile) && (
                <NumberField label="duty (0..1)" value={dutyCycle} step={0.05} min={0} max={1} onChange={v => set('dutyCycle', v)} />
            )}
            {usesSmoothness(profile) && (
                <NumberField label="smoothness (0..1)" value={smoothness} step={0.05} min={0} max={1} onChange={v => set('smoothness', v)} />
            )}
            <SwitchField label="reverse" checked={reverse} onChange={v => set('reverse', v)} />
        </>
    )
})
