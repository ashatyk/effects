import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { SliderField } from '@effects/ui'
import type { NodeSettingsProps } from './types'

export const DenoiseNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <>
            <SliderField
                label="radius"
                value={(p.radius ?? 4) as number}
                min={1} max={8} step={1} fixed={0}
                onChange={v => set('radius', v)}
            />
            <SliderField
                label="spatial σ"
                value={(p.spatial_sigma ?? 3) as number}
                min={0.5} max={10} step={0.1} fixed={1}
                onChange={v => set('spatial_sigma', v)}
            />
            <SliderField
                label="range σ"
                value={(p.range_sigma ?? 0.1) as number}
                min={0.01} max={0.5} step={0.01} fixed={2}
                onChange={v => set('range_sigma', v)}
            />
            <SliderField
                label="passes"
                value={(p.passes ?? 1) as number}
                min={1} max={5} step={1} fixed={0}
                onChange={v => set('passes', v)}
            />
        </>
    )
})
