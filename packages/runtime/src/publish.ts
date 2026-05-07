/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier-2 publish-plane: walk a flat resolved scene from the
 * `publishRoot` back through reverse adjacency, collect the supplier-
 * facing surface (image slots, tap zones, exposed fields, whole nodes),
 * and trim the graph to the reachable subgraph.
 *
 * This module is **framework-agnostic**: no React, no MUI, no
 * @xyflow/react, no editor-side imports. It depends on:
 *  - the runtime's processor catalog (`PROCESSOR_CATALOG`) — for type
 *    classification (image / segmentation / etc.).
 *  - the runtime's effect catalogue (`effects[]`) — for resolving
 *    `config.fields` keys to their `FieldDef` metadata.
 *
 * Editor consumes via a thin wrapper that runs `resolveSceneForEngine`
 * on the multi-page scene first, then passes the flat resolved view in
 * here. Tier-3 runtime consumes the published JSON directly — no need
 * to pull in editor concepts (pages, clones).
 */

import { PROCESSOR_CATALOG } from './node-engine/processors'
import { effects } from './effects'
import type { FieldDef } from './pipeline/types'

/** Bump on any breaking change to `PublishedPipeline` shape. Snapshots
 *  written with a higher version than the consumer knows about should
 *  be rejected (fail-closed, not silently re-interpret). */
export const PUBLISH_MANIFEST_VERSION = 1

/* ── Serialized graph types ──────────────────────────────────────
   These types are the wire format consumers see in
   `PublishedPipeline.graph`. They mirror the editor's `SerializedNode`
   / `SerializedEdge` shape so a `.published.json` is structurally a
   trimmed snapshot — useful for debugging by importing one back into
   the editor. The editor's `scene-store.ts` re-exports these types
   verbatim and only adds Dexie-specific bits (SceneSnapshot, BlobEntry)
   on top. */

export interface SerializedNode {
    id: string
    type: string
    position: { x: number; y: number }
    data: {
        processor: string
        params: Record<string, unknown>
        label?: string
        imageUrl?: string
        cloneOf?: string
        exposed?: {
            mode: 'whole' | 'fields'
            fields?: string[]
            label?: string
            hint?: string
        }
        [key: string]: unknown
    }
    width?: number
    height?: number
    style?: Record<string, unknown>
    selected?: boolean
}

export interface SerializedEdge {
    id?: string
    type?: string
    source: string
    sourceHandle?: string | null
    target: string
    targetHandle?: string | null
    data?: Record<string, unknown>
}

/* ── PublishedPipeline surface types ────────────────────────────── */

export interface PublishedImageSlot {
    nodeId: string
    label: string
    hint?: string
}

export interface PublishedTapZone {
    nodeId: string
    eventId: string
    label: string
    kind: 'tap' | 'event'
    hint?: string
}

export interface PublishedField {
    nodeId: string
    paramKey: string
    label: string
    hint?: string
    field: FieldDef
}

export interface PublishedWholeNode {
    nodeId: string
    processor: string
    label: string
    hint?: string
}

export interface PublishedSurface {
    imageSlots: PublishedImageSlot[]
    tapZones: PublishedTapZone[]
    fields: PublishedField[]
    wholeNodes: PublishedWholeNode[]
}

export interface PublishedGraph {
    nodes: SerializedNode[]
    edges: SerializedEdge[]
}

export interface PublishedPipeline {
    id: string
    name: string
    version: string
    manifestVersion: number
    graph: PublishedGraph
    surface: PublishedSurface
}

export type PublishError =
    | { kind: 'no-root' }
    | { kind: 'multiple-roots'; nodeIds: string[] }
    | { kind: 'orphan-exposed'; nodeId: string }
    | { kind: 'duplicate-tap-id'; eventId: string; nodeIds: string[] }
    | { kind: 'image-slot-missing-label'; nodeId: string }
    | { kind: 'effect-id-missing' }

export type DerivePublishedSurfaceResult =
    | { ok: true; pipeline: PublishedPipeline }
    | { ok: false; errors: PublishError[] }

/**
 * Walk a flat resolved graph: find publishRoot, BFS reverse-adjacency
 * to collect the reachable subgraph, classify reached nodes into the
 * supplier-facing surface, validate, and return either a
 * `PublishedPipeline` or aggregated errors.
 *
 * Caller responsibility: pass already-resolved nodes/edges. Editor
 * supplies these by running its `resolveSceneForEngine(pages)` first
 * (which flattens clones and dedupes nodes). Other callers (tests,
 * fixtures) can construct flat inputs directly.
 *
 * Pure function — does NOT mutate the input, does NOT touch any
 * runtime engine. Safe to call from a memo / live preview.
 */
export function derivePublishedSurface(graph: {
    nodes: SerializedNode[]
    edges: SerializedEdge[]
}): DerivePublishedSurfaceResult {
    const errors: PublishError[] = []
    const { nodes, edges } = graph

    /* ── 1. Locate the publishRoot ─────────────────────────────── */
    const roots = nodes.filter(n => n.data.processor === 'publishRoot')
    if (roots.length === 0) {
        errors.push({ kind: 'no-root' })
        return { ok: false, errors }
    }
    if (roots.length > 1) {
        errors.push({ kind: 'multiple-roots', nodeIds: roots.map(r => r.id) })
        /* Continue with the first root so the rest of the validation
           still surfaces — the author gets one error report covering
           every issue, not a chain of single-blocker reports. */
    }
    const root = roots[0]

    /* ── 2. BFS backward from the root ─────────────────────────── */
    const reverseAdj = new Map<string, string[]>()
    for (const e of edges) {
        const set = reverseAdj.get(e.target)
        if (set) set.push(e.source)
        else reverseAdj.set(e.target, [e.source])
    }
    const reached = new Set<string>([root.id])
    const queue = [root.id]
    while (queue.length) {
        const cur = queue.shift()!
        const sources = reverseAdj.get(cur)
        if (!sources) continue
        for (const s of sources) {
            if (reached.has(s)) continue
            reached.add(s)
            queue.push(s)
        }
    }

    /* ── 3. Index nodes for downstream lookups ─────────────────── */
    const nodeById = new Map<string, SerializedNode>()
    for (const n of nodes) nodeById.set(n.id, n)

    /* ── 4. Classify reached nodes into the surface ────────────── */
    const surface: PublishedSurface = {
        imageSlots: [],
        tapZones: [],
        fields: [],
        wholeNodes: [],
    }
    const tapIds = new Map<string, string[]>()

    for (const id of reached) {
        const n = nodeById.get(id)
        if (!n) continue
        const proc = n.data.processor
        const exposed = n.data.exposed
        const labelFallback = (n.data.label ?? '').trim()
            || PROCESSOR_CATALOG[proc]?.def.title
            || proc
        const supplierLabel = (exposed?.label ?? '').trim() || labelFallback
        const hint = exposed?.hint?.trim() || undefined

        if (proc === 'tapZone') {
            const eventId = String(n.data.params.id ?? '').trim() || `tap_${n.id}`
            registerTapId(tapIds, eventId, n.id)
            surface.tapZones.push({
                nodeId: n.id,
                eventId,
                label: (n.data.params.label as string | undefined)?.trim() || supplierLabel,
                kind: 'tap',
                hint: hint ?? ((n.data.params.hint as string | undefined)?.trim() || undefined),
            })
            continue
        }
        if (proc === 'eventEmitter') {
            const eventId = String(n.data.params.id ?? '').trim() || `evt_${n.id}`
            registerTapId(tapIds, eventId, n.id)
            surface.tapZones.push({
                nodeId: n.id,
                eventId,
                label: (n.data.params.label as string | undefined)?.trim() || supplierLabel,
                kind: 'event',
                hint: hint ?? ((n.data.params.hint as string | undefined)?.trim() || undefined),
            })
            continue
        }

        if (!exposed) continue

        if (exposed.mode === 'whole') {
            if (proc === 'image') {
                if (!supplierLabel) errors.push({ kind: 'image-slot-missing-label', nodeId: n.id })
                surface.imageSlots.push({ nodeId: n.id, label: supplierLabel, hint })
                continue
            }
            surface.wholeNodes.push({ nodeId: n.id, processor: proc, label: supplierLabel, hint })
            continue
        }

        if (proc === 'config') {
            const effectName = (n.data.params.effect as string | undefined)
                ?? effects[0]?.name
            const effectCfg = effects.find(e => e.name === effectName)
            if (!effectCfg) continue
            for (const key of exposed.fields ?? []) {
                const field = effectCfg.fields.find(f => (f.uniformName ?? f.name) === key)
                if (!field) continue
                surface.fields.push({
                    nodeId: n.id,
                    paramKey: key,
                    label: (exposed.label?.trim()) || field.label,
                    hint,
                    field,
                })
            }
        }
    }

    /* ── 5. Orphan-exposed (exposed but unreachable) ───────────── */
    for (const n of nodes) {
        if (!n.data.exposed) continue
        if (reached.has(n.id)) continue
        errors.push({ kind: 'orphan-exposed', nodeId: n.id })
    }

    /* ── 6. Duplicate tap event ids ────────────────────────────── */
    for (const [eventId, ids] of tapIds) {
        if (ids.length > 1) errors.push({ kind: 'duplicate-tap-id', eventId, nodeIds: ids })
    }

    /* ── 7. Effect id ──────────────────────────────────────────── */
    const effectId = String(root.data.params.effectId ?? '').trim()
    if (!effectId) errors.push({ kind: 'effect-id-missing' })

    if (errors.length > 0) return { ok: false, errors }

    /* ── 8. Trim graph to reached subgraph ─────────────────────── */
    const trimmedNodes: SerializedNode[] = []
    /* Preserve input order. The trimmed graph drops Dexie blob keys
       (`imageUrl: 'img:n_3'`) — those are local IndexedDB keys that
       have no meaning outside the editor process. Image content
       travels via `surface.imageSlots` + `SupplierConfig.imageSlots`. */
    for (const n of nodes) {
        if (n.data.cloneOf) continue
        if (!reached.has(n.id)) continue
        trimmedNodes.push(stripBlobRefs(n))
    }
    const trimmedEdges: SerializedEdge[] = []
    for (const e of edges) {
        if (!reached.has(e.source) || !reached.has(e.target)) continue
        trimmedEdges.push(e)
    }

    return {
        ok: true,
        pipeline: {
            id: effectId,
            name: (root.data.params.name as string | undefined)?.trim() || 'Untitled',
            version: (root.data.params.version as string | undefined)?.trim() || 'v1',
            manifestVersion: PUBLISH_MANIFEST_VERSION,
            graph: { nodes: trimmedNodes, edges: trimmedEdges },
            surface,
        },
    }
}

function registerTapId(map: Map<string, string[]>, id: string, nodeId: string) {
    const arr = map.get(id)
    if (arr) arr.push(nodeId)
    else map.set(id, [nodeId])
}

function stripBlobRefs(n: SerializedNode): SerializedNode {
    const data = { ...n.data, params: { ...n.data.params } }
    if (typeof data.imageUrl === 'string' && data.imageUrl.startsWith('img:')) {
        delete data.imageUrl
    }
    if ('segMaskKey' in data) delete data.segMaskKey
    const out: SerializedNode = {
        id: n.id,
        type: n.type,
        position: { ...n.position },
        data,
    }
    if (typeof n.width === 'number') out.width = n.width
    if (typeof n.height === 'number') out.height = n.height
    if (n.style) out.style = { ...n.style }
    return out
}
