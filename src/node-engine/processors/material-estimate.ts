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
        this.albedoSrc = await b64ToTextureSource(json.albedo)
        this.roughnessSrc = await b64ToTextureSource(json.roughness)
        this.metallicSrc = await b64ToTextureSource(json.metallic)
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
}
