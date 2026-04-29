import ribbonVertex from './ribbon.vert'
import ribbonFragment from './ribbon.frag'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'TextOrbit',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        {
            id: 'text',
            kind: 'instanced',
            blend: 'normal',
            vertex: ribbonVertex,
            fragment: ribbonFragment,
            requiresInputs: ['contour', 'atlas'],
            scrolling: {
                mode: 'ribbon',
                speedField: 'uSlideSpeed',
                segmentSizeField: 'uSegmentSize',
                phaseSlot: 0,
            },
            geometry: {
                /* Per-segment quad: 4 corners, indexed as two triangles.
                   aLocal.x ∈ {0,1} = start/end of segment (along curve)
                   aLocal.y ∈ {0,1} = inner/outer side of strip */
                perVertex: {
                    aLocal: [
                        [0.0, 0.0],
                        [1.0, 0.0],
                        [1.0, 1.0],
                        [0.0, 1.0],
                    ],
                },
                indexBuffer: [0, 1, 2, 0, 2, 3],
                perInstance: {
                    source: 'inputs.contour',
                    map: [
                        { name: 'aPosition', from: 'positions' },
                        { name: 'aPositionNext', from: 'positionsNext' },
                        { name: 'aTangent', from: 'tangents' },
                        { name: 'aTangentNext', from: 'tangentsNext' },
                        { name: 'aArcS', from: 'arcS' },
                        { name: 'aArcSNext', from: 'arcSNext' },
                    ],
                },
            },
        },
    ],
    fields: [
        {
            name: 'uTextHeight',
            label: 'Text height (px)',
            kind: 'f32',
            default: 32,
            slider: { min: 6, max: 120, step: 1 },
        },
        {
            name: 'uTextRepeats',
            label: 'Phrase repeats around contour',
            kind: 'f32',
            default: 2,
            slider: { min: 1, max: 8, step: 1 },
        },
        {
            name: 'uSlideSpeed',
            label: 'Slide speed (px/sec)',
            kind: 'f32',
            default: 60,
            slider: { min: -300, max: 300, step: 1 },
        },
        {
            name: 'uSegmentSize',
            label: 'Ribbon segment size (px)',
            kind: 'f32',
            default: 6,
            slider: { min: 2, max: 32, step: 1 },
        },
        {
            name: 'uTextRepeatPadding',
            label: 'Padding between repeats (px)',
            kind: 'f32',
            default: 0,
            slider: { min: 0, max: 400, step: 1 },
        },
        {
            name: 'uTextEdgeAA',
            label: 'Edge softness (AA)',
            kind: 'f32',
            default: 0.05,
            slider: { min: 0.0, max: 2.0, step: 0.01 },
        },
        {
            name: 'uTextColor',
            label: 'Text color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.95, 1.0, 0.85, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uGlowColor',
            label: 'Text glow color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.55, 0.85, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uGlowIntensity',
            label: 'Glow intensity',
            kind: 'f32',
            default: 0.3,
            slider: { min: 0.0, max: 2.0, step: 0.01 },
        },
    ],
    animation: {
        slots: [
            { slot: 0, label: 'Scroll (px)',          defaultMin: 0, defaultMax: 600 },
            { slot: 1, label: 'Radial offset (px)',   defaultMin: 0, defaultMax: 20 },
            { slot: 2, label: 'Width multiplier',     defaultMin: 1, defaultMax: 2 },
            { slot: 3, label: 'Spacing multiplier',   defaultMin: 1, defaultMax: 2 },
            { slot: 4, label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
        ],
    },
}
