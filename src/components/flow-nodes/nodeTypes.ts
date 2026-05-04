import { NumberNodeView } from './views/NumberNodeView'
import { ConstantSignalNodeView } from './views/ConstantSignalNodeView'
import { ImageNodeView } from './views/ImageNodeView'
import { SdfFromContourNodeView } from './views/SdfFromContourNodeView'
import { BlurNodeView } from './views/BlurNodeView'
import { RemapNodeView } from './views/RemapNodeView'
import { EffectNodeView } from './views/EffectNodeView'
import { PreviewNodeView } from './views/PreviewNodeView'
import { SegmentationNodeView } from './views/SegmentationNodeView'
import { DenoiseNodeView } from './views/DenoiseNodeView'
import { BlendNodeView } from './views/BlendNodeView'
import { ConfigNodeView } from './views/ConfigNodeView'
import { ContourResampleNodeView } from './views/ContourResampleNodeView'
import { ContourPreviewNodeView } from './views/ContourPreviewNodeView'
import { TextNodeView } from './views/TextNodeView'
import { TextStyleNodeView } from './views/TextStyleNodeView'
import { TextStripNodeView } from './views/TextStripNodeView'
import { EventEmitterNodeView } from './views/EventEmitterNodeView'
import { EnvelopeNodeView } from './views/EnvelopeNodeView'
import { TimerNodeView } from './views/TimerNodeView'
import { InterpolatorNodeView } from './views/InterpolatorNodeView'
import { CombineSignalsNodeView } from './views/CombineSignalsNodeView'
import { SignalSwitchNodeView } from './views/SignalSwitchNodeView'
import { AnimationControllerNodeView } from './views/AnimationControllerNodeView'
import { AnimationSwitchNodeView } from './views/AnimationSwitchNodeView'
import { NoiseVisualizerNodeView } from './views/NoiseVisualizerNodeView'
import { LogNodeView } from './views/LogNodeView'

export const pipelineNodeTypes = {
    number: NumberNodeView,
    constantSignal: ConstantSignalNodeView,
    image: ImageNodeView,
    sdfFromContour: SdfFromContourNodeView,
    blur: BlurNodeView,
    remap: RemapNodeView,
    effect: EffectNodeView,
    preview: PreviewNodeView,
    segmentation: SegmentationNodeView,
    denoise: DenoiseNodeView,
    blend: BlendNodeView,
    config: ConfigNodeView,
    contourResample: ContourResampleNodeView,
    contourPreview: ContourPreviewNodeView,
    text: TextNodeView,
    textStyle: TextStyleNodeView,
    textStrip: TextStripNodeView,
    eventEmitter: EventEmitterNodeView,
    envelope: EnvelopeNodeView,
    timer: TimerNodeView,
    interpolator: InterpolatorNodeView,
    combineSignals: CombineSignalsNodeView,
    signalSwitch: SignalSwitchNodeView,
    animationController: AnimationControllerNodeView,
    animationSwitch: AnimationSwitchNodeView,
    noiseVisualizer: NoiseVisualizerNodeView,
    log: LogNodeView,
}
