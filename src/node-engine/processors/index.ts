import type { ProcessorDef } from '../types'
import type { BaseProcessor } from './base-processor'

import { NumberProcessor, numberDef } from './number'
import { ImageProcessor, imageDef } from './image'
import { PolygonProcessor, polygonDef } from './polygon'
import { SdfFromContourProcessor, sdfFromContourDef } from './sdf-from-contour'
import { BlurProcessor, blurDef } from './blur'
import { RemapProcessor, remapDef } from './remap'
import { DepthEstimateProcessor, depthEstimateDef } from './depth-estimate'
import { DepthBlitProcessor, depthBlitDef } from './depth-blit'
import { MaterialEstimateProcessor, materialEstimateDef } from './material-estimate'
import { MarigoldDepthProcessor, marigoldDepthDef } from './marigold-depth'
import { MarigoldNormalsProcessor, marigoldNormalsDef } from './marigold-normals'
import { EffectProcessor, effectDef } from './effect'
import { PreviewProcessor, previewDef } from './preview'
import { SegmentationProcessor, segmentationDef } from './segmentation'
import { DenoiseProcessor, denoiseDef } from './denoise'
import { BlendProcessor, blendDef } from './blend'
import { ConfigProcessor, configDef } from './config'
import { SdfTextAtlasProcessor, sdfTextAtlasDef } from './sdf-text-atlas'
import { ContourResampleProcessor, contourResampleDef } from './contour-resample'
import { ContourPreviewProcessor, contourPreviewDef } from './contour-preview'
import { TextStripProcessor, textStripDef } from './text-strip'
import { TapProcessor, tapDef } from './tap'
import { EnvelopeProcessor, envelopeDef } from './envelope'
import { AutoTimerProcessor, autoTimerDef } from './auto-timer'
import { CombineSignalsProcessor, combineSignalsDef } from './combine-signals'
import {
    RibbonAnimControllerProcessor, ribbonAnimControllerDef,
    ParticlesAnimControllerProcessor, particlesAnimControllerDef,
    FullscreenAnimControllerProcessor, fullscreenAnimControllerDef,
} from './animation-controller'

export interface ProcessorEntry {
    def: ProcessorDef
    create: () => BaseProcessor
}

export const PROCESSOR_CATALOG: Record<string, ProcessorEntry> = {
    number:       { def: numberDef,       create: () => new NumberProcessor() },
    image:        { def: imageDef,        create: () => new ImageProcessor() },
    polygon:      { def: polygonDef,      create: () => new PolygonProcessor() },
    sdfFromContour:{ def: sdfFromContourDef,create: () => new SdfFromContourProcessor() },
    blur:         { def: blurDef,         create: () => new BlurProcessor() },
    remap:        { def: remapDef,        create: () => new RemapProcessor() },
    depthEstimate:{ def: depthEstimateDef,create: () => new DepthEstimateProcessor() },
    depthBlit:    { def: depthBlitDef,    create: () => new DepthBlitProcessor() },
    materialEstimate: { def: materialEstimateDef, create: () => new MaterialEstimateProcessor() },
    marigoldDepth: { def: marigoldDepthDef, create: () => new MarigoldDepthProcessor() },
    marigoldNormals: { def: marigoldNormalsDef, create: () => new MarigoldNormalsProcessor() },
    effect:       { def: effectDef,       create: () => new EffectProcessor() },
    preview:      { def: previewDef,      create: () => new PreviewProcessor() },
    segmentation: { def: segmentationDef, create: () => new SegmentationProcessor() },
    denoise:      { def: denoiseDef,      create: () => new DenoiseProcessor() },
    blend:        { def: blendDef,        create: () => new BlendProcessor() },
    config:       { def: configDef,       create: () => new ConfigProcessor() },
    sdfTextAtlas: { def: sdfTextAtlasDef, create: () => new SdfTextAtlasProcessor() },
    contourResample: { def: contourResampleDef, create: () => new ContourResampleProcessor() },
    contourPreview:  { def: contourPreviewDef,  create: () => new ContourPreviewProcessor() },
    textStrip:       { def: textStripDef,       create: () => new TextStripProcessor() },
    tap:             { def: tapDef,             create: () => new TapProcessor() },
    envelope:        { def: envelopeDef,        create: () => new EnvelopeProcessor() },
    autoTimer:       { def: autoTimerDef,       create: () => new AutoTimerProcessor() },
    combineSignals:  { def: combineSignalsDef,  create: () => new CombineSignalsProcessor() },
    ribbonAnimController:     { def: ribbonAnimControllerDef,     create: () => new RibbonAnimControllerProcessor() },
    particlesAnimController:  { def: particlesAnimControllerDef,  create: () => new ParticlesAnimControllerProcessor() },
    fullscreenAnimController: { def: fullscreenAnimControllerDef, create: () => new FullscreenAnimControllerProcessor() },
}
