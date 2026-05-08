/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef } from '../types'

const DEFAULT_TEXT = 'Купи в комплекте'

export const textDef: ProcessorDef = {
    pure: true,
    type: 'text',
    title: 'Text',
    category: 'input',
    inputs: [],
    outputs: [{ name: 'text', type: SLOT.TEXT }],
    defaultParams: { value: DEFAULT_TEXT },
}

export class TextProcessor extends BaseProcessor {
    readonly def = textDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        return { text: String(params.value ?? '') }
    }
}
