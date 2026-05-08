/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Pixi v8 leaks in ExtractSystem.canvas() / .base64(): both call
 * textureGenerator.generateTexture() into a fresh RenderTexture, snapshot
 * it, then never destroy the RT or unload its TextureSource. Hit by
 * SegmentationProcessor (per image change) and PreviewProcessor
 * (~30×/s via extract.pixels). The patch destroys the RT + unloads its
 * source before returning. Idempotent (one-shot _patched flag).
 * Wrapped in try/catch — Pixi v8 internals may shift between patch
 * releases; on failure we log and continue with the leaky default.
 * Original fix isolated in /Users/ashatyk/Desktop/blueberry/src/blueberry/_overrides/.
 */
import {
    type Container,
    type ExtractImageOptions,
    type ExtractOptions,
    ExtractSystem,
    type GenerateTextureOptions,
    type ICanvas,
    type RenderTexture,
    Texture,
} from 'pixi.js'

interface ExtractSystemInternals {
    _normalizeOptions: <T>(options: unknown, defaults?: unknown) => T
    _renderer: any
}

let patched = false

export function applyPixiExtractLeakPatches(): void {
    if (patched) return
    try {
        ExtractSystem.prototype.canvas = function (
            options: ExtractOptions | Container | Texture,
        ): ICanvas {
            const self = this as unknown as ExtractSystemInternals
            const normalised = self._normalizeOptions<ExtractOptions>(options)
            const target = (normalised as { target?: unknown }).target
            const renderer = self._renderer

            // Texture target: Pixi reads from existing source — no leak.
            if (target instanceof Texture) {
                return renderer.texture.generateCanvas(target)
            }

            // Container/etc. allocates an internal RT — that's the leak.
            const tex = renderer.textureGenerator.generateTexture(
                normalised as GenerateTextureOptions,
            )
            const canvas = renderer.texture.generateCanvas(tex)
            ;(tex as RenderTexture).source.unload()
            tex.destroy(true)
            return canvas
        }

        const imageMimeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            webp: 'image/webp',
        }

        ExtractSystem.prototype.base64 = async function (
            options: ExtractImageOptions | Container | Texture,
        ): Promise<string> {
            const self = this as unknown as ExtractSystemInternals
            const normalised = self._normalizeOptions<ExtractImageOptions>(
                options,
                ExtractSystem.defaultImageOptions,
            )
            const { format, quality } = normalised as { format: string; quality?: number }
            const canvas = this.canvas(normalised) as HTMLCanvasElement & {
                toBlob?: HTMLCanvasElement['toBlob']
                toDataURL?: HTMLCanvasElement['toDataURL']
                convertToBlob?: (opts?: { type?: string; quality?: number }) => Promise<Blob>
                remove?: () => void
            }
            const mime = imageMimeMap[format] ?? 'image/png'

            /* Three browser code-paths in preference order. canvas.remove()
               after every path — Pixi's textureGenerator uses
               document.createElement, so detached canvases otherwise pile
               up on document.body's garbage list. */
            if (canvas.toBlob !== undefined) {
                return new Promise<string>((resolve, reject) => {
                    canvas.toBlob!(blob => {
                        if (!blob) {
                            canvas.remove?.()
                            reject(new Error('ICanvas.toBlob failed!'))
                            return
                        }
                        const blobURL = URL.createObjectURL(blob)
                        const reader = new FileReader()
                        reader.onload = () => {
                            URL.revokeObjectURL(blobURL)
                            canvas.remove?.()
                            resolve(reader.result as string)
                        }
                        reader.onerror = err => {
                            URL.revokeObjectURL(blobURL)
                            canvas.remove?.()
                            reject(err)
                        }
                        reader.readAsDataURL(blob)
                    }, mime, quality)
                })
            }

            if (canvas.toDataURL !== undefined) {
                try {
                    const dataURL = canvas.toDataURL(mime, quality)
                    canvas.remove?.()
                    return dataURL
                } catch (e) {
                    canvas.remove?.()
                    throw e
                }
            }

            if (canvas.convertToBlob !== undefined) {
                try {
                    const blob = await canvas.convertToBlob({ type: mime, quality })
                    const blobURL = URL.createObjectURL(blob)
                    return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => {
                            URL.revokeObjectURL(blobURL)
                            canvas.remove?.()
                            resolve(reader.result as string)
                        }
                        reader.onerror = err => {
                            URL.revokeObjectURL(blobURL)
                            canvas.remove?.()
                            reject(err)
                        }
                        reader.readAsDataURL(blob)
                    })
                } catch (e) {
                    canvas.remove?.()
                    throw e
                }
            }

            throw new Error(
                'Extract.base64() requires ICanvas.toDataURL, ICanvas.toBlob, ' +
                'or ICanvas.convertToBlob to be implemented',
            )
        }

        patched = true
    } catch (e) {
        console.error('[runtime] Failed to apply Pixi extract leak patches:', e)
    }
}
