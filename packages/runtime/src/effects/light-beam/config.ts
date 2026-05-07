import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

/**
 * Single-ray light-beam effect. Stack multiple Effect nodes for multi-ray
 * compositions — one node per ray with its own colour/density/phase offset.
 */
export const config: PlaygroundConfig = {
    name: 'LightBeam',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['txcn0'] },
    ],
    staticUniforms: {
        uEdgeFeatherPx: { type: 'f32', value: 0 },
    },
    fields: [
        {
            name: 'uColor',
            label: 'Color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.1, 1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayStrength',
            label: 'Ray strength',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayDensity',
            label: 'Ray density',
            kind: 'f32',
            default: 2,
            slider: { min: 0, max: 10, step: 1 },
        },
        {
            name: 'uRayFalloff',
            label: 'Ray falloff',
            kind: 'f32',
            default: 0.08,
            slider: { min: 0.01, max: 0.1, step: 0.001 },
        },
        {
            name: 'uJoinSoftness',
            label: 'Ray softness',
            kind: 'f32',
            default: 0.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uRayPhaseOffsetFrac',
            label: 'Phase offset',
            kind: 'f32',
            default: 0.0,
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
    textures: {
        slots: [
            { slot: 0, label: 'SDF (signed distance)' },
        ],
    },
}
