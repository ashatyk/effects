import { memo } from 'react'
import { NumberField } from '@effects/ui'
import { useSetParam } from '../hooks/useSetParam'
import type { NodeSettingsProps } from './types'

export const NumberNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? 0) as number
    return (
        <NumberField
            label="value"
            value={value}
            onChange={v => set('value', v)}
            step={0.1}
        />
    )
})
