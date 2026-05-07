import type { ComponentType } from 'react'
import type { NodeSettingsProps } from './settings/types'

import { NumberNodeSettings } from './settings/NumberNodeSettings'
import { ConstantSignalNodeSettings } from './settings/ConstantSignalNodeSettings'
import { ImageNodeSettings } from './settings/ImageNodeSettings'
import { TextNodeSettings } from './settings/TextNodeSettings'
import { TextStyleNodeSettings } from './settings/TextStyleNodeSettings'
import { BlurNodeSettings } from './settings/BlurNodeSettings'
import { BlendNodeSettings } from './settings/BlendNodeSettings'
import { RemapNodeSettings } from './settings/RemapNodeSettings'
import { DenoiseNodeSettings } from './settings/DenoiseNodeSettings'
import { ContourResampleNodeSettings } from './settings/ContourResampleNodeSettings'
import { ContourPivotNodeSettings } from './settings/ContourPivotNodeSettings'
import { TimerNodeSettings } from './settings/TimerNodeSettings'
import { InterpolatorNodeSettings } from './settings/InterpolatorNodeSettings'
import { EnvelopeNodeSettings } from './settings/EnvelopeNodeSettings'
import { CombineSignalsNodeSettings } from './settings/CombineSignalsNodeSettings'
import { SignalSwitchNodeSettings } from './settings/SignalSwitchNodeSettings'
import { AnimationSwitchNodeSettings } from './settings/AnimationSwitchNodeSettings'
import { AnimationControllerNodeSettings } from './settings/AnimationControllerNodeSettings'
import { ConfigNodeSettings } from './settings/ConfigNodeSettings'
import { EventEmitterNodeSettings } from './settings/EventEmitterNodeSettings'
import { TapZoneNodeSettings } from './settings/TapZoneNodeSettings'
import { PublishRootNodeSettings } from './settings/PublishRootNodeSettings'
import { NoiseVisualizerNodeSettings } from './settings/NoiseVisualizerNodeSettings'
import { LogNodeSettings } from './settings/LogNodeSettings'
import { SegmentationNodeSettings } from './settings/SegmentationNodeSettings'

/**
 * Per-processor Settings panes. Parallel registry to `pipelineNodeTypes`
 * but for the right-rail Settings panel + Pinned terminal — every entry
 * here is a fully-independent component that owns its own layout, has
 * NO React Flow chrome (handles, resizer, BaseNodeShell), and renders
 * the *settings-specific* visual representation of the node.
 *
 * Authors are free to:
 *   - render only controls (most simple cases),
 *   - mix in live readouts / canvases tailored for the panel,
 *   - lay things out with custom grids / sections / typography.
 *
 * The corresponding `pipelineNodeTypes[type]` entry remains the
 * *graph-canvas* representation — visual elements + connection points
 * only. The two registries decouple so the same processor can have a
 * dense, label-rich Settings pane while staying minimal on the
 * canvas.
 *
 * Processor types absent from this map (e.g. `effect`, `clone`,
 * `contourPreview`, `textStrip`, `sdfFromContour`, `preview`) have no
 * editable controls — they're either pure visualisers, alias-only, or
 * carry only export-style **actions** (registered in
 * `pipelineNodeActions`). The Settings panel falls back to the
 * empty-state hint when both registries miss the processor; if only
 * actions are registered, the `Parameters` section is skipped
 * entirely and the `Actions` section stands alone.
 */
export const pipelineNodeSettings: Record<string, ComponentType<NodeSettingsProps>> = {
    number: NumberNodeSettings,
    constantSignal: ConstantSignalNodeSettings,
    image: ImageNodeSettings,
    text: TextNodeSettings,
    textStyle: TextStyleNodeSettings,
    blur: BlurNodeSettings,
    blend: BlendNodeSettings,
    remap: RemapNodeSettings,
    denoise: DenoiseNodeSettings,
    contourResample: ContourResampleNodeSettings,
    contourPivot: ContourPivotNodeSettings,
    timer: TimerNodeSettings,
    interpolator: InterpolatorNodeSettings,
    envelope: EnvelopeNodeSettings,
    combineSignals: CombineSignalsNodeSettings,
    signalSwitch: SignalSwitchNodeSettings,
    animationSwitch: AnimationSwitchNodeSettings,
    animationController: AnimationControllerNodeSettings,
    config: ConfigNodeSettings,
    eventEmitter: EventEmitterNodeSettings,
    tapZone: TapZoneNodeSettings,
    publishRoot: PublishRootNodeSettings,
    noiseVisualizer: NoiseVisualizerNodeSettings,
    log: LogNodeSettings,
    segmentation: SegmentationNodeSettings,
}
