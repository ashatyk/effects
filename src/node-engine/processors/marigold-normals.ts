/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextureSource } from 'pixi.js'
import { MarigoldProcessor, b64ToTextureSource } from './marigold-common'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const marigoldNormalsDef: ProcessorDef = {
    type: 'marigoldNormals',
    title: 'Marigold Normals',
    category: 'ai',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {},
    hidden: true,
}

export class MarigoldNormalsProcessor extends MarigoldProcessor {
    readonly def = marigoldNormalsDef
    protected endpoint = '/api/marigold/normals'

    private normalsSrc: TextureSource | null = null

    protected async handleResult(json: any): Promise<void> {
        this.normalsSrc = await b64ToTextureSource(json.normals)
        this.statusText = `Normals ${this.normalsSrc.width}x${this.normalsSrc.height}`
    }

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.triggerFromInput(inputs, engine)
        return { texture: this.normalsSrc }
    }
}
