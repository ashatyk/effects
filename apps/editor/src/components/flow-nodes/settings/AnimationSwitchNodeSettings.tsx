import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField, SectionTitle } from '@effects/ui'
import {
    type SwitchProfile, type SwitchSide,
} from '@effects/runtime/node-engine/processors/signal-switch'
import type { NodeSettingsProps } from './types'

const PROFILES: SwitchProfile[] = [
    'instant', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'smoothstep', 'sine',
]
const SIDES: SwitchSide[] = ['a', 'b']

export const AnimationSwitchNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const initialSide    = (data.params.initialSide    ?? 'a') as SwitchSide
    const transitionAbMs = (data.params.transitionAbMs ?? 500) as number
    const transitionBaMs = (data.params.transitionBaMs ?? 500) as number
    const profileAb      = (data.params.profileAb      ?? 'easeInOut') as SwitchProfile
    const profileBa      = (data.params.profileBa      ?? 'easeInOut') as SwitchProfile

    return (
        <>
            <SectionTitle>Control</SectionTitle>
            <SelectField
                label="initial side" value={initialSide} options={SIDES}
                onChange={v => set('initialSide', v)}
                formatOption={s => s.toUpperCase()}
            />

            <SectionTitle>Transition A → B</SectionTitle>
            <NumberField label="duration (ms)" value={transitionAbMs} step={50} min={0} max={10000} onChange={v => set('transitionAbMs', v)} />
            <SelectField label="profile"       value={profileAb}      options={PROFILES} onChange={v => set('profileAb', v)} />

            <SectionTitle>Transition B → A</SectionTitle>
            <NumberField label="duration (ms)" value={transitionBaMs} step={50} min={0} max={10000} onChange={v => set('transitionBaMs', v)} />
            <SelectField label="profile"       value={profileBa}      options={PROFILES} onChange={v => set('profileBa', v)} />
        </>
    )
})
