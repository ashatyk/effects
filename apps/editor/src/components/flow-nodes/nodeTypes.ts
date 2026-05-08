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
import { ContourPivotNodeView } from './views/ContourPivotNodeView'
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
import { CloneNodeView } from './views/CloneNodeView'
import { PublishRootNodeView } from './views/PublishRootNodeView'
import { TapZoneNodeView } from './views/TapZoneNodeView'
import { FrameNodeView } from './views/FrameNodeView'
import { ConstantTextureNodeView } from './views/ConstantTextureNodeView'
import { ConstantContourNodeView } from './views/ConstantContourNodeView'

export const pipelineNodeTypes = {
    // UI-only viewer alias (data.cloneOf = origin id); engine never sees clones.
    clone: CloneNodeView,
    // UI-only section rectangle; not a processor but lives in pages[].nodes[] for undo/import.
    frame: FrameNodeView,
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
    contourPivot: ContourPivotNodeView,
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
    publishRoot: PublishRootNodeView,
    tapZone: TapZoneNodeView,
    // Bake-target nodes — only instantiated by read-only BakedPreview, hidden from AddNodePopover via def.hidden.
    constantTexture: ConstantTextureNodeView,
    constantContour: ConstantContourNodeView,
}
