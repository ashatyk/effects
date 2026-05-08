/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const OPS = ['passthrough', 'grayscale', 'invert', 'contrast', 'unpack_sdf_24bit', 'channel_r', 'channel_g', 'channel_b', 'channel_a'] as const

function remapFrag(op: string): string {
    let body: string
    switch (op) {
        case 'grayscale':  body = 'float v = dot(c.rgb, vec3(0.299, 0.587, 0.114)); fragColor = vec4(v, v, v, c.a);'; break
        case 'invert':     body = 'fragColor = vec4(1.0 - c.rgb, c.a);'; break
        case 'contrast':   body = 'vec3 adj = (c.rgb - 0.5) * uStrength + 0.5; fragColor = vec4(clamp(adj, 0.0, 1.0), c.a);'; break
        case 'unpack_sdf_24bit': body = `/* sdf-pure.ts packs signed normalised distance into 24 bits as
       biased = signed_d * 0.5 + 0.5; 0.5 = silhouette boundary. */
    float n = (c.r*255.0)*65536.0 + (c.g*255.0)*256.0 + (c.b*255.0);
    float v = n / 16777215.0; fragColor = vec4(v, v, v, 1.0);`; break
        case 'channel_r':  body = 'fragColor = vec4(c.r, c.r, c.r, 1.0);'; break
        case 'channel_g':  body = 'fragColor = vec4(c.g, c.g, c.g, 1.0);'; break
        case 'channel_b':  body = 'fragColor = vec4(c.b, c.b, c.b, 1.0);'; break
        case 'channel_a':  body = 'fragColor = vec4(c.a, c.a, c.a, 1.0);'; break
        default:           body = 'fragColor = c;'
    }
    return `
#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D inputTex;
uniform float uStrength;
void main(){
    vec4 c = texture(inputTex, vUV);
    ${body}
}
`
}

export const remapDef: ProcessorDef = {
    pure: true,
    type: 'remap',
    title: 'Remap',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
        { name: 'strength', type: SLOT.NUMBER },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { op: 'passthrough', strength: 2.0, width: 0, height: 0 },
}

export { OPS as REMAP_OPS }

export class RemapProcessor extends BaseProcessor {
    readonly def = remapDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) return { texture: null }

        const op = (params.op ?? 'passthrough') as string
        const strength = this.val(inputs, params, 'strength', 2.0)
        const [w, h] = this.resolveRes(inputs, params, engine)
        const rt = this.ensureRT(w, h)
        const uniforms = new UniformGroup({ uStrength: { value: strength, type: 'f32' } } as any, { isStatic: true })

        engine.renderPassInto(rt, remapFrag(op), { uniforms, inputTex: src })
        return { texture: rt.source }
    }
}
