import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { SelectField, SliderField } from '@effects/ui'
import type { NodeSettingsProps } from './types'

const BLEND_MODES = [
    'normal', 'multiply', 'screen', 'overlay', 'add', 'subtract', 'soft-light', 'hard-light',
] as const
type BlendMode = typeof BLEND_MODES[number]

export const BlendNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <>
            <SelectField
                label="mode"
                value={(p.mode ?? 'normal') as BlendMode}
                options={BLEND_MODES}
                onChange={v => set('mode', v)}
            />
            <SliderField
                label="opacity"
                value={(p.opacity ?? 1) as number}
                min={0} max={1} step={0.05} fixed={2}
                onChange={v => set('opacity', v)}
            />
        </>
    )
})
