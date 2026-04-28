/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

function roughnessFrag(radius: number): string {
    return `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uScale;
uniform float uThreshold;
uniform sampler2D srcTexture;

#define RADIUS ${radius}

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 texel = 1.0 / uResolution;

    float Jxx = 0.0, Jxy = 0.0, Jyy = 0.0;
    float wSum = 0.0;
    float sigma = float(RADIUS) * 0.5;
    float sig2inv = -0.5 / (sigma * sigma);

    for (int y = -RADIUS; y <= RADIUS; y++) {
        for (int x = -RADIUS; x <= RADIUS; x++) {
            float w = exp(float(x * x + y * y) * sig2inv);
            vec2 p = vUV + vec2(float(x), float(y)) * texel;

            float gx = luminance(texture(srcTexture, p + vec2(texel.x, 0.0)).rgb)
                      - luminance(texture(srcTexture, p - vec2(texel.x, 0.0)).rgb);
            float gy = luminance(texture(srcTexture, p + vec2(0.0, texel.y)).rgb)
                      - luminance(texture(srcTexture, p - vec2(0.0, texel.y)).rgb);

            Jxx += gx * gx * w;
            Jxy += gx * gy * w;
            Jyy += gy * gy * w;
            wSum += w;
        }
    }

    Jxx /= wSum;  Jxy /= wSum;  Jyy /= wSum;

    float T = Jxx + Jyy;
    float D = Jxx * Jyy - Jxy * Jxy;
    float disc = max(0.0, T * T * 0.25 - D);
    float sqrtDisc = sqrt(disc);
    float lambda1 = T * 0.5 + sqrtDisc;
    float lambda2 = max(0.0, T * 0.5 - sqrtDisc);

    /* isotropy [0..1]: 0 = edge/flat, 1 = texture (gradient in all directions) */
    float isotropy = lambda2 / (lambda1 + 0.00001);

    /* binary gate: does this area have any gradient energy at all? */
    float hasDetail = smoothstep(uThreshold * 0.5, uThreshold, T);

    float detail = clamp(isotropy * hasDetail * uScale, 0.0, 1.0);

    fragColor = vec4(vec3(detail), 1.0);
}
`
}

export const roughnessDef: ProcessorDef = {
    type: 'roughness',
    title: 'Texture Detail',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { radius: 6, scale: 2.0, threshold: 0.0005, width: 0, height: 0 },
}

export class RoughnessProcessor extends BaseProcessor {
    readonly def = roughnessDef

    private lastRadius = -1
    private cachedFrag = ''

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) return { texture: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const radius = Math.max(1, Math.round(this.val(inputs, params, 'radius', 6)))
        const scale = this.val(inputs, params, 'scale', 2.0)
        const threshold = this.val(inputs, params, 'threshold', 0.0005)

        if (radius !== this.lastRadius) {
            this.cachedFrag = roughnessFrag(radius)
            this.lastRadius = radius
        }

        const rt = this.ensureRT(w, h)

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uScale: { value: scale, type: 'f32' },
            uThreshold: { value: threshold, type: 'f32' },
        } as any, { isStatic: false })

        engine.renderPassInto(rt, this.cachedFrag, {
            uniforms,
            srcTexture: src,
        })

        return { texture: rt.source }
    }
}
