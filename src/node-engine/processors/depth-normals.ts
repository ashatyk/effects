/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const NORMALS_FRAG = `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uStrength;
uniform sampler2D depthTexture;

void main() {
    vec2 texel = 1.0 / uResolution;

    float dL = texture(depthTexture, vUV - vec2(texel.x, 0.0)).r;
    float dR = texture(depthTexture, vUV + vec2(texel.x, 0.0)).r;
    float dU = texture(depthTexture, vUV - vec2(0.0, texel.y)).r;
    float dD = texture(depthTexture, vUV + vec2(0.0, texel.y)).r;

    vec3 normal = normalize(vec3(
        (dL - dR) * uStrength,
        (dU - dD) * uStrength,
        1.0
    ));

    fragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
`

export const depthNormalsDef: ProcessorDef = {
    type: 'depthNormals',
    title: 'Depth → Normals',
    category: 'depth',
    inputs: [
        { name: 'depth', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { strength: 2.0, width: 0, height: 0 },
}

export class DepthNormalsProcessor extends BaseProcessor {
    readonly def = depthNormalsDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const depthSrc = inputs.depth
        if (!depthSrc) return { texture: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const strength = this.val(inputs, params, 'strength', 2.0)
        const rt = this.ensureRT(w, h)

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uStrength: { value: strength, type: 'f32' },
        } as any, { isStatic: false })

        engine.renderPassInto(rt, NORMALS_FRAG, {
            uniforms,
            depthTexture: depthSrc,
        })

        return { texture: rt.source }
    }
}
