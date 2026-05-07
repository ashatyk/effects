import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { SelectField, SliderField } from '@effects/ui'
import {
    noiseVisualizerDef,
    NOISE_MODES,
    type NoiseMode,
} from '@effects/runtime/node-engine/processors/noise-visualizer'
import type { PipelineNodeData } from '../types'

/**
 * Outputs a TEXTURE; live preview happens by wiring it to a Preview
 * node — same convention as every other texture-producing processor.
 *
 * The `cells` and `stripes` sliders are mode-scoped so the panel only
 * shows the parameter that actually affects the current surface.
 */
export const NoiseVisualizerNodeView = memo(function NoiseVisualizerNodeView(
    { id, data }: NodeProps & { data: PipelineNodeData },
) {
    const set = useSetParam(id)
    const p = data.params
    const mode = (p.mode ?? 'chess') as NoiseMode

    return (
        <BaseNodeShell
            title={noiseVisualizerDef.title}
            category={noiseVisualizerDef.category}
            inputs={noiseVisualizerDef.inputs}
            outputs={noiseVisualizerDef.outputs}
            minWidth={240}
        >
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
        </BaseNodeShell>
    )
})
