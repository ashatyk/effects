import type { ProcessorDef } from '../types'
import type { BaseProcessor } from './base-processor'

import { NumberProcessor, numberDef } from './number'
import { ConstantSignalProcessor, constantSignalDef } from './constant-signal'
import { ImageProcessor, imageDef } from './image'
import { SdfFromContourProcessor, sdfFromContourDef } from './sdf-from-contour'
import { BlurProcessor, blurDef } from './blur'
import { RemapProcessor, remapDef } from './remap'
import { EffectProcessor, effectDef } from './effect'
import { PreviewProcessor, previewDef } from './preview'
import { SegmentationProcessor, segmentationDef } from './segmentation'
import { DenoiseProcessor, denoiseDef } from './denoise'
import { BlendProcessor, blendDef } from './blend'
import { ConfigProcessor, configDef } from './config'
import { ContourResampleProcessor, contourResampleDef } from './contour-resample'
import { ContourPreviewProcessor, contourPreviewDef } from './contour-preview'
import { TextProcessor, textDef } from './text'
import { TextStyleProcessor, textStyleDef } from './text-style'
import { TextStripProcessor, textStripDef } from './text-strip'
import { EventEmitterProcessor, eventEmitterDef } from './event-emitter'
import { EnvelopeProcessor, envelopeDef } from './envelope'
import { TimerProcessor, timerDef } from './timer'
import { InterpolatorProcessor, interpolatorDef } from './interpolator'
import { CombineSignalsProcessor, combineSignalsDef } from './combine-signals'
import { SignalSwitchProcessor, signalSwitchDef } from './signal-switch'
import { AnimationControllerProcessor, animationControllerDef } from './animation-controller'
import { AnimationSwitchProcessor, animationSwitchDef } from './animation-switch'
import { NoiseVisualizerProcessor, noiseVisualizerDef } from './noise-visualizer'
import { LogProcessor, logDef } from './log'

export interface ProcessorEntry {
    def: ProcessorDef
    create: () => BaseProcessor
}

export const PROCESSOR_CATALOG: Record<string, ProcessorEntry> = {
    number:         { def: numberDef,         create: () => new NumberProcessor() },
    constantSignal: { def: constantSignalDef, create: () => new ConstantSignalProcessor() },
    image:        { def: imageDef,        create: () => new ImageProcessor() },
    sdfFromContour:{ def: sdfFromContourDef,create: () => new SdfFromContourProcessor() },
    blur:         { def: blurDef,         create: () => new BlurProcessor() },
    remap:        { def: remapDef,        create: () => new RemapProcessor() },
    effect:       { def: effectDef,       create: () => new EffectProcessor() },
    preview:      { def: previewDef,      create: () => new PreviewProcessor() },
    segmentation: { def: segmentationDef, create: () => new SegmentationProcessor() },
    denoise:      { def: denoiseDef,      create: () => new DenoiseProcessor() },
    blend:        { def: blendDef,        create: () => new BlendProcessor() },
    config:       { def: configDef,       create: () => new ConfigProcessor() },
    contourResample: { def: contourResampleDef, create: () => new ContourResampleProcessor() },
    contourPreview:  { def: contourPreviewDef,  create: () => new ContourPreviewProcessor() },
    text:            { def: textDef,            create: () => new TextProcessor() },
    textStyle:       { def: textStyleDef,       create: () => new TextStyleProcessor() },
    textStrip:       { def: textStripDef,       create: () => new TextStripProcessor() },
    eventEmitter:    { def: eventEmitterDef,    create: () => new EventEmitterProcessor() },
    envelope:        { def: envelopeDef,        create: () => new EnvelopeProcessor() },
    timer:           { def: timerDef,           create: () => new TimerProcessor() },
    interpolator:    { def: interpolatorDef,    create: () => new InterpolatorProcessor() },
    combineSignals:  { def: combineSignalsDef,  create: () => new CombineSignalsProcessor() },
    signalSwitch:    { def: signalSwitchDef,    create: () => new SignalSwitchProcessor() },
    animationController: { def: animationControllerDef, create: () => new AnimationControllerProcessor() },
    animationSwitch:     { def: animationSwitchDef,     create: () => new AnimationSwitchProcessor() },
    noiseVisualizer: { def: noiseVisualizerDef, create: () => new NoiseVisualizerProcessor() },
    log:             { def: logDef,             create: () => new LogProcessor() },
}
