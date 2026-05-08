/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal } from '../types'
import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// Pattern textures whose UVs are warped by the canonical fbm2D noise field.
// Displacement amplitude is in UV units; typical range 0..0.3.
export const NOISE_MODES = ['chess', 'stripes'] as const
export type NoiseMode = typeof NOISE_MODES[number]

const MODE_INDEX: Record<NoiseMode, number> = {
    chess: 0,
    stripes: 1,
}

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uDrive;    // raw drift driver from upstream Signal.value
uniform float uMode;     // 0 = chess, 1 = stripes
uniform float uScale;    // noise frequency in cycles per UV unit
uniform float uAmp;      // noise → UV displacement amplitude
uniform float uCells;    // chess: cells per side
uniform float uStripes;  // stripes: stripe count
uniform float uSpeed;    // drift gain (multiplier on the driver)

${NOISE_GLSL}

void main() {
    vec2 uv = vUV;
    float t = uDrive * uSpeed;

    // Two decorrelated fbm samples → 2D vector field; centred to [-1, 1].
    float n1 = fbm2D(uv * uScale + vec2(t, 0.0));
    float n2 = fbm2D(uv * uScale + vec2(t, 11.7));
    vec2 disp = (vec2(n1, n2) - 0.5) * 2.0 * uAmp;

    vec2 p = uv + disp;
    float v;

    if (uMode < 0.5) {
        vec2 c = floor(p * uCells);
        v = mod(c.x + c.y, 2.0);
    } else {
        v = mod(floor(p.x * uStripes), 2.0);
    }

    fragColor = vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}
`

export const noiseVisualizerDef: ProcessorDef = {
    pure: true,
    type: 'noiseVisualizer',
    title: 'Noise Visualizer',
    category: 'util',
    inputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    outputs: [{ name: 'texture', type: SLOT.TEXTURE }],
    defaultParams: {
        mode: 'chess' as NoiseMode,
        scale: 4,
        amp: 0.08,
        cells: 12,
        stripes: 24,
        speed: 0.5,
        width: 384,
        height: 384,
    },
}

export class NoiseVisualizerProcessor extends BaseProcessor {
    readonly def = noiseVisualizerDef
    // No internal clock → not alwaysDirty; re-execution rides upstream
    // propagation (Timer/AnimationController) and param edits.

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const mode = (params.mode ?? 'chess') as NoiseMode
        const modeIdx = MODE_INDEX[mode] ?? 0
        const scale = Math.max(0.01, Number(params.scale ?? 4))
        const amp = Math.max(0, Number(params.amp ?? 0.08))
        const cells = Math.max(1, Math.floor(Number(params.cells ?? 12)))
        const stripes = Math.max(1, Math.floor(Number(params.stripes ?? 24)))
        const speed = Number(params.speed ?? 0.5)
        const w = Math.max(8, Math.floor(Number(params.width ?? 384)))
        const h = Math.max(8, Math.floor(Number(params.height ?? 384)))

        // Drive on signal.value (not signal.time): a paused Timer must hold a static field;
        // `time` keeps ticking through pauses while `value` carries the phase/waveform.
        const sig = inputs.signal as Signal | undefined
        const tDrive = sig?.value ?? 0

        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
            uDrive:      { value: tDrive, type: 'f32' },
            uMode:       { value: modeIdx, type: 'f32' },
            uScale:      { value: scale,  type: 'f32' },
            uAmp:        { value: amp,    type: 'f32' },
            uCells:      { value: cells,  type: 'f32' },
            uStripes:    { value: stripes, type: 'f32' },
            uSpeed:      { value: speed,  type: 'f32' },
        } as any)

        const rt = this.ensureRT(w, h)
        engine.renderPassInto(rt, FRAGMENT, { uniforms })
        return { texture: rt.source }
    }
}
