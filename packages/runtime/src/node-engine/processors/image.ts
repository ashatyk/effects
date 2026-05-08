/* eslint-disable @typescript-eslint/no-explicit-any */
import { Assets, Sprite } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

export const imageDef: ProcessorDef = {
    pure: true,
    type: 'image',
    title: 'Image',
    category: 'input',
    inputs: [],
    outputs: [
        { name: 'texture', type: SLOT.TEXTURE },
    ],
    defaultParams: {},
}

export class ImageProcessor extends BaseProcessor {
    readonly def = imageDef

    public loadedUrl: string | null = null
    private sprite: Sprite | null = null
    private imgW = 0
    private imgH = 0
    private loading = false

    setImageUrl(url: string, engine: IDataflowEngine): void {
        // Must Assets.unload the previous URL: just nulling `sprite` leaks the display
        // object and pins the prior URL in the global Pixi Assets cache forever.
        const prevUrl = this.loadedUrl
        this.sprite?.destroy({ texture: false, textureSource: false })
        this.sprite = null
        this.loadedUrl = url
        this.imgW = 0
        this.imgH = 0
        this.loading = false
        if (prevUrl && prevUrl !== url) {
            Assets.unload(prevUrl).catch(() => {})
        }
        engine.markDirty(this.nodeId)
    }

    execute(_inputs: Record<string, any>, _params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        if (!this.loadedUrl) return { texture: null, width: 0, height: 0 }

        if (!this.sprite && !this.loading) {
            this.loading = true
            Assets.load(this.loadedUrl).then(tex => {
                this.sprite = new Sprite(tex)
                this.imgW = tex.width
                this.imgH = tex.height
                this.loading = false
                engine.markDirty(this.nodeId)
            }).catch(() => { this.loading = false })
            return { texture: null, width: 0, height: 0 }
        }

        if (!this.sprite) return { texture: null, width: 0, height: 0 }

        const w = this.imgW
        const h = this.imgH
        this.sprite.width = w
        this.sprite.height = h
        const rt = this.ensureRT(w, h)
        engine.app.renderer.render({ container: this.sprite, target: rt, clear: true })
        return { texture: rt.source, width: w, height: h }
    }

    destroy(): void {
        super.destroy()
        this.sprite?.destroy({ texture: false, textureSource: false })
        this.sprite = null
        if (this.loadedUrl) {
            Assets.unload(this.loadedUrl).catch(() => {})
            this.loadedUrl = null
        }
    }
}
