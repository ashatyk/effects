/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import sdfBlurH from '../../pipeline/passes/sdf-blur-h'
import sdfBlurV from '../../pipeline/passes/sdf-blur-v'

const MODES = ['box', 'gaussian', 'sdf-packed'] as const

function boxBlurFrag(inputName: string, direction: 'h' | 'v', radius: number): string {
    const dir = direction === 'h' ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)'
    return `
#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec2 uResolution;
uniform sampler2D ${inputName};
#define RADIUS ${radius}
void main(){
    vec2 texel = 1.0 / uResolution;
    vec2 dir = ${dir} * texel;
    vec4 sum = vec4(0.0);
    for(int i = -RADIUS; i <= RADIUS; i++){
        sum += texture(${inputName}, vUV + dir * float(i));
    }
    fragColor = sum / float(2 * RADIUS + 1);
}
`
}

function gaussianBlurFrag(inputName: string, direction: 'h' | 'v', radius: number, sigma: number): string {
    const dir = direction === 'h' ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)'
    return `
#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec2 uResolution;
uniform sampler2D ${inputName};
#define RADIUS ${radius}
#define SIGMA ${sigma.toFixed(1)}
void main(){
    vec2 texel = 1.0 / uResolution;
    vec2 dir = ${dir} * texel;
    vec4 sum = vec4(0.0);
    float wSum = 0.0;
    for(int i = -RADIUS; i <= RADIUS; i++){
        float fi = float(i);
        float w = exp(-(fi * fi) / (2.0 * SIGMA * SIGMA));
        sum += texture(${inputName}, vUV + dir * fi) * w;
        wSum += w;
    }
    fragColor = sum / wSum;
}
`
}

export const blurDef: ProcessorDef = {
    pure: true,
    type: 'blur',
    title: 'Blur',
    category: 'imageOp',
    inputs: [
        { name: 'texture', type: SLOT.TEXTURE },
        { name: 'radius', type: SLOT.NUMBER },
        { name: 'step_sigma', type: SLOT.NUMBER, label: 'step/sigma' },
        { name: 'passes', type: SLOT.NUMBER },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { mode: MODES[0], radius: 8, step_sigma: 2.0, passes: 1, width: 0, height: 0 },
}

export class BlurProcessor extends BaseProcessor {
    readonly def = blurDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const inputSrc = inputs.texture
        if (!inputSrc) return { texture: null }

        const radius = Math.round(this.val(inputs, params, 'radius', 8))
        const step = this.val(inputs, params, 'step_sigma', 2.0)
        const passes = Math.round(this.val(inputs, params, 'passes', 1))
        const mode = (params.mode ?? 'box') as string
        const [w, h] = this.resolveRes(inputs, params, engine)
        const uRes = new UniformGroup({ uResolution: { value: [w, h], type: 'vec2<f32>' } } as any, { isStatic: true })

        if (mode === 'sdf-packed') {
            return this.runSdfBlur(inputSrc, radius, step, uRes, w, h, engine)
        }
        return this.runGenericBlur(inputSrc, mode, radius, step, passes, uRes, w, h, engine)
    }

    private runSdfBlur(src: any, radius: number, step: number, uRes: UniformGroup, w: number, h: number, engine: IDataflowEngine): Record<string, any> {
        const ping = this.ensurePing(w, h)
        const pong = this.ensurePong(w, h)
        engine.renderPassInto(ping, sdfBlurH(radius, step), { uniforms: uRes, sdfRTTexture: src })
        engine.renderPassInto(pong, sdfBlurV(radius, step), { uniforms: uRes, sdfHRTTexture: ping.source })
        this._outputRT = pong
        return { texture: pong.source }
    }

    private runGenericBlur(src: any, mode: string, radius: number, sigma: number, passes: number, uRes: UniformGroup, w: number, h: number, engine: IDataflowEngine): Record<string, any> {
        const genH = mode === 'gaussian'
            ? (inp: string) => gaussianBlurFrag(inp, 'h', radius, sigma)
            : (inp: string) => boxBlurFrag(inp, 'h', radius)
        const genV = mode === 'gaussian'
            ? (inp: string) => gaussianBlurFrag(inp, 'v', radius, sigma)
            : (inp: string) => boxBlurFrag(inp, 'v', radius)

        const ping = this.ensurePing(w, h)
        const pong = this.ensurePong(w, h)
        const texA = 'blurInputA'
        const texB = 'blurInputB'

        let currentSrc = src
        for (let p = 0; p < passes; p++) {
            engine.renderPassInto(ping, genH(texA), { uniforms: uRes, [texA]: currentSrc })
            engine.renderPassInto(pong, genV(texB), { uniforms: uRes, [texB]: ping.source })
            currentSrc = pong.source
        }

        this._outputRT = pong
        return { texture: pong.source }
    }
}
