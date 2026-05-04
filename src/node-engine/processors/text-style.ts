/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type TextStyle } from '../types'

const DEFAULT_FONT = '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif'

export const textStyleDef: ProcessorDef = {
    type: 'textStyle',
    title: 'Text Style',
    category: 'input',
    inputs: [],
    outputs: [{ name: 'style', type: SLOT.TEXT_STYLE }],
    defaultParams: {
        font: DEFAULT_FONT,
        letterSpacing: 0,
        weight: 'bold',
        transform: 'none',
    },
}

/**
 * Typography source. Pure data node — emits a `TextStyle` packet that
 * downstream nodes consume alongside a `text` payload. Centralising the
 * style here lets one preset drive several Text Strips at once and keeps
 * the consumers free of font-picker UI.
 */
export class TextStyleProcessor extends BaseProcessor {
    readonly def = textStyleDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const style: TextStyle = {
            font: typeof params.font === 'string' && params.font.length > 0 ? params.font : DEFAULT_FONT,
            letterSpacing: clampSpacing(Number(params.letterSpacing ?? 0)),
            weight: params.weight === 'regular' ? 'regular' : 'bold',
            transform: params.transform === 'upper' || params.transform === 'lower' ? params.transform : 'none',
        }
        return { style }
    }
}

function clampSpacing(v: number): number {
    if (!Number.isFinite(v)) return 0
    if (v < -50) return -50
    if (v > 200) return 200
    return v
}
