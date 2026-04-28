/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextureSource } from 'pixi.js'
import { MarigoldProcessor, b64ToTextureSource } from './marigold-common'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const marigoldDepthDef: ProcessorDef = {
    type: 'marigoldDepth',
    title: 'Marigold Depth',
    category: 'ai',
    inputs: [{ name: 'image', type: SLOT.TEXTURE }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {},
    hidden: true,
}

export class MarigoldDepthProcessor extends MarigoldProcessor {
    readonly def = marigoldDepthDef
    protected endpoint = '/api/marigold/depth'

    private depthSrc: TextureSource | null = null

    protected async handleResult(json: any): Promise<void> {
        this.depthSrc = await b64ToTextureSource(json.depth)
        this.statusText = `Depth ${this.depthSrc.width}x${this.depthSrc.height}`
    }

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        this.triggerFromInput(inputs, engine)
        return { texture: this.depthSrc }
    }
}
