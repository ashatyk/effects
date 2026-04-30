import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'DotGridOrbit',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['txcn0'] },
    ],
    fields: [
        {
            name: 'uOrbitCenter',
            label: 'Orbit center (px)',
            kind: 'f32',
            default: 80,
            slider: { min: 10, max: 400, step: 1 },
        },
        {
            name: 'uOrbitAmplitude',
            label: 'Orbit amplitude (px)',
            kind: 'f32',
            default: 60,
            slider: { min: 0, max: 300, step: 1 },
        },
        {
            name: 'uStepInterval',
            label: 'Step interval (sec)',
            kind: 'f32',
            default: 0.15,
            slider: { min: 0.03, max: 1.0, step: 0.01 },
        },
        {
            name: 'uOrbitWidth',
            label: 'Orbit band width (px)',
            kind: 'f32',
            default: 120,
            slider: { min: 10, max: 500, step: 1 },
        },
        {
            name: 'uGridSize',
            label: 'Grid cell size (px)',
            kind: 'f32',
            default: 24,
            slider: { min: 6, max: 80, step: 1 },
        },
        {
            name: 'uDotMaxRadius',
            label: 'Dot max radius (px)',
            kind: 'f32',
            default: 8,
            slider: { min: 1, max: 30, step: 0.5 },
        },
        {
            name: 'uDotMinRadius',
            label: 'Dot min radius (px)',
            kind: 'f32',
            default: 1.5,
            slider: { min: 0.5, max: 10, step: 0.5 },
        },
        {
            name: 'uSegmentMargin',
            label: 'Segment margin (px)',
            kind: 'f32',
            default: 5.0,
            slider: { min: 0, max: 50, step: 1 },
        },
        {
            name: 'uNoiseAmount',
            label: 'Wave noise amount (px)',
            kind: 'f32',
            default: 25,
            slider: { min: 0, max: 100, step: 1 },
        },
        {
            name: 'uNoiseScale',
            label: 'Noise scale',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0.1, max: 5.0, step: 0.1 },
        },
        {
            name: 'uDotColor',
            label: 'Dot color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.2, 0.9, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uFalloff',
            label: 'Distance falloff',
            kind: 'f32',
            default: 0.005,
            slider: { min: 0.0, max: 0.05, step: 0.001 },
        },
        {
            name: 'uEdgeSoftness',
            label: 'Dot edge softness',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0.0, max: 4.0, step: 0.1 },
        },
    ],
    animation: {
        slots: [
            { slot: 0, label: 'Scroll (sec)',         defaultMin: 0, defaultMax: 6 },
            { slot: 1, label: 'Radial offset (px)',   defaultMin: 0, defaultMax: 60 },
            { slot: 2, label: 'Size multiplier',      defaultMin: 1, defaultMax: 2 },
            { slot: 4, label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
        ],
    },
    textures: {
        slots: [
            { slot: 0, label: 'SDF (signed distance)' },
        ],
    },
}
