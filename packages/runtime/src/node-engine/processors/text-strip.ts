/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container, Sprite, Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type TextStyle } from '../types'

const DEFAULT_FONT = '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif'
const DEFAULT_STYLE: TextStyle = { font: DEFAULT_FONT, letterSpacing: 0, weight: 'bold', transform: 'none' }
const STRIP_HEIGHT = 128 // px — internal canvas height; final on-canvas size driven by uTextHeight uniform.
const FONT_FRAC = 0.78   // glyph height / strip height
const PADDING = 24       // px padding on each side for glow tails

export const textStripDef: ProcessorDef = {
    pure: true,
    type: 'textStrip',
    title: 'Text Strip',
    category: 'input',
    inputs: [
        { name: 'text', type: SLOT.TEXT, label: 'text' },
        { name: 'style', type: SLOT.TEXT_STYLE, label: 'style (optional)' },
    ],
    outputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    defaultParams: {},
}

// Rasterises a phrase as a horizontal strip TextureSource for ribbon-along-contour
// consumers. Downstream Effect uses texture.width/height to derive uTxcn{i}Aspect.
export class TextStripProcessor extends BaseProcessor {
    readonly def = textStripDef

    private cacheKey: string | null = null
    private generating = false

    execute(inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const rawText = typeof inputs.text === 'string' ? inputs.text : ''
        const style: TextStyle = sanitiseStyle(inputs.style)
        const text = applyTransform(rawText, style.transform)
        if (text.length === 0) {
            this.cacheKey = null
            return { texture: null }
        }
        const key = `${text}::${style.font}::${style.letterSpacing}::${style.weight}`
        if (this.cacheKey === key && this._outputRT) {
            return { texture: this._outputRT.source }
        }
        if (!this.generating) {
            this.generating = true
            this.buildStrip(text, style, key, engine)
        }
        return { texture: null }
    }

    private buildStrip(text: string, style: TextStyle, key: string, engine: IDataflowEngine): void {
        const fontSize = STRIP_HEIGHT * FONT_FRAC
        const weightToken = style.weight === 'bold' ? 'bold ' : ''
        const cssFont = `${weightToken}${fontSize}px ${style.font}`

        // Wait for document.fonts.load: rasterising before a web font is ready
        // makes Canvas2D silently fall back to the next family in the stack.
        const fontReady = (typeof document !== 'undefined' && document.fonts)
            ? document.fonts.load(cssFont).catch(() => undefined)
            : Promise.resolve()

        fontReady.then(() => this.rasteriseStrip(text, cssFont, style.letterSpacing, key, engine))
    }

    private rasteriseStrip(text: string, cssFont: string, letterSpacing: number, key: string, engine: IDataflowEngine): void {
        const measure = document.createElement('canvas')
        const mctx = measure.getContext('2d')!
        mctx.font = cssFont
        // Manual glyph layout fallback when the platform rejects ctx.letterSpacing.
        let supportsCtxSpacing = true
        try {
            (mctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacing}px`
        } catch {
            supportsCtxSpacing = false
        }
        const metrics = mctx.measureText(text)
        const ctxMeasuredW = Math.ceil(metrics.width)
        const manualW = measureGlyphsManual(mctx, text, letterSpacing)
        const textW = Math.max(1, supportsCtxSpacing ? Math.max(ctxMeasuredW, manualW) : manualW)
        const stripW = textW + PADDING * 2

        const canvas = document.createElement('canvas')
        canvas.width = stripW
        canvas.height = STRIP_HEIGHT
        const ctx = canvas.getContext('2d')!

        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, stripW, STRIP_HEIGHT)
        ctx.fillStyle = '#fff'
        ctx.textBaseline = 'middle'
        ctx.font = cssFont
        let ctxSpacingApplied = false
        try {
            (ctx as unknown as { letterSpacing: string }).letterSpacing = `${letterSpacing}px`
            ctxSpacingApplied = true
        } catch {
            ctxSpacingApplied = false
        }
        if (ctxSpacingApplied && supportsCtxSpacing) {
            ctx.textAlign = 'center'
            ctx.fillText(text, stripW / 2, STRIP_HEIGHT / 2)
        } else {
            ctx.textAlign = 'left'
            const lineW = manualW
            let x = (stripW - lineW) / 2
            const y = STRIP_HEIGHT / 2
            for (const ch of [...text]) {
                ctx.fillText(ch, x, y)
                x += ctx.measureText(ch).width + letterSpacing
            }
        }

        canvas.toBlob(blob => {
            if (!blob) { this.generating = false; return }
            const url = URL.createObjectURL(blob)
            const img = new Image()
            img.onload = () => {
                URL.revokeObjectURL(url)
                const rt = this.ensureRT(stripW, STRIP_HEIGHT)
                const tex = Texture.from(img)
                const sprite = new Sprite(tex)
                sprite.width = stripW
                sprite.height = STRIP_HEIGHT
                const container = new Container()
                container.addChild(sprite)
                engine.app.renderer.render({ container, target: rt, clear: true })
                container.destroy({ children: true })
                // tex.destroy(true): container.destroy doesn't release Sprite textures by
                // default, and the rasterised PNG TextureSource would leak on every
                // re-rasterisation. _outputRT is owned by ensureRT and stays alive.
                tex.destroy(true)
                this.cacheKey = key
                this.generating = false
                engine.markDirty(this.nodeId)
            }
            img.src = url
        }, 'image/png')
    }
}

function sanitiseStyle(input: unknown): TextStyle {
    if (!input || typeof input !== 'object') return DEFAULT_STYLE
    const s = input as Partial<TextStyle>
    return {
        font: typeof s.font === 'string' && s.font.length > 0 ? s.font : DEFAULT_STYLE.font,
        letterSpacing: Number.isFinite(s.letterSpacing) ? Number(s.letterSpacing) : DEFAULT_STYLE.letterSpacing,
        weight: s.weight === 'regular' ? 'regular' : 'bold',
        transform: s.transform === 'upper' || s.transform === 'lower' ? s.transform : 'none',
    }
}

function applyTransform(text: string, transform: TextStyle['transform']): string {
    if (transform === 'upper') return text.toUpperCase()
    if (transform === 'lower') return text.toLowerCase()
    return text
}

function measureGlyphsManual(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
    let total = 0
    const glyphs = [...text]
    for (let i = 0; i < glyphs.length; i++) {
        total += ctx.measureText(glyphs[i]).width
        if (i < glyphs.length - 1) total += letterSpacing
    }
    return Math.ceil(total)
}
