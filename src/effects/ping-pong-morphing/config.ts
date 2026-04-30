import fragment from './fragment'
import type { PlaygroundConfig } from '../../pipeline/types'
import { copySourcePass } from '../../pipeline/passes/copy-source'

export const config: PlaygroundConfig = {
    name: 'WavePingPong',
    canvas: { width: 900, height: 1200 },
    staticUniforms: {},
    passes: [
        copySourcePass,
        { id: 'main', kind: 'fullscreen', blend: 'normal', fragment, requiresInputs: ['txcn0'] },
    ],
    fields: [
        {
            name: 'uCenterTranslation',
            label: 'Смещение к центру (0..1)',
            kind: 'f32',
            default: 0.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uEdgeFeatherPx',
            label: 'Мягкость краёв (px)',
            kind: 'f32',
            default: 0,
            slider: { min: 0, max: 5, step: 1 },
        },
        {
            name: 'uWaveBasePx',
            label: 'Дистанция от контура (px)',
            kind: 'f32',
            default: 24.0,
            slider: { min: 0, max: 300, step: 0.5 },
        },
        {
            name: 'uWaveAmpPx',
            label: 'Амплитуда хода (px)',
            kind: 'f32',
            default: 12.0,
            slider: { min: 0, max: 300, step: 0.5 },
        },
        {
            name: 'uWaveWidthPx',
            label: 'Толщина волны (px)',
            kind: 'f32',
            default: 10.0,
            slider: { min: 0, max: 150, step: 0.5 },
        },
        {
            name: 'uColor',
            label: 'Цвет волны',
            kind: 'vec3<f32>',
            color: true,
            default: [1.0, 1.0, 1.0],
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uOpacity',
            label: 'Непрозрачность',
            kind: 'f32',
            default: 1.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uNoiseScalePx',
            label: 'Размер шума (px)',
            kind: 'f32',
            default: 100.0,
            slider: { min: 1, max: 100, step: 1 },
        },
        {
            name: 'uNoiseAmpPx',
            label: 'Амплитуда шума (px)',
            kind: 'f32',
            default: 4.0,
            slider: { min: 0, max: 100, step: 1 },
        },
        {
            name: 'uToothShape',
            label: 'Форма зубцов (0=tri, 1=saw, 2=square)',
            kind: 'f32',
            default: 0,
            slider: { min: 0, max: 2, step: 1 },
        },
        {
            name: 'uToothMix',
            label: 'Микс зубчатости (0..1)',
            kind: 'f32',
            default: 0.2,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uToothAmpPx',
            label: 'Амплитуда зубцов (px)',
            kind: 'f32',
            default: 0,
            slider: { min: 0, max: 200, step: 0.5 },
        },
        {
            name: 'uToothCount',
            label: 'Количество зубцов',
            kind: 'f32',
            default: 20.0,
            slider: { min: 1, max: 64, step: 1 },
        },
        {
            name: 'uToothPhase',
            label: 'Фаза зубцов (0..1)',
            kind: 'f32',
            default: 0.0,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uToothSharp',
            label: 'Острота saw (≥1)',
            kind: 'f32',
            default: 1.5,
            slider: { min: 1, max: 8, step: 0.1 },
        },
        {
            name: 'uToothDuty',
            label: 'Duty для square',
            kind: 'f32',
            default: 0.5,
            slider: { min: 0, max: 1, step: 0.01 },
        },
        {
            name: 'uToothSmooth',
            label: 'Сглаживание square',
            kind: 'f32',
            default: 0.02,
            slider: { min: 0, max: 0.49, step: 0.005 },
        },
    ],
    animation: {
        slots: [
            { slot: 0, label: 'Progress',             defaultMin: 0, defaultMax: 1 },
            { slot: 1, label: 'Ping-pong (0..1)',     defaultMin: 0, defaultMax: 1 },
            { slot: 4, label: 'Intensity multiplier', defaultMin: 1, defaultMax: 1 },
            { slot: 5, label: 'Noise drift',          defaultMin: 0, defaultMax: 1 },
        ],
    },
    textures: {
        slots: [
            { slot: 0, label: 'SDF (signed distance)' },
        ],
    },
}
