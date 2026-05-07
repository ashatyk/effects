import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { SelectField, SliderField } from '@effects/ui'
import {
    NOISE_MODES,
    type NoiseMode,
} from '@effects/runtime/node-engine/processors/noise-visualizer'
import type { NodeSettingsProps } from './types'

export const NoiseVisualizerNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const p = data.params
    const mode = (p.mode ?? 'chess') as NoiseMode

    return (
        <>
            <SelectField
                label="surface"
                value={mode}
                options={NOISE_MODES}
                onChange={v => set('mode', v)}
            />
            <SliderField
                label="speed"
                value={(p.speed ?? 0.5) as number}
                min={0} max={4} step={0.05} fixed={2}
                onChange={v => set('speed', v)}
            />
            <SliderField
                label="scale"
                value={(p.scale ?? 4) as number}
                min={0.5} max={32} step={0.5} fixed={1}
                onChange={v => set('scale', v)}
            />
            <SliderField
                label="amp"
                value={(p.amp ?? 0.08) as number}
                min={0} max={0.5} step={0.005} fixed={3}
                onChange={v => set('amp', v)}
            />
            {mode === 'chess' && (
                <SliderField
                    label="cells"
                    value={(p.cells ?? 12) as number}
                    min={2} max={64} step={1} fixed={0}
                    onChange={v => set('cells', Math.max(2, Math.round(v)))}
                />
            )}
            {mode === 'stripes' && (
                <SliderField
                    label="stripes"
                    value={(p.stripes ?? 24) as number}
                    min={2} max={128} step={1} fixed={0}
                    onChange={v => set('stripes', Math.max(2, Math.round(v)))}
                />
            )}
        </>
    )
})
