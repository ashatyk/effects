import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'GodRays',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['sdf'] },
    ],
    staticUniforms: {
        uJoinSoftness3: { value: [0, 0, 0], type: 'vec3<f32>' },
        uRayPhaseOffsetFrac3: { type: 'vec3<f32>', value: [0.0, 0.33, 0.67] },
        uEdgeFeatherPx: { type: 'f32', value: 1 },
        uAnimationSpeed: { type: 'f32', value: 0.5 },
        uEaseCubic: { type: 'vec4<f32>', value: [0.8, 0.0, 0.6, 1.0] },
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
            name: 'uColor0',
            label: 'Цвет первого луча',
            kind: 'vec4<f32>',
            color: true,
            default: [0.1, 1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColor1',
            label: 'Цвет второго луча',
            kind: 'vec4<f32>',
            color: true,
            default: [1.0, 0.1, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColor2',
            label: 'Цвет третьего луча',
            kind: 'vec4<f32>',
            color: true,
            default: [1.0, 1.0, 0.1, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayStrength3',
            label: 'Сила света',
            kind: 'vec3<f32>',
            default: [1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayDensity3',
            label: 'Частота лучей',
            kind: 'vec3<f32>',
            default: [1, 2, 1],
            slider: { min: 0, max: 20, step: 1 },
        },
        {
            name: 'uRaySpeed3',
            label: 'Скорость вращения',
            kind: 'vec3<f32>',
            default: [1.0, 1.0, 1.0],
            slider: { min: 0, max: 2, step: 0.01 },
        },
        {
            name: 'uRayFalloff3',
            label: 'Угасание',
            kind: 'vec3<f32>',
            default: [0.035, 0.03, 0.04],
            slider: { min: 0.01, max: 0.1, step: 0.001 },
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
