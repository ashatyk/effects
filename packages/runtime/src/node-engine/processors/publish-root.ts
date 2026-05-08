/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const publishRootDef: ProcessorDef = {
    type: 'publishRoot',
    title: 'Publish Root',
    category: 'output',
    inputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {
        name: 'Untitled',
        // Author-bumped; distinct from manifestVersion (which describes the schema shape).
        version: 'v1',
        // Primary key for the published pipeline; supplier/Tier-3 key on this so
        // renaming `name` must not break consumers. Empty default = publish validator fails.
        effectId: '',
    },
}

// Tier-2 publish entry point: derivePublishedSurface BFSes back from here.
// Pass-through at runtime (no GPU work); not alwaysDirty so it sleeps with the
// upstream Effect when nothing animates.
export class PublishRootProcessor extends BaseProcessor {
    readonly def = publishRootDef

    execute(inputs: Record<string, any>, _params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        return { texture: inputs.texture ?? null }
    }
}
