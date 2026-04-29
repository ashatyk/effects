import dotVertex from './dot.vert'
import dotFragment from './dot.frag'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

/**
 * DotOrbit — instanced "string of beads" effect.
 *
 * One quad per dot, glyph-mode scrolling on the resampled contour: the
 * vertex shader varies each dots radius with sin(arc) ⊕ noise(arc, time);
 * the fragment shader paints an anti-aliased disk + outer glow with an
 * along-contour A↔B gradient.
 */
export const config: PlaygroundConfig = {
    name: 'DotOrbit',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        {
            id: 'dots',
            kind: 'instanced',
            blend: 'normal',
            vertex: dotVertex,
            fragment: dotFragment,
            requiresInputs: ['contour'],
            scrolling: {
                mode: 'glyph',
                spacingField: 'uDotSpacing',
                speedField: 'uSlideSpeed',
            },
            geometry: {
                /* Centred unit quad in [-1, 1]^2 — the vertex shader scales
                   it by the per-instance radius. */
                perVertex: {
                    aLocal: [
                        [-1.0, -1.0],
                        [ 1.0, -1.0],
                        [ 1.0,  1.0],
                        [-1.0,  1.0],
                    ],
                },
                indexBuffer: [0, 1, 2, 0, 2, 3],
                perInstance: {
                    source: 'inputs.contour',
                    map: [
                        { name: 'aPosition', from: 'positions' },
                        { name: 'aTangent',  from: 'tangents'  },
                        { name: 'aArcS',     from: 'arcS'      },
                    ],
                },
            },
        },
    ],
    fields: [
        {
            name: 'uDotSpacing',
            label: 'Dot spacing (px)',
            kind: 'f32',
            default: 22,
            slider: { min: 4, max: 120, step: 1 },
        },
        {
            name: 'uDotMinRadius',
            label: 'Dot min radius (px)',
            kind: 'f32',
            default: 4,
            slider: { min: 0.5, max: 60, step: 0.5 },
        },
        {
            name: 'uDotMaxRadius',
            label: 'Dot max radius (px)',
            kind: 'f32',
            default: 14,
            slider: { min: 1, max: 120, step: 0.5 },
        },
        {
            name: 'uWaveFrequency',
            label: 'Wave frequency (cycles / 100 px)',
            kind: 'f32',
            default: 1.2,
            slider: { min: 0.0, max: 10.0, step: 0.05 },
        },
        {
            name: 'uWaveSpeed',
            label: 'Wave speed (rad/sec)',
            kind: 'f32',
            default: 1.4,
            slider: { min: -8.0, max: 8.0, step: 0.05 },
        },
        {
            name: 'uNoiseAmount',
            label: 'Noise amount (0..1)',
            kind: 'f32',
            default: 0.4,
            slider: { min: 0.0, max: 1.0, step: 0.01 },
        },
        {
            name: 'uNoiseScale',
            label: 'Noise scale (per 100 px)',
            kind: 'f32',
            default: 0.7,
            slider: { min: 0.05, max: 6.0, step: 0.05 },
        },
        {
            name: 'uSlideSpeed',
            label: 'Slide speed (px/sec)',
            kind: 'f32',
            default: 0,
            slider: { min: -300, max: 300, step: 1 },
        },
        {
            name: 'uEdgeSoftness',
            label: 'Disk edge softness (px)',
            kind: 'f32',
            default: 2.0,
            slider: { min: 0.0, max: 8.0, step: 0.1 },
        },
        {
            name: 'uGlowSize',
            label: 'Glow size (× radius)',
            kind: 'f32',
            default: 4.5,
            slider: { min: 1.0, max: 12.0, step: 0.1 },
        },
        {
            name: 'uGlowIntensity',
            label: 'Glow intensity',
            kind: 'f32',
            default: 1.4,
            slider: { min: 0.0, max: 6.0, step: 0.05 },
        },
        {
            name: 'uGradientFrequency',
            label: 'Gradient cycles around contour',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0.0, max: 8.0, step: 0.1 },
        },
        {
            name: 'uHeightTint',
            label: 'Height-driven tint (0..1)',
            kind: 'f32',
            default: 0.35,
            slider: { min: 0.0, max: 1.0, step: 0.01 },
        },
        {
            name: 'uColorA',
            label: 'Gradient color A',
            kind: 'vec4<f32>',
            color: true,
            default: [0.62, 0.40, 1.00, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColorB',
            label: 'Gradient color B',
            kind: 'vec4<f32>',
            color: true,
            default: [1.00, 0.45, 0.85, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uGlowColor',
            label: 'Glow color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.85, 0.55, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
    ],
    animation: {
        slots: [
            { slot: 0, label: 'Scroll (px)',          defaultMin: 0, defaultMax: 600 },
            { slot: 1, label: 'Radial offset (px)',   defaultMin: 0, defaultMax: 20 },
            { slot: 2, label: 'Size multiplier',      defaultMin: 1, defaultMax: 2 },
            { slot: 3, label: 'Glow multiplier',      defaultMin: 1, defaultMax: 2 },
            { slot: 4, label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
            { slot: 5, label: 'Noise time (ms)',      defaultMin: 0, defaultMax: 1 },
        ],
    },
}
