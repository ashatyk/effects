import { BAKE_MANIFEST_VERSION, PUBLISH_MANIFEST_VERSION, type BakedPipeline, type PublishedPipeline } from '@effects/runtime'
import type { SupplierConfig } from './supplier-config'

/** Image dataUrls travel inline as base64 — config files are typically a few MB.
 *  Pretty-printed JSON for diff-friendliness, no compression in v1. */
export function serializeConfig(cfg: SupplierConfig): string {
    return JSON.stringify(cfg, null, 2)
}

export function downloadConfig(cfg: SupplierConfig): void {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([serializeConfig(cfg)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${cfg.pipelineId}-${ts}.config.json`
    a.click()
    URL.revokeObjectURL(url)
}

export type ParseConfigResult =
    | { ok: true; config: SupplierConfig }
    | { ok: false; error: string }

/**
 * Parse + validate against the active pipeline. Fails closed on:
 *  - invalid JSON
 *  - mismatched pipelineId (config prepared for a different effect — applying
 *    would silently target the wrong nodes)
 *  - mismatched manifestVersion (schema bump)
 *  - structural shape mismatch
 *
 * Pipeline-version mismatch is reported as a soft warning in the UI (config
 * still loads) — version is purely an author-bumped label.
 */
export function parseConfig(text: string, pipeline: PublishedPipeline): ParseConfigResult {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch (e) {
        return { ok: false, error: `Invalid JSON: ${(e as Error).message}` }
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'Top-level value must be an object.' }
    }
    const c = parsed as Partial<SupplierConfig>
    if (typeof c.pipelineId !== 'string') {
        return { ok: false, error: 'Missing "pipelineId" field.' }
    }
    if (c.pipelineId !== pipeline.id) {
        return {
            ok: false,
            error: `Config is for pipeline "${c.pipelineId}", but this session loaded "${pipeline.id}".`,
        }
    }
    if (typeof c.manifestVersion !== 'number') {
        return { ok: false, error: 'Missing "manifestVersion" field.' }
    }
    if (c.manifestVersion !== PUBLISH_MANIFEST_VERSION) {
        return {
            ok: false,
            error: `Config manifestVersion=${c.manifestVersion} is incompatible with runtime ${PUBLISH_MANIFEST_VERSION}.`,
        }
    }
    if (!c.imageSlots || typeof c.imageSlots !== 'object') return { ok: false, error: 'Missing "imageSlots".' }
    if (!c.segmentation || typeof c.segmentation !== 'object') return { ok: false, error: 'Missing "segmentation".' }
    if (!c.fields || typeof c.fields !== 'object') return { ok: false, error: 'Missing "fields".' }
    /* `texts` was added in v1.1; older configs parse cleanly with empty record. */
    const texts = (c.texts && typeof c.texts === 'object')
        ? c.texts as SupplierConfig['texts']
        : {}
    /* `baked` is the bake-step output — optional for legacy configs and freshly
       created configs that haven't been exported yet. */
    const baked = (c.baked && typeof c.baked === 'object')
        ? c.baked as SupplierConfig['baked']
        : undefined
    return {
        ok: true,
        config: {
            pipelineId: c.pipelineId,
            pipelineVersion: typeof c.pipelineVersion === 'string' ? c.pipelineVersion : pipeline.version,
            manifestVersion: c.manifestVersion,
            imageSlots: c.imageSlots as SupplierConfig['imageSlots'],
            segmentation: c.segmentation as SupplierConfig['segmentation'],
            fields: c.fields as SupplierConfig['fields'],
            texts,
            ...(baked ? { baked } : {}),
        },
    }
}

/** Resolves with file text or null if user cancelled. */
export function pickConfigFile(): Promise<string | null> {
    return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) { resolve(null); return }
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result ?? ''))
            reader.onerror = () => resolve(null)
            reader.readAsText(file)
        }
        input.click()
    })
}

export function serializeBaked(baked: BakedPipeline): string {
    /* Pretty-printed for diff-friendliness on small payloads. Texture dataUrls
       and contour `positions[]` are inline as long base64/number sequences —
       large but uncompressed JSON is the only format a non-Pixi runtime can
       consume without a custom decoder. */
    return JSON.stringify(baked, null, 2)
}

export function downloadBaked(baked: BakedPipeline): void {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([serializeBaked(baked)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baked.id}-${ts}.baked.json`
    a.click()
    URL.revokeObjectURL(url)
}

export type ParseBakedResult =
    | { ok: true; baked: BakedPipeline }
    | { ok: false; error: string }

/**
 * Two version checks, both fail-closed:
 *  - `manifestVersion` (graph schema) must match `PUBLISH_MANIFEST_VERSION`.
 *  - `bakeManifestVersion` (constant-source params layout) must match
 *    `BAKE_MANIFEST_VERSION`.
 * A Tier-3 player can't safely interpret a future-shape baked artifact —
 * constant processor params keys may have shifted.
 */
export function parseBaked(text: string): ParseBakedResult {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch (e) {
        return { ok: false, error: `Invalid JSON: ${(e as Error).message}` }
    }
    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, error: 'Top-level value must be an object.' }
    }
    const b = parsed as Partial<BakedPipeline>
    if (typeof b.id !== 'string') return { ok: false, error: 'Missing "id" field.' }
    if (typeof b.manifestVersion !== 'number') return { ok: false, error: 'Missing "manifestVersion" field.' }
    if (typeof b.bakeManifestVersion !== 'number') return { ok: false, error: 'Missing "bakeManifestVersion" field.' }
    if (b.manifestVersion !== PUBLISH_MANIFEST_VERSION) {
        return { ok: false, error: `Baked manifestVersion=${b.manifestVersion} is incompatible with runtime ${PUBLISH_MANIFEST_VERSION}.` }
    }
    if (b.bakeManifestVersion !== BAKE_MANIFEST_VERSION) {
        return { ok: false, error: `Baked bakeManifestVersion=${b.bakeManifestVersion} is incompatible with runtime ${BAKE_MANIFEST_VERSION}.` }
    }
    if (!b.graph || !Array.isArray(b.graph.nodes) || !Array.isArray(b.graph.edges)) {
        return { ok: false, error: 'Missing or malformed "graph" field.' }
    }
    if (!b.surface) {
        return { ok: false, error: 'Missing "surface" field.' }
    }
    return { ok: true, baked: b as BakedPipeline }
}

export function pickBakedFile(): Promise<string | null> {
    return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) { resolve(null); return }
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result ?? ''))
            reader.onerror = () => resolve(null)
            reader.readAsText(file)
        }
        input.click()
    })
}
