import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

/**
 * Single-ray god-rays effect. Stack multiple Effect nodes (chained via the
 * `source` input with `blend: 'add'`) to compose a multi-coloured pinwheel —
 * one node per ray. Internal multi-ray unrolling is gone; per-ray params
 * live on each node instance.
 */
export const config: PlaygroundConfig = {
    name: 'GodRays',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['sdf'] },
    ],
    staticUniforms: {
        uJoinSoftness: { type: 'f32', value: 0 },
        uEdgeFeatherPx: { type: 'f32', value: 1 },
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
            name: 'uColor',
            label: 'Цвет луча',
            kind: 'vec4<f32>',
            color: true,
            default: [0.1, 1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayStrength',
            label: 'Сила света',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayDensity',
            label: 'Частота лучей',
            kind: 'f32',
            default: 2,
            slider: { min: 0, max: 20, step: 1 },
        },
        {
            name: 'uRaySpeed',
            label: 'Скорость вращения',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0, max: 2, step: 0.01 },
        },
        {
            name: 'uRayFalloff',
            label: 'Угасание',
            kind: 'f32',
            default: 0.035,
            slider: { min: 0.01, max: 0.1, step: 0.001 },
        },
        {
            name: 'uRayPhaseOffsetFrac',
            label: 'Сдвиг фазы (0..1)',
            kind: 'f32',
            default: 0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
    ],
    animation: {
        slots: [
            { slot: 0, label: 'Progress',             defaultMin: 0, defaultMax: 1 },
            { slot: 1, label: 'Phase (rad)',          defaultMin: 0, defaultMax: 6.2831853 },
            { slot: 4, label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
        ],
    },
}
