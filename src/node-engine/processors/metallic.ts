/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

function metallicFrag(radius: number): string {
    return `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uScale;
uniform float uHighlightBias;
uniform sampler2D srcTexture;

#define RADIUS ${radius}

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 texel = 1.0 / uResolution;
    vec3 center = texture(srcTexture, vUV).rgb;
    float centerLum = luminance(center);

    float maxC = max(center.r, max(center.g, center.b));
    float minC = min(center.r, min(center.g, center.b));
    float centerSat = (maxC > 0.001) ? (maxC - minC) / maxC : 0.0;

    vec3 sumColor = vec3(0.0);
    float sumLum = 0.0;
    float n = 0.0;

    for (int y = -RADIUS; y <= RADIUS; y++) {
        for (int x = -RADIUS; x <= RADIUS; x++) {
            vec2 uv = vUV + vec2(float(x), float(y)) * texel;
            vec3 s = texture(srcTexture, uv).rgb;
            sumColor += s;
            sumLum += luminance(s);
            n += 1.0;
        }
    }

    vec3 meanColor = sumColor / n;
    float meanLum = sumLum / n;

    // specular highlight strength: how much brighter is this pixel vs neighborhood
    float highlight = clamp((centerLum - meanLum) / max(meanLum, 0.01), 0.0, 1.0);

    // metals tint their reflections → highlight hue ≈ base hue
    // dielectrics have white (desaturated) highlights
    // if bright pixel retains saturation → metallic
    float highlightSatRetention = highlight * centerSat;

    // fresnel-like reflectivity: high luminance + low saturation → dielectric specular
    // high luminance + high saturation → metallic specular
    float dielectricSpecular = highlight * (1.0 - centerSat);

    // local contrast (sharp reflections = reflective surface)
    float contrast = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec2 uv = vUV + vec2(float(x), float(y)) * texel;
            float l = luminance(texture(srcTexture, uv).rgb);
            contrast += abs(centerLum - l);
        }
    }
    contrast /= 8.0;

    float metallic = (highlightSatRetention * 2.0 + contrast * 0.5 - dielectricSpecular * uHighlightBias) * uScale;
    metallic = clamp(metallic, 0.0, 1.0);

    fragColor = vec4(vec3(metallic), 1.0);
}
`
}

export const metallicDef: ProcessorDef = {
    type: 'metallic',
    title: 'Metallic',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { radius: 4, scale: 3.0, highlight_bias: 0.5, width: 0, height: 0 },
}

export class MetallicProcessor extends BaseProcessor {
    readonly def = metallicDef

    private lastRadius = -1
    private cachedFrag = ''

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const src = inputs.texture
        if (!src) return { texture: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const radius = Math.max(1, Math.round(this.val(inputs, params, 'radius', 4)))
        const scale = this.val(inputs, params, 'scale', 3.0)
        const highlightBias = this.val(inputs, params, 'highlight_bias', 0.5)

        if (radius !== this.lastRadius) {
            this.cachedFrag = metallicFrag(radius)
            this.lastRadius = radius
        }

        const rt = this.ensureRT(w, h)

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uScale: { value: scale, type: 'f32' },
            uHighlightBias: { value: highlightBias, type: 'f32' },
        } as any, { isStatic: false })

        engine.renderPassInto(rt, this.cachedFrag, {
            uniforms,
            srcTexture: src,
        })

        return { texture: rt.source }
    }
}
