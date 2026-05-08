/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tier-2 publish-plane: BFS reverse-adjacency from `publishRoot`,
 * collect the supplier-facing surface (image slots, tap zones, exposed
 * fields, whole nodes), and trim the graph to the reachable subgraph.
 * Framework-agnostic; depends only on PROCESSOR_CATALOG and effects[].
 */

import { PROCESSOR_CATALOG } from './node-engine/processors'
import { effects } from './effects'
import type { FieldDef } from './pipeline/types'

/** Bump on breaking changes to PublishedPipeline. Loaders should
 *  fail-closed on a higher-than-known version. */
export const PUBLISH_MANIFEST_VERSION = 1

/* Serialized graph types — wire format mirrors the editor's
   SerializedNode/SerializedEdge so a `.published.json` is structurally
   a trimmed snapshot; scene-store.ts re-exports these verbatim. */

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
        /**
         * When true, @effects/player's bake step seeds taint here so
         * this node and everything downstream stays dynamic in the
         * trimmed graph. Used to keep large-output processors live
         * (e.g. sdfFromContour) and avoid the texture payload cost.
         * Set from the right-rail "Bake behaviour" toggle.
         */
        runtimeDynamic?: boolean
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
 * Walk a flat resolved graph: find publishRoot, BFS reverse-adjacency,
 * classify nodes into the supplier-facing surface, validate, return a
 * PublishedPipeline or aggregated errors. Pure — caller passes already-
 * resolved (flattened, deduped) nodes/edges; safe in memos / live previews.
 */
export function derivePublishedSurface(graph: {
    nodes: SerializedNode[]
    edges: SerializedEdge[]
}): DerivePublishedSurfaceResult {
    const errors: PublishError[] = []
    const { nodes, edges } = graph

    const roots = nodes.filter(n => n.data.processor === 'publishRoot')
    if (roots.length === 0) {
        errors.push({ kind: 'no-root' })
        return { ok: false, errors }
    }
    if (roots.length > 1) {
        errors.push({ kind: 'multiple-roots', nodeIds: roots.map(r => r.id) })
        /* Continue with the first root so the rest of the validation
           surfaces in one report instead of a chain of single-blocker reports. */
    }
    const root = roots[0]

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

    const nodeById = new Map<string, SerializedNode>()
    for (const n of nodes) nodeById.set(n.id, n)

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

    // Orphan-exposed (exposed but unreachable from the root).
    for (const n of nodes) {
        if (!n.data.exposed) continue
        if (reached.has(n.id)) continue
        errors.push({ kind: 'orphan-exposed', nodeId: n.id })
    }

    for (const [eventId, ids] of tapIds) {
        if (ids.length > 1) errors.push({ kind: 'duplicate-tap-id', eventId, nodeIds: ids })
    }

    const effectId = String(root.data.params.effectId ?? '').trim()
    if (!effectId) errors.push({ kind: 'effect-id-missing' })

    if (errors.length > 0) return { ok: false, errors }

    const trimmedNodes: SerializedNode[] = []
    /* Trimmed graph drops Dexie blob keys (`imageUrl: 'img:n_3'`) — those
       are editor-local IndexedDB keys. Image content travels via
       surface.imageSlots + SupplierConfig.imageSlots. */
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
