import { NumberNodeView } from './NumberNodeView'
import { ImageNodeView } from './ImageNodeView'
import { PolygonNodeView } from './PolygonNodeView'
import { SDFNodeView } from './SDFNodeView'
import { SdfFromContourNodeView } from './SdfFromContourNodeView'
import { BlurNodeView } from './BlurNodeView'
import { RemapNodeView } from './RemapNodeView'
import { DepthEstimateNodeView } from './DepthEstimateNodeView'
import { DepthBlitNodeView } from './DepthBlitNodeView'
import { DepthProjectNodeView } from './DepthProjectNodeView'
import { MaterialEstimateNodeView } from './MaterialEstimateNodeView'
import { MarigoldDepthNodeView } from './MarigoldDepthNodeView'
import { MarigoldNormalsNodeView } from './MarigoldNormalsNodeView'
import { EffectNodeView } from './EffectNodeView'
import { PreviewNodeView } from './PreviewNodeView'
import { SegmentationNodeView } from './SegmentationNodeView'
import { EdgeDetectNodeView } from './EdgeDetectNodeView'
import { DenoiseNodeView } from './DenoiseNodeView'
import { BlendNodeView } from './BlendNodeView'
import { ConfigNodeView } from './ConfigNodeView'
import { TextRemovalMaskNodeView } from './TextRemovalMaskNodeView'
import { QwenImageEditNodeView } from './QwenImageEditNodeView'
import { RerouteNodeView } from './RerouteNodeView'
import { SdfTextAtlasNodeView } from './SdfTextAtlasNodeView'
import { ContourResampleNodeView } from './ContourResampleNodeView'
import { ContourPreviewNodeView } from './ContourPreviewNodeView'
import { TextStripNodeView } from './TextStripNodeView'
import { TapNodeView } from './TapNodeView'
import { EnvelopeNodeView } from './EnvelopeNodeView'
import { AutoTimerNodeView } from './AutoTimerNodeView'
import { CombineSignalsNodeView } from './CombineSignalsNodeView'
import {
    RibbonAnimControllerNodeView,
    ParticlesAnimControllerNodeView,
    FullscreenAnimControllerNodeView,
} from './AnimationControllerNodeView'

export const pipelineNodeTypes = {
    number: NumberNodeView,
    image: ImageNodeView,
    polygon: PolygonNodeView,
    sdf: SDFNodeView,
    sdfFromContour: SdfFromContourNodeView,
    blur: BlurNodeView,
    remap: RemapNodeView,
    depthEstimate: DepthEstimateNodeView,
    depthBlit: DepthBlitNodeView,
    depthProject: DepthProjectNodeView,
    materialEstimate: MaterialEstimateNodeView,
    marigoldDepth: MarigoldDepthNodeView,
    marigoldNormals: MarigoldNormalsNodeView,
    effect: EffectNodeView,
    preview: PreviewNodeView,
    segmentation: SegmentationNodeView,
    edgeDetect: EdgeDetectNodeView,
    denoise: DenoiseNodeView,
    blend: BlendNodeView,
    config: ConfigNodeView,
    textRemovalMask: TextRemovalMaskNodeView,
    qwenImageEdit: QwenImageEditNodeView,
    reroute: RerouteNodeView,
    sdfTextAtlas: SdfTextAtlasNodeView,
    contourResample: ContourResampleNodeView,
    contourPreview: ContourPreviewNodeView,
    textStrip: TextStripNodeView,
    tap: TapNodeView,
    envelope: EnvelopeNodeView,
    autoTimer: AutoTimerNodeView,
    combineSignals: CombineSignalsNodeView,
    ribbonAnimController: RibbonAnimControllerNodeView,
    particlesAnimController: ParticlesAnimControllerNodeView,
    fullscreenAnimController: FullscreenAnimControllerNodeView,
}
