/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

export const contourPreviewDef: ProcessorDef = {
    type: 'contourPreview',
    title: 'Contour Preview',
    category: 'output',
    inputs: [{ name: 'contour', type: SLOT.CONTOUR }],
    outputs: [],
    defaultParams: {},
}

export class ContourPreviewProcessor extends BaseProcessor {
    readonly def = contourPreviewDef

    contour: ContourSamples | null = null

    execute(inputs: Record<string, any>): Record<string, any> {
        this.contour = (inputs.contour as ContourSamples | null) ?? null
        return {}
    }
}
