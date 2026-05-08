/* eslint-disable @typescript-eslint/no-explicit-any */
import { Assets, Sprite, type Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

// Frozen TextureSource: bake step (player/baking.ts) renders static texture
// subgraphs to a PNG data URL via renderer.extract.base64 and replaces them
// with this processor at export time.
//
// PNG round-trip caveat: Pixi's extract.base64 walks Canvas2D, which
// zeroes RGB wherever A=0 (premultiply ↔ un-premultiply through 0). The SDF
// format therefore packs signed distance into 24-bit RGB and keeps A=1
// everywhere (see pipeline/passes/sdf-pure.ts and SDF consumers); without
// that invariant Assets.load(dataUrl) would silently corrupt the SDF map.
export const constantTextureDef: ProcessorDef = {
    pure: true,
    hidden: true,
    type: 'constantTexture',
    title: 'Constant Texture',
    category: 'imageOp',
    inputs: [],
    outputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    defaultParams: {
        // width/height let downstream resolveRes size correctly while the data URL load is in flight.
        dataUrl: '',
        width: 0,
        height: 0,
    },
}

export class ConstantTextureProcessor extends BaseProcessor {
    readonly def = constantTextureDef

    private loadedUrl: string | null = null
    private sprite: Sprite | null = null
    private imgW = 0
    private imgH = 0
    private loading = false

    execute(_inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const dataUrl = typeof params.dataUrl === 'string' ? params.dataUrl : ''
        const declaredW = Number(params.width) | 0
        const declaredH = Number(params.height) | 0
        if (!dataUrl) return { texture: null, width: declaredW, height: declaredH }

        if (dataUrl !== this.loadedUrl) {
            this.releaseSprite(dataUrl)
            this.loadedUrl = dataUrl
            this.imgW = 0
            this.imgH = 0
            this.loading = false
        }

        if (!this.sprite && !this.loading) {
            this.loading = true
            Assets.load<Texture>(dataUrl).then((tex) => {
                this.sprite = new Sprite(tex)
                this.imgW = tex.width
                this.imgH = tex.height
                this.loading = false
                engine.markDirty(this.nodeId)
            }).catch(() => { this.loading = false })
            return { texture: null, width: declaredW, height: declaredH }
        }

        if (!this.sprite) return { texture: null, width: declaredW, height: declaredH }

        const w = this.imgW || declaredW
        const h = this.imgH || declaredH
        const rt = this.ensureRT(w, h)
        engine.app.renderer.render({ container: this.sprite, target: rt, clear: true })
        return { texture: rt.source, width: w, height: h }
    }

    private releaseSprite(prevUrl?: string): void {
        if (this.sprite) {
            try { this.sprite.destroy({ children: true, texture: false }) } catch { /* */ }
            this.sprite = null
        }
        if (this.loadedUrl && this.loadedUrl !== prevUrl) {
            void Assets.unload(this.loadedUrl).catch(() => { /* */ })
        }
        this.imgW = 0
        this.imgH = 0
    }

    destroy(): void {
        super.destroy()
        this.releaseSprite()
        this.loadedUrl = null
    }
}
