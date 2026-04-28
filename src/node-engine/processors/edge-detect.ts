/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const EDGE_FRAG = `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uThreshold;
uniform float uStrength;
uniform sampler2D srcTexture;

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 t = 1.0 / uResolution;

    float tl = luminance(texture(srcTexture, vUV + vec2(-t.x,  t.y)).rgb);
    float tc = luminance(texture(srcTexture, vUV + vec2( 0.0,  t.y)).rgb);
    float tr = luminance(texture(srcTexture, vUV + vec2( t.x,  t.y)).rgb);
    float ml = luminance(texture(srcTexture, vUV + vec2(-t.x,  0.0)).rgb);
    float mr = luminance(texture(srcTexture, vUV + vec2( t.x,  0.0)).rgb);
    float bl = luminance(texture(srcTexture, vUV + vec2(-t.x, -t.y)).rgb);
    float bc = luminance(texture(srcTexture, vUV + vec2( 0.0, -t.y)).rgb);
    float br = luminance(texture(srcTexture, vUV + vec2( t.x, -t.y)).rgb);

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

    float edge = sqrt(gx*gx + gy*gy) * uStrength;
    edge = smoothstep(uThreshold, uThreshold + 0.05, edge);

    fragColor = vec4(vec3(edge), 1.0);
}
`

export const edgeDetectDef: ProcessorDef = {
    type: 'edgeDetect',
    title: 'Edge Detect',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { threshold: 0.05, strength: 1.5, width: 0, height: 0 },
    hidden: true,
}

export class EdgeDetectProcessor extends BaseProcessor {
    readonly def = edgeDetectDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) return { texture: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const threshold = this.val(inputs, params, 'threshold', 0.05)
        const strength = this.val(inputs, params, 'strength', 1.5)
        const rt = this.ensureRT(w, h)

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uThreshold: { value: threshold, type: 'f32' },
            uStrength: { value: strength, type: 'f32' },
        } as any, { isStatic: false })

        engine.renderPassInto(rt, EDGE_FRAG, {
            uniforms,
            srcTexture: src,
        })

        return { texture: rt.source }
    }
}
