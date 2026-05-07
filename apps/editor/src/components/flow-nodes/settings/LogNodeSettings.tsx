import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { SliderField } from '@effects/ui'
import type { NodeSettingsProps } from './types'

export const LogNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    return (
        <SliderField
            label="smoothing"
            value={(data.params.smoothing ?? 0.85) as number}
            min={0} max={0.99} step={0.01} fixed={2}
            onChange={v => set('smoothing', v)}
        />
    )
})
