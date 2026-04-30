/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextureSource } from 'pixi.js'
import { MarigoldProcessor, b64ToTextureSource } from './marigold-common'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const materialEstimateDef: ProcessorDef = {
    type: 'materialEstimate',
    title: 'Marigold Materials',
    category: 'ai',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [
        { name: 'albedo', type: SLOT.TEXTURE },
        { name: 'roughness', type: SLOT.TEXTURE },
        { name: 'metallic', type: SLOT.TEXTURE },
    ],
    defaultParams: {},
    hidden: true,
}

export class MaterialEstimateProcessor extends MarigoldProcessor {
    readonly def = materialEstimateDef
    protected endpoint = '/api/marigold/intrinsics'

    private albedoSrc: TextureSource | null = null
    private roughnessSrc: TextureSource | null = null
    private metallicSrc: TextureSource | null = null

    protected async handleResult(json: any): Promise<void> {
        /* Decode all three first, THEN swap and dispose the previous
           generation atomically — failing halfway through (e.g. one of
           the b64 strings is malformed) shouldn't leave the node with a
           mismatched mix of new + old maps. */
        const nextAlbedo = await b64ToTextureSource(json.albedo)
        const nextRoughness = await b64ToTextureSource(json.roughness)
        const nextMetallic = await b64ToTextureSource(json.metallic)
        this.albedoSrc?.destroy()
        this.roughnessSrc?.destroy()
        this.metallicSrc?.destroy()
        this.albedoSrc = nextAlbedo
        this.roughnessSrc = nextRoughness
        this.metallicSrc = nextMetallic
        this.statusText = `Material maps ${this.albedoSrc.width}x${this.albedoSrc.height}`
    }

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.triggerFromInput(inputs, engine)
        return {
            albedo: this.albedoSrc,
            roughness: this.roughnessSrc,
            metallic: this.metallicSrc,
        }
    }

    destroy(): void {
        super.destroy()
        this.albedoSrc?.destroy()
        this.roughnessSrc?.destroy()
        this.metallicSrc?.destroy()
        this.albedoSrc = null
        this.roughnessSrc = null
        this.metallicSrc = null
    }
}
