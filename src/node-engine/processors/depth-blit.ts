/* eslint-disable @typescript-eslint/no-explicit-any */
import { BufferImageSource, Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type DepthRawData } from '../types'

const DEPTH_BLIT_FRAG = `
#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D depthRawTex;
void main(){
    float d = texture(depthRawTex, vUV).r;
    fragColor = vec4(d, d, d, 1.0);
}
`

export const depthBlitDef: ProcessorDef = {
    type: 'depthBlit',
    title: 'Depth Blit',
    category: 'depth',
    inputs: [
        { name: 'depth_raw', type: SLOT.DEPTH_RAW },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { width: 0, height: 0 },
}

export class DepthBlitProcessor extends BaseProcessor {
    readonly def = depthBlitDef

    private _uploadSrc: BufferImageSource | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const raw = inputs.depth_raw as DepthRawData | null
        if (!raw) return { texture: null }

        const [w, h] = this.resolveRes(inputs, params, engine)

        if (!this._uploadSrc || this._uploadSrc.width !== raw.width || this._uploadSrc.height !== raw.height) {
            this._uploadSrc = new BufferImageSource({
                resource: raw.data,
                width: raw.width,
                height: raw.height,
                format: 'r8unorm',
            })
        } else {
            this._uploadSrc.resource = raw.data
            this._uploadSrc.update()
        }

        const uploadTex = new Texture({ source: this._uploadSrc })
        const rt = this.ensureRT(w, h)
        engine.renderPassInto(rt, DEPTH_BLIT_FRAG, { depthRawTex: uploadTex.source })
        return { texture: rt.source }
    }
}
