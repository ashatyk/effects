/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Pixi v8 has a known leak in `ExtractSystem.canvas()` and the
 * `base64()` helper that builds on top of it: both call
 * `renderer.textureGenerator.generateTexture(...)` to upload the
 * source into a fresh `RenderTexture`, then return a Canvas2D
 * snapshot of that RT — but never destroy the intermediate texture
 * or unload its `TextureSource`. The GPU memory accumulates
 * one source-sized RT per `extract.canvas` call.
 *
 * In our codebase that path is hit by:
 *   - `SegmentationProcessor` — once per image change (supplier app's
 *     SAM widget; uploads happen as the supplier picks new photos).
 *   - `PreviewProcessor` — `extract.pixels(...)` per Preview node
 *     ~30×/s while the editor preview is open.
 *   - Any future processor that surfaces a CPU-side image of an
 *     upstream texture.
 *
 * The patch monkey-replaces both methods with versions that destroy
 * the intermediate `RenderTexture` AND unload its `TextureSource`
 * before returning. Idempotent — a process-level `_patched` flag
 * guards against double-application across multiple `createEngine`
 * calls (editor + supplier on the same page during dev).
 *
 * Crash isolation: the entire patch is wrapped in try/catch — Pixi
 * v8 internals may shift in patch releases. If the override fails
 * to apply we log and continue with the leaky default rather than
 * blocking engine startup.
 *
 * Long-form context + the original copy of this fix lives at
 * `/Users/ashatyk/Desktop/blueberry/src/blueberry/_overrides/`
 * (a sibling project that shipped this leak in production and
 * isolated the root cause).
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

            /* When the caller passed a Texture directly, Pixi just
               needs to read from its existing source — no intermediate
               RT to leak. Pass-through unchanged. */
            if (target instanceof Texture) {
                return renderer.texture.generateCanvas(target)
            }

            /* Container or anything else: Pixi internally allocates an
               RT via textureGenerator. THAT is the leak — it never
               destroys it. We do. */
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

            /* Three browser code-paths, in preference order. After
               turning the canvas into a data URL we explicitly
               .remove() it so detached canvases don't pile up under
               document.body's garbage list (Pixi's textureGenerator
               creates them via document.createElement). */
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
