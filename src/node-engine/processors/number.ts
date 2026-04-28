/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef } from '../types'

export const numberDef: ProcessorDef = {
    type: 'number',
    title: 'Number',
    category: 'input',
    inputs: [],
    outputs: [{ name: 'value', type: SLOT.NUMBER }],
    defaultParams: { value: 0 },
}

export class NumberProcessor extends BaseProcessor {
    readonly def = numberDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        return { value: params.value ?? 0 }
    }
}
