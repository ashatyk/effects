import { BAKE_MANIFEST_VERSION, PUBLISH_MANIFEST_VERSION, type BakedPipeline, type PublishedPipeline } from '@effects/runtime'
import type { SupplierConfig } from './supplier-config'

/**
 * Serialize a SupplierConfig for download. Image dataUrls travel
 * inline as base64 — config files are typically a few MB. No
 * compression in v1; pretty-printed JSON for diff-friendliness.
 */
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
 * Parse a JSON string into a SupplierConfig and validate it against
 * the active pipeline. Fails closed on:
 *  - invalid JSON
 *  - mismatched pipelineId (the config was prepared for a different
 *    effect — applying it would silently target the wrong nodes)
 *  - mismatched manifestVersion (schema bump — consumer should
 *    fail-closed; user can manually upgrade if they trust the diff)
 *  - structural shape mismatch (missing required keys)
 *
 * The pipeline-version mismatch is reported as a soft warning in the
 * UI (config still loads) — the version is purely an author-bumped
 * label and doesn't change graph semantics.
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
    /* `texts` was added in v1.1 of the supplier-app schema. Older
       configs that pre-date it parse cleanly with an empty record so
       imports stay backwards-compatible. */
    const texts = (c.texts && typeof c.texts === 'object')
        ? c.texts as SupplierConfig['texts']
        : {}
    /* `baked` is the bake-step output — see `baking.mdc`. Optional:
       configs from before the bake step existed (or freshly created
       configs that the supplier hasn't exported yet) won't carry it,
       and that's fine — the runtime just runs the original frozen
       processors live as if no baking had happened. */
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

/** Open a file picker for `.config.json`. Resolves with the parsed
 *  text or null if the user cancelled. */
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

/* ───────── BakedPipeline I/O ───────── */

export function serializeBaked(baked: BakedPipeline): string {
    /* Pretty-print with 2-space indent so a baked artifact stays
       diff-friendly on small payloads. Texture dataUrls and
       contour `positions[]` are inline as long base64/number
       sequences — large but uncompressed JSON is the only format
       a non-Pixi runtime can consume without a custom decoder. */
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
 * Parse a `.baked.json` file. Two version checks:
 *  - `manifestVersion` (the underlying graph schema) must match
 *    `PUBLISH_MANIFEST_VERSION` — the graph nodes/edges shape.
 *  - `bakeManifestVersion` (the bake-step schema) must match
 *    `BAKE_MANIFEST_VERSION` — the constant-source params layout.
 *
 * Either mismatch fails closed: a Tier-3 player can't safely
 * interpret a future-shape baked artifact (the constant processor
 * params keys may have shifted).
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

/** File-picker variant that targets `.baked.json` specifically. */
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
