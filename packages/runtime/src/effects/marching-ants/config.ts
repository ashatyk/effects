import ribbonVertex from './ribbon.vert'
import ribbonFragment from './ribbon.frag'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'MarchingAnts',
    canvas: { width: 900, height: 1200 },
    passes: [
        copySourcePass,
        {
            id: 'ants',
            kind: 'instanced',
            blend: 'normal',
            vertex: ribbonVertex,
            fragment: ribbonFragment,
            requiresInputs: ['contour'],
            scrolling: {
                mode: 'ribbon',
                segmentSizeField: 'uSegmentSize',
                phaseSlot: 0,
            },
            geometry: {
                /* Per-segment quad. aLocal.x ∈ {0,1}=start/end along curve;
                   aLocal.y ∈ {0,1}=inner/outer side of strip. */
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
            name: 'uBandHeight',
            label: 'Band thickness (px)',
            kind: 'f32',
            default: 6,
            slider: { min: 1, max: 48, step: 1 },
        },
        {
            name: 'uDashLen',
            label: 'Dash length (px)',
            kind: 'f32',
            default: 8,
            slider: { min: 1, max: 80, step: 1 },
        },
        {
            name: 'uGapLen',
            label: 'Gap length (px)',
            kind: 'f32',
            default: 8,
            slider: { min: 0, max: 80, step: 1 },
        },
        {
            name: 'uSegmentSize',
            label: 'Ribbon segment size (px)',
            kind: 'f32',
            default: 4,
            slider: { min: 1, max: 32, step: 1 },
        },
        {
            name: 'uCornerRadius',
            label: 'Corner radius (px)',
            kind: 'f32',
            default: 3,
            slider: { min: 0, max: 32, step: 0.5 },
        },
        {
            name: 'uEdgeAA',
            label: 'Dash edge AA (px)',
            kind: 'f32',
            default: 1,
            slider: { min: 0.0, max: 4.0, step: 0.1 },
        },
        {
            name: 'uCrossAA',
            label: 'Band edge AA (px)',
            kind: 'f32',
            default: 1,
            slider: { min: 0.0, max: 4.0, step: 0.1 },
        },
        {
            name: 'uColor',
            label: 'Dash color',
            kind: 'vec4<f32>',
            color: true,
            default: [1.0, 1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uColorAlt',
            label: 'Gap color',
            kind: 'vec4<f32>',
            color: true,
            default: [0.0, 0.0, 0.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
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
