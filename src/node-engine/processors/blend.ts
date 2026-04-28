/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'add', 'subtract', 'soft-light', 'hard-light'] as const

function blendFrag(mode: string): string {
    let blendBody: string
    switch (mode) {
        case 'multiply':   blendBody = 'vec3 r = base.rgb * layer.rgb;'; break
        case 'screen':     blendBody = 'vec3 r = 1.0 - (1.0 - base.rgb) * (1.0 - layer.rgb);'; break
        case 'overlay':    blendBody = `vec3 r;
    for(int i=0;i<3;i++){float b=base[i];float l=layer[i];r[i]=b<0.5?2.0*b*l:1.0-2.0*(1.0-b)*(1.0-l);}`; break
        case 'add':        blendBody = 'vec3 r = min(base.rgb + layer.rgb, 1.0);'; break
        case 'subtract':   blendBody = 'vec3 r = max(base.rgb - layer.rgb, 0.0);'; break
        case 'soft-light':  blendBody = `vec3 r;
    for(int i=0;i<3;i++){float b=base[i];float l=layer[i];r[i]=l<0.5?b-(1.0-2.0*l)*b*(1.0-b):b+(2.0*l-1.0)*(sqrt(b)-b);}`; break
        case 'hard-light':  blendBody = `vec3 r;
    for(int i=0;i<3;i++){float b=base[i];float l=layer[i];r[i]=l<0.5?2.0*b*l:1.0-2.0*(1.0-b)*(1.0-l);}`; break
        default:           blendBody = 'vec3 r = layer.rgb;'
    }
    return `
#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D baseTex;
uniform sampler2D layerTex;
uniform float uOpacity;
void main(){
    vec4 base = texture(baseTex, vUV);
    vec4 layer = texture(layerTex, vUV);
    ${blendBody}
    fragColor = vec4(mix(base.rgb, r, uOpacity * layer.a), base.a);
}
`
}

export const blendDef: ProcessorDef = {
    type: 'blend',
    title: 'Blend',
    category: 'imageOp',
    inputs: [
        { name: 'base', type: SLOT.TEXTURE },
        { name: 'layer', type: SLOT.TEXTURE },
        { name: 'opacity', type: SLOT.NUMBER },
    ],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: { mode: 'normal', opacity: 1.0, width: 0, height: 0 },
}

export { BLEND_MODES }

export class BlendProcessor extends BaseProcessor {
    readonly def = blendDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const baseSrc = inputs.base
        const layerSrc = inputs.layer
        if (!baseSrc || !layerSrc) return { texture: baseSrc || null }

        const opacity = this.val(inputs, params, 'opacity', 1.0)
        const mode = (params.mode ?? 'normal') as string
        const [w, h] = this.resolveRes(inputs, params, engine)
        const rt = this.ensureRT(w, h)
        const uniforms = new UniformGroup({ uOpacity: { value: opacity, type: 'f32' } } as any, { isStatic: true })

        engine.renderPassInto(rt, blendFrag(mode), { uniforms, baseTex: baseSrc, layerTex: layerSrc })
        return { texture: rt.source }
    }
}
