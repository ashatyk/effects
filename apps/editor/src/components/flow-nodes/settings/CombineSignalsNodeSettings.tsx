import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '@effects/ui'
import { type CombineMode } from '@effects/runtime/node-engine/processors/combine-signals'
import type { NodeSettingsProps } from './types'

const MODES: CombineMode[] = ['add', 'max', 'min', 'multiply', 'a_overrides_b', 'b_overrides_a', 'mix']

export const CombineSignalsNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const mode = (data.params.mode ?? 'a_overrides_b') as CombineMode
    const mixFactor = (data.params.mixFactor ?? 0.5) as number
    return (
        <>
            <SelectField
                label="mode" value={mode} options={MODES}
                onChange={v => set('mode', v)}
                formatOption={m => m.replace(/_/g, ' ')}
            />
            {mode === 'mix' && (
                <NumberField
                    label="mix (a→b)"
                    value={mixFactor} step={0.05} min={0} max={1}
                    onChange={v => set('mixFactor', v)}
                />
            )}
        </>
    )
})
