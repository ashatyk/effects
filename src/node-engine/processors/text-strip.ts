/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container, Sprite, Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

const DEFAULT_TEXT = 'Купи в комплекте'
const DEFAULT_FONT = '"Inter", "Helvetica Neue", "Arial", "Noto Sans", sans-serif'
const STRIP_HEIGHT = 128 // px — internal canvas height; final on-canvas size driven by uTextHeight uniform.
const FONT_FRAC = 0.78   // glyph height / strip height
const PADDING = 24       // px padding on each side for glow tails

export const textStripDef: ProcessorDef = {
    type: 'textStrip',
    title: 'Text Strip',
    category: 'input',
    inputs: [],
    outputs: [
        { name: 'texture', type: SLOT.TEXTURE },
        { name: 'aspect', type: SLOT.NUMBER },
    ],
    defaultParams: {
        text: DEFAULT_TEXT,
        font: DEFAULT_FONT,
        letterSpacing: 0,
    },
}

/**
 * Renders a phrase as a single horizontal raster strip into a RenderTexture.
 * Downstream effects can stretch this strip along a contour as a ribbon.
 *
 * Outputs:
 *   - `texture`: TextureSource of the strip
 *   - `aspect`:  width / height of the strip; consumers use it to compute the
 *                natural arc length for one phrase repetition.
 */
export class TextStripProcessor extends BaseProcessor {
    readonly def = textStripDef

    private cacheKey: string | null = null
    private cachedAspect = 1
    private generating = false

    execute(_inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const text = String(params.text ?? DEFAULT_TEXT)
        const font = String(params.font ?? DEFAULT_FONT)
        const letterSpacing = Math.max(-50, Math.min(200, Number(params.letterSpacing ?? 0) || 0))
        const key = `${text}::${font}::${letterSpacing}`
        if (this.cacheKey === key && this._outputRT) {
            return { texture: this._outputRT.source, aspect: this.cachedAspect }
        }
        if (!this.generating) {
            this.generating = true
            this.buildStrip(text, font, letterSpacing, key, engine)
        }
        return { texture: null, aspect: this.cachedAspect }
    }

    private buildStrip(text: string, font: string, letterSpacing: number, key: string, engine: IDataflowEngine): void {
        const fontSize = STRIP_HEIGHT * FONT_FRAC
        const cssFont = `bold ${fontSize}px ${font}`

        /* Web fonts (Google Fonts, @font-face etc.) load asynchronously. If we
           rasterise the strip before the typeface is available, Canvas2D
           silently falls back to a generic and the strip is rendered in the
           wrong font. Wait for the browsers font loader to finish for this
           font stack before measuring/painting. document.fonts.load resolves
           even when the family is missing — in that case Canvas2D uses the
           next entry in the stack. */
        const fontReady = (typeof document !== 'undefined' && document.fonts)
            ? document.fonts.load(cssFont).catch(() => undefined)
            : Promise.resolve()

        fontReady.then(() => this.rasteriseStrip(text, cssFont, letterSpacing, key, engine))
    }

    private rasteriseStrip(text: string, cssFont: string, letterSpacing: number, key: string, engine: IDataflowEngine): void {
        const measure = document.createElement('canvas')
        const mctx = measure.getContext('2d')!
        mctx.font = cssFont
        /* Canvas2D supports letterSpacing as both a CSS property on the
           context and via measureText respecting it. Fall back to manual
           glyph-by-glyph rendering if the platform refuses the property. */
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
            /* Manual layout: draw each glyph at the running x and add custom
               spacing between glyphs. Slower but works on every browser. */
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
                this.cacheKey = key
                this.cachedAspect = stripW / STRIP_HEIGHT
                this.generating = false
                engine.markDirty(this.nodeId)
            }
            img.src = url
        }, 'image/png')
    }
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
