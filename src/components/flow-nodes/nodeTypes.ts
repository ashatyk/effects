import { NumberNodeView } from './views/NumberNodeView'
import { ImageNodeView } from './views/ImageNodeView'
import { PolygonNodeView } from './views/PolygonNodeView'
import { SdfFromContourNodeView } from './views/SdfFromContourNodeView'
import { BlurNodeView } from './views/BlurNodeView'
import { RemapNodeView } from './views/RemapNodeView'
import { EffectNodeView } from './views/EffectNodeView'
import { PreviewNodeView } from './views/PreviewNodeView'
import { SegmentationNodeView } from './views/SegmentationNodeView'
import { DenoiseNodeView } from './views/DenoiseNodeView'
import { BlendNodeView } from './views/BlendNodeView'
import { ConfigNodeView } from './views/ConfigNodeView'
import { SdfTextAtlasNodeView } from './views/SdfTextAtlasNodeView'
import { ContourResampleNodeView } from './views/ContourResampleNodeView'
import { ContourPreviewNodeView } from './views/ContourPreviewNodeView'
import { TextStripNodeView } from './views/TextStripNodeView'
import { TapNodeView } from './views/TapNodeView'
import { EnvelopeNodeView } from './views/EnvelopeNodeView'
import { AutoTimerNodeView } from './views/AutoTimerNodeView'
import { CombineSignalsNodeView } from './views/CombineSignalsNodeView'
import { AnimationControllerNodeView } from './views/AnimationControllerNodeView'
import { NoiseVisualizerNodeView } from './views/NoiseVisualizerNodeView'
import { LogNodeView } from './views/LogNodeView'

export const pipelineNodeTypes = {
    number: NumberNodeView,
    image: ImageNodeView,
    polygon: PolygonNodeView,
    sdfFromContour: SdfFromContourNodeView,
    blur: BlurNodeView,
    remap: RemapNodeView,
    effect: EffectNodeView,
    preview: PreviewNodeView,
    segmentation: SegmentationNodeView,
    denoise: DenoiseNodeView,
    blend: BlendNodeView,
    config: ConfigNodeView,
    sdfTextAtlas: SdfTextAtlasNodeView,
    contourResample: ContourResampleNodeView,
    contourPreview: ContourPreviewNodeView,
    textStrip: TextStripNodeView,
    tap: TapNodeView,
    envelope: EnvelopeNodeView,
    autoTimer: AutoTimerNodeView,
    combineSignals: CombineSignalsNodeView,
    animationController: AnimationControllerNodeView,
    noiseVisualizer: NoiseVisualizerNodeView,
    log: LogNodeView,
}
