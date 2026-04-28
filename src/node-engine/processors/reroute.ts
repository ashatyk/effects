/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef } from '../types'

export const rerouteDef: ProcessorDef = {
    type: 'reroute',
    title: 'Reroute',
    category: 'util',
    inputs: [{ name: 'in', type: SLOT.ANY }],
    outputs: [{ name: 'out', type: SLOT.ANY }],
    defaultParams: {},
}

export class RerouteProcessor extends BaseProcessor {
    readonly def = rerouteDef

    execute(inputs: Record<string, any>): Record<string, any> {
        return { out: inputs.in ?? null }
    }
}
