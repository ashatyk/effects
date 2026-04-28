import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'LightBeam',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['sdf'] },
    ],
    staticUniforms: {
        uEdgeFeatherPx: { type: 'f32', value: 0 },
    },
    fields: [
        {
            name: 'uDepthSoftness',
            label: 'Depth softness',
            kind: 'f32',
            default: 0.1,
            slider: { min: 0.01, max: 0.5, step: 0.01 },
        },
        {
            name: 'uEaseCubic',
            label: 'Bezier (x1,y1,x2,y2)',
            kind: 'vec4<f32>',
            default: [0.42, 0.00, 0.58, 1.00],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uAnimationSpeed',
            label: 'Animation speed',
            kind: 'f32',
            default: 0.5,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColor0',
            label: 'Color layer 1',
            kind: 'vec4<f32>',
            color: true,
            default: [0.1, 1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColor1',
            label: 'Color layer 2',
            kind: 'vec4<f32>',
            color: true,
            default: [1.0, 0.1, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColor2',
            label: 'Color layer 3',
            kind: 'vec4<f32>',
            color: true,
            default: [1.0, 1.0, 0.1, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayStrength3',
            label: 'Ray strength',
            kind: 'vec3<f32>',
            default: [1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayDensity3',
            label: 'Ray density',
            kind: 'vec3<f32>',
            default: [1, 2, 1],
            slider: { min: 0, max: 10, step: 1 },
        },
        {
            name: 'uRaySpeed3',
            label: 'Ray spin speed',
            kind: 'vec3<f32>',
            default: [1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayFalloff3',
            label: 'Ray falloff',
            kind: 'vec3<f32>',
            default: [0.08, 0.09, 0.09],
            slider: { min: 0.01, max: 0.1, step: 0.001 },
        },
        {
            name: 'uJoinSoftness3',
            label: 'Ray softness',
            kind: 'vec3<f32>',
            default: [0.0, 0.0, 0.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayPhaseOffsetFrac3',
            label: 'Phase offset',
            kind: 'vec3<f32>',
            default: [0.0, 0.33, 0.67],
            slider: { min: 0, max: 1, step: 0.01 },
        },
    ],
    animation: {
        class: 'fullscreen',
        channels: [
            { id: 'progress',  label: 'Progress',             defaultMin: 0, defaultMax: 1 },
            { id: 'intensity', label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
            { id: 'phase',     label: 'Phase (rad)',          defaultMin: 0, defaultMax: 6.2831853 },
        ],
    },
}
