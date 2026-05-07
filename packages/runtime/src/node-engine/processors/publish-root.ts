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
        /* Free-form display name for the published effect. Surfaced in
           the supplier app and in the toolbar Publish button download
           filename. */
        name: 'Untitled',
        /* Author-bumped semver-ish version string. Distinct from
           `manifestVersion` which describes the SCHEMA shape. */
        version: 'v1',
        /* Stable slug — primary key of the published pipeline. The
           supplier app and Tier-3 runtime key on this; renaming `name`
           must NOT break existing consumers, so the id is its own
           field. Default empty so the publish validator catches the
           missing-id case. */
        effectId: '',
    },
}

/**
 * Tier-2 publish entry point. The supplier app and Tier-3 runtime
 * traverse the scene back from this node — `derivePublishedSurface`
 * BFSes over `resolveSceneForEngine` reverse adjacency starting here
 * and folds every reached node into the supplier-facing surface.
 *
 * As a runtime processor it's a pure pass-through (`texture` in →
 * `texture` out) so it can be chained into a Preview for live editor
 * confirmation of "what the supplier will see". The processor itself
 * has no GPU work — the upstream Effect node already produced the
 * final composited frame; this is just the marked tap point.
 *
 * Not `alwaysDirty` — we ride the upstream Effect's dirty propagation,
 * which IS alwaysDirty. When nothing animates, this node sleeps too.
 */
export class PublishRootProcessor extends BaseProcessor {
    readonly def = publishRootDef

    execute(inputs: Record<string, any>, _params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        return { texture: inputs.texture ?? null }
    }
}
