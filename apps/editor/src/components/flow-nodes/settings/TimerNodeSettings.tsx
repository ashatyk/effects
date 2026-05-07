import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField, SwitchField } from '@effects/ui'
import { type TimerMode } from '@effects/runtime/node-engine/processors/timer'
import type { NodeSettingsProps } from './types'

const MODES: TimerMode[] = ['looped', 'unbounded']

export const TimerNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const mode = (data.params.mode ?? 'looped') as TimerMode
    const durationMs = (data.params.durationMs ?? 2000) as number
    const phaseOffsetMs = (data.params.phaseOffsetMs ?? 0) as number
    const paused = Boolean(data.params.paused ?? false)
    return (
        <>
            <SelectField label="mode" value={mode} options={MODES} onChange={v => set('mode', v)} />
            <NumberField
                label="duration (ms)"
                value={durationMs} step={50} min={1}
                onChange={v => set('durationMs', v || 1)}
            />
            <NumberField
                label="phase offset (ms)"
                value={phaseOffsetMs} step={50}
                onChange={v => set('phaseOffsetMs', v)}
            />
            <SwitchField label="paused" checked={paused} onChange={v => set('paused', v)} />
        </>
    )
})
