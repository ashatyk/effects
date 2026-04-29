/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal } from '../types'
import { NOISE_GLSL } from '../../pipeline/noise.glsl'

/**
 * Visualizer surfaces — pattern textures whose UVs are warped by the
 * canonical fbm2D noise field. The point is to show what the same
 * `fbm2D` the effects sample is actually doing to a known surface.
 *
 *   chess    — checkerboard, sampled at uv + noise displacement
 *   stripes  — vertical stripes, displaced
 *
 * Displacement amplitude is in UV units (0..1); typical useful
 * range is 0..0.3.
 */
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

    /* Two decorrelated fbm samples form a 2D vector field that warps
       the pattern's UVs. Centring around 0.5 → vector in [-1, 1]. */
    float n1 = fbm2D(uv * uScale + vec2(t, 0.0));
    float n2 = fbm2D(uv * uScale + vec2(t, 11.7));
    vec2 disp = (vec2(n1, n2) - 0.5) * 2.0 * uAmp;

    vec2 p = uv + disp;
    float v;

    if (uMode < 0.5) {
        // chess: black/white checkerboard, displaced by noise
        vec2 c = floor(p * uCells);
        v = mod(c.x + c.y, 2.0);
    } else {
        // stripes: vertical stripes, displaced by noise
        v = mod(floor(p.x * uStripes), 2.0);
    }

    fragColor = vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}
`

export const noiseVisualizerDef: ProcessorDef = {
    type: 'noiseVisualizer',
    title: 'Noise Visualizer',
    category: 'util',
    /* Required Signal input. The visualizer is purely a *consumer* of
       upstream time: wire AutoTimer → signal to animate. Without a
       wired signal the node renders a static frame (drift = 0), which
       intentionally mirrors how downstream effects behave when their
       noise channel has no driver. */
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
    /* No internal clock → no need to mark the node dirty every frame.
       Re-execution is driven entirely by upstream propagation: when
       AutoTimer (alwaysDirty) is wired to `signal`, the engine flags
       this node dirty on each tick automatically. Param edits push
       through `updateNodeParams` → markDirty as usual. */

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

        /* Drift driver = signal.value (NOT signal.time). AutoTimer
           keeps `time` ticking in every mode — even `constant` — so
           reading time would make every signal animate the field. The
           `value` field is the actual *waveform output*: constant in
           constant mode (→ static field), monotonically growing in
           unbounded mode (→ steady drift), oscillating in sine/triangle
           (→ breathing). When unwired, drive = 0 and the field is
           frozen at noise-origin. */
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
