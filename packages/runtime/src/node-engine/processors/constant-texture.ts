/* eslint-disable @typescript-eslint/no-explicit-any */
import { Assets, Sprite, type Texture } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'

/**
 * Frozen-source processor for `TextureSource`.
 *
 * The supplier app's bake step (`packages/player/src/baking.ts`)
 * pre-runs static texture-producing subgraphs (e.g.
 * `image → blur`, `text + textStyle → textStrip`,
 * `segmentation → contourResample → sdfFromContour`) once at
 * config-export time, captures the resulting GPU texture as a PNG
 * data URL via `renderer.extract.base64(...)`, and embeds it into
 * `BakedPipeline.graph.nodes[].data.params.dataUrl`. On Tier-3
 * player mount, the original processors are **replaced** with this
 * one — the player never loads SAM, never compiles SDF shaders,
 * never runs blur passes for the static SDF map, etc.
 *
 * Why a plain PNG round-trip is safe (it didn't used to be):
 *
 * Pixi's `extract.base64` walks the texture through Canvas2D
 * (`putImageData` → premultiply on store → `toDataURL` →
 * un-premultiply on read). That round trip annihilates RGB on
 * pixels with `A = 0` (`RGB *= 0` then `RGB / 0 = NaN → 0`). The
 * old SDF format put the inside-flag in alpha (`A = 0` outside
 * the silhouette); every pixel outside the silhouette read back
 * with `RGB = 0`, which the SDF decoder interpreted as
 * "distance = 0" → fake boundary everywhere → blank render.
 *
 * The fix landed upstream in `pipeline/passes/sdf-pure.ts`: the
 * SDF format now packs **signed** distance into 24-bit RGB
 * (negative inside, positive outside) and keeps `A = 1`
 * everywhere. The same change updated every SDF consumer
 * (`god-rays`, `light-beam`, `dot-grid-orbit`, `text-grid-orbit`,
 * `ping-pong-morphing`) and the SDF blur passes. With `A = 1` on
 * every pixel, PNG ↔ Canvas2D is a lossless round trip and we can
 * use the plain `Assets.load(dataUrl)` path.
 *
 * Hidden from the editor's "Add Node" picker — bake-target only.
 */
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
        /* PNG (or any browser-decodable image) data URL. Width and
           height let `BaseProcessor.resolveRes`-driven downstream
           processors size correctly before — and after — the async
           image load completes. */
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

        /* URL change → release the previous decoded image. Bake-
           target dataUrls are stable for the player lifetime, so
           this branch runs at most once per node. */
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

        /* Render the loaded sprite into the processor's RT pool so
           the rest of the graph sees a `TextureSource`-shaped
           output (matches what `image` / `blur` / etc. produce). */
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
            /* Fire-and-forget — Assets.unload is async but failure
               is non-fatal (would just leak the decoded bitmap;
               same fallback pattern as `image.ts`). */
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
