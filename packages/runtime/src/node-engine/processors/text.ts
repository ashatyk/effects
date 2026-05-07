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

/**
 * Plain string source. Lets the user wire one piece of copy into multiple
 * downstream consumers (e.g. several Text Strip nodes producing different
 * stylings of the same phrase). Outputs an empty string when the param
 * is cleared — downstream nodes are responsible for treating that as
 * "nothing to render".
 */
export class TextProcessor extends BaseProcessor {
    readonly def = textDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        return { text: String(params.value ?? '') }
    }
}
