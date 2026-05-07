/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

function bilateralFrag(radius: number): string {
    return `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uSpatialSigma;
uniform float uRangeSigma;
uniform sampler2D srcTexture;

#define RADIUS ${radius}

void main() {
    vec2 texel = 1.0 / uResolution;
    vec3 center = texture(srcTexture, vUV).rgb;

    float spatialFactor = -0.5 / (uSpatialSigma * uSpatialSigma);
    float rangeFactor   = -0.5 / (uRangeSigma * uRangeSigma);

    vec3 sum = vec3(0.0);
    float wSum = 0.0;

    for (int y = -RADIUS; y <= RADIUS; y++) {
        for (int x = -RADIUS; x <= RADIUS; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 sampleUV = vUV + offset * texel;
            vec3 sampleColor = texture(srcTexture, sampleUV).rgb;

            float dist2 = dot(offset, offset);
            vec3 diff = sampleColor - center;
            float colorDist2 = dot(diff, diff);

            float w = exp(dist2 * spatialFactor + colorDist2 * rangeFactor);
            sum += sampleColor * w;
            wSum += w;
        }
    }

    fragColor = vec4(sum / wSum, 1.0);
}
`
}

export const denoiseDef: ProcessorDef = {
    pure: true,
    type: 'denoise',
    title: 'Denoise',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { radius: 4, spatial_sigma: 3.0, range_sigma: 0.1, passes: 1, width: 0, height: 0 },
}

export class DenoiseProcessor extends BaseProcessor {
    readonly def = denoiseDef

    private lastRadius = -1
    private cachedFrag = ''

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) return { texture: null }

        const radius = Math.max(1, Math.round(this.val(inputs, params, 'radius', 4)))
        const spatialSigma = this.val(inputs, params, 'spatial_sigma', 3.0)
        const rangeSigma = this.val(inputs, params, 'range_sigma', 0.1)
        const passes = Math.max(1, Math.round(this.val(inputs, params, 'passes', 1)))
        const [w, h] = this.resolveRes(inputs, params, engine)

        if (radius !== this.lastRadius) {
            this.cachedFrag = bilateralFrag(radius)
            this.lastRadius = radius
        }

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uSpatialSigma: { value: spatialSigma, type: 'f32' },
            uRangeSigma: { value: rangeSigma, type: 'f32' },
        } as any, { isStatic: false })

        const ping = this.ensurePing(w, h)
        const pong = this.ensurePong(w, h)

        let currentSrc = src
        for (let p = 0; p < passes; p++) {
            const target = (p % 2 === 0) ? ping : pong
            engine.renderPassInto(target, this.cachedFrag, { uniforms, srcTexture: currentSrc })
            currentSrc = target.source
        }

        this._outputRT = (passes % 2 === 1) ? ping : pong
        return { texture: currentSrc }
    }
}
