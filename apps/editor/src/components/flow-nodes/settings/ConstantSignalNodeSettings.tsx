import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SwitchField } from '@effects/ui'
import type { NodeSettingsProps } from './types'

export const ConstantSignalNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? 0) as number
    const state = (data.params.state ?? false) as boolean
    return (
        <>
            <NumberField label="value" value={value} step={0.05} onChange={v => set('value', v)} />
            <SwitchField label="state (active)" checked={state} onChange={v => set('state', v)} />
        </>
    )
})
