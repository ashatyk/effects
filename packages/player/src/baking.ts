/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Constant-folding pass: `PublishedPipeline + SupplierConfig` → `BakedPipeline`.
 * Runs in the supplier app at config-export time against the live engine driving
 * the preview canvas (which already has `outputCache` for every node).
 *
 * Algorithm:
 *  1. Caller has applied SupplierConfig and ticked at least once (steady state).
 *  2. Compute the **tainted set** (forward BFS from runtime-dynamic seeds:
 *     `RUNTIME_DYNAMIC_PROCESSORS` types + `data.runtimeDynamic === true`).
 *     A static processor consuming a runtime signal is itself runtime-dependent.
 *     Rule: collapse every path that doesn't terminate in an event/time-driven
 *     node, unless the author opted out per-node via `runtimeDynamic`.
 *  3. **Frozen set**: `def.pure === true` (or `segmentation` + polygon override)
 *     AND not tainted AND every input is also frozen. Forward BFS from
 *     inputs-free leaves. Note: `exposed` flags do NOT block freezing — the
 *     orthogonal opt-out is `runtimeDynamic`.
 *  4. For every frozen node, classify the bakeable output (CONTOUR or TEXTURE)
 *     and serialise: contour → number[], texture → PNG dataUrl via
 *     `renderer.extract.base64` (async).
 *  5. Build the trimmed graph: replace frozen nodes with `constantContour`/
 *     `constantTexture`, drop inbound edges, reverse-BFS from publishRoot to
 *     prune dead code (e.g. an `image` that fed only a baked `segmentation`).
 *  6. Build the trimmed surface: filter `pipeline.surface.*` to entries whose
 *     `nodeId` survived.
 *
 * Edge cases: async texture extraction fails fast if a node hasn't produced
 * yet (caller can retry); cycles stay unmarked because forward BFS only marks
 * on visit; unknown processor types are treated as not pure (stay live).
 */

import {
    BAKE_MANIFEST_VERSION,
    PROCESSOR_CATALOG,
    PUBLISH_MANIFEST_VERSION,
    type BakedPipeline,
    type BakeReport,
    type DataflowEngine,
    type PublishedPipeline,
    type SerializedEdge,
    type SerializedNode,
    type ContourSamples,
    SegmentationProcessor,
} from '@effects/runtime'
import type { SupplierConfig } from './supplier-config'

export interface BakeOptions {
    /** Skip texture-baking — useful for tests verifying contour path without
     *  paying GPU readback + base64 encoding cost. */
    skipTextures?: boolean
}

export interface BakeResult {
    ok: true
    baked: BakedPipeline
}

export interface BakeError {
    ok: false
    error: string
}

/**
 * Async because texture baking goes through `renderer.extract.base64` (GPU readback).
 *
 * Precondition: `engine` already has the SupplierConfig applied
 * (`applyAllOverrides(engine, pipeline, config)`) and ticked at least once
 * so every reachable processor produced its first output.
 */
export async function bakePipeline(
    engine: DataflowEngine,
    pipeline: PublishedPipeline,
    config: SupplierConfig,
    options: BakeOptions = {},
): Promise<BakeResult | BakeError> {
    const adjacency = buildAdjacencyMaps(pipeline.graph)

    /* Tainted seeds:
        1. Processor type — alwaysDirty / time-/event-/state-owning processors
           plus the Effect output itself (composites every tick). Listed in
           `RUNTIME_DYNAMIC_PROCESSORS`.
        2. Per-node opt-in via `data.runtimeDynamic === true` — authoring-time
           escape hatch from the editor's right-rail "Bake behaviour" toggle.
           Used to keep cheap-to-recompute / large-output pure processors live
           (e.g. `sdfFromContour`) instead of paying texture payload cost.
       NOT auto-tainted: exposed `image`/`segmentation`/`text`/`config` — supplier
       picks values in the supplier app, the .baked.json carries the exact picks.
       To keep one of these live in the player, mark it `runtimeDynamic`. */
    const taintedSeeds: string[] = []
    for (const node of pipeline.graph.nodes) {
        const seed = isRuntimeDynamic(node.data.processor)
            || node.data.runtimeDynamic === true
        if (seed) taintedSeeds.push(node.id)
    }
    const tainted = new Set<string>()
    {
        const q = [...taintedSeeds]
        while (q.length) {
            const id = q.shift()!
            if (tainted.has(id)) continue
            tainted.add(id)
            const downs = adjacency.outgoingEdges.get(id) ?? []
            for (const e of downs) q.push(e.target)
        }
    }

    /* Frozen = pure (or segmentation+polygon) AND not tainted AND every input
       frozen. Forward BFS from inputs-free leaves. */
    const frozen = new Set<string>()
    const queue: string[] = []

    for (const node of pipeline.graph.nodes) {
        if (tainted.has(node.id)) continue
        if (!isProcessorPureForBake(node, engine)) continue
        const incoming = adjacency.incomingEdges.get(node.id) ?? []
        if (incoming.length === 0) {
            frozen.add(node.id)
            queue.push(node.id)
        }
    }

    while (queue.length) {
        const id = queue.shift()!
        const downstreams = adjacency.outgoingEdges.get(id) ?? []
        for (const e of downstreams) {
            const target = pipeline.graph.nodes.find(n => n.id === e.target)
            if (!target) continue
            if (frozen.has(target.id)) continue
            if (tainted.has(target.id)) continue
            if (!isProcessorPureForBake(target, engine)) continue
            const incoming = adjacency.incomingEdges.get(target.id) ?? []
            const allFrozen = incoming.every(ie => frozen.has(ie.source))
            if (!allFrozen) continue
            frozen.add(target.id)
            queue.push(target.id)
        }
    }

    /* Demotion pass — a frozen boundary node whose output type is NOT bakeable
       (TEXTURE / CONTOUR) can't become a constant source. Demote it; any X that
       was frozen because all-inputs-frozen now no longer is — demote X too.
       Iterate to fixed point.
       Real example: `text` (TEXT) → `textStrip` (TEXTURE). If `textStrip` is
       exposed (not frozen), `text` becomes a frozen boundary with non-bakeable
       output — demote to keep it live. If `textStrip` is also frozen, `text`
       is interior and gets trimmed. */
    while (true) {
        const demote = new Set<string>()
        for (const id of frozen) {
            const node = pipeline.graph.nodes.find(n => n.id === id)
            if (!node) continue
            const downstreams = adjacency.outgoingEdges.get(id) ?? []
            const isBoundary = downstreams.some(e => !frozen.has(e.target))
            if (!isBoundary) continue
            if (!hasBakeableOutput(node)) demote.add(id)
        }
        if (demote.size === 0) break
        for (const id of demote) frozen.delete(id)
        for (const id of [...frozen]) {
            const incoming = adjacency.incomingEdges.get(id) ?? []
            const allFrozen = incoming.every(ie => frozen.has(ie.source))
            if (!allFrozen) frozen.delete(id)
        }
    }

    /* Final boundary set after demotion — only these nodes are actually baked.
       Interior frozen nodes stay in `frozen` for trim purposes (their downstream
       baked nodes don't need them) but resolveBake skips them. */
    const bakeTargets = new Set<string>()
    for (const id of frozen) {
        const downstreams = adjacency.outgoingEdges.get(id) ?? []
        const isBoundary = downstreams.some(e => !frozen.has(e.target))
        if (isBoundary) bakeTargets.add(id)
    }

    /* Resolve in parallel — texture extraction is async. */
    type ResolvedBake = {
        nodeId: string
        originalProcessor: string
        replacedNode: SerializedNode
        approxSizeBytes: number
    }
    const resolutions: Promise<ResolvedBake | { error: string; nodeId: string }>[] = []

    for (const nodeId of bakeTargets) {
        const node = pipeline.graph.nodes.find(n => n.id === nodeId)
        if (!node) continue
        resolutions.push(resolveBake(engine, node, options).catch(e => ({
            error: (e as Error)?.message ?? String(e),
            nodeId,
        })))
    }

    const settled = await Promise.all(resolutions)
    const failures = settled.filter((s): s is { error: string; nodeId: string } => 'error' in s)
    if (failures.length > 0) {
        return {
            ok: false,
            error: `Bake failed for ${failures.length} node(s): ${failures.map(f => `${f.nodeId} (${f.error})`).join(', ')}`,
        }
    }
    const resolved = settled as ResolvedBake[]

    /* Build the trimmed graph. Edges with a baked target are dropped (constants
       have no inputs). Edges from a baked source must rewrite `sourceHandle` to
       the constant processor's output name ('contour' or 'texture') — e.g.
       `sdfFromContour` exports `outputs: [{ name: 'sdf' }]` but `constantTexture`
       exports `[{ name: 'texture' }]`; without rewriting, downstream consumers'
       `gatherInputs` would silently miss the upstream value and render black. */
    const replacedById = new Map<string, SerializedNode>()
    const constantOutputName = new Map<string, 'contour' | 'texture'>()
    for (const r of resolved) {
        replacedById.set(r.nodeId, r.replacedNode)
        constantOutputName.set(
            r.nodeId,
            r.replacedNode.data.processor === 'constantContour' ? 'contour' : 'texture',
        )
    }

    const allNodes = pipeline.graph.nodes.map(n => replacedById.get(n.id) ?? n)
    /* Interior frozen nodes (in `frozen` but not `bakeTargets`) keep their edges;
       reverse-BFS from publishRoot will remove them as dead code. */
    const allEdges = pipeline.graph.edges
        .filter(e => !bakeTargets.has(e.target))
        .map(e => {
            const newHandle = constantOutputName.get(e.source)
            if (newHandle == null) return e
            if (e.sourceHandle === newHandle) return e
            return { ...e, sourceHandle: newHandle }
        })

    const root = allNodes.find(n => n.data.processor === 'publishRoot')
    if (!root) {
        return { ok: false, error: 'PublishedPipeline has no publishRoot node — cannot trim graph.' }
    }

    const reachable = reachableFromRoot(root.id, allNodes, allEdges)
    const trimmedNodes = allNodes.filter(n => reachable.has(n.id))
    const trimmedEdges = allEdges.filter(e => reachable.has(e.source) && reachable.has(e.target))

    /* Surface entries pointing at trimmed-away nodes are dead — supplier UI must
       NOT pretend they're tunable. */
    const trimmedSurface = {
        imageSlots: pipeline.surface.imageSlots.filter(s => reachable.has(s.nodeId)),
        tapZones: pipeline.surface.tapZones.filter(t => reachable.has(t.nodeId)),
        fields: pipeline.surface.fields.filter(f => reachable.has(f.nodeId)),
        wholeNodes: pipeline.surface.wholeNodes.filter(w => reachable.has(w.nodeId)),
    }

    const report: BakeReport = {
        entries: resolved.map(r => ({
            originalNodeId: r.nodeId,
            originalProcessor: r.originalProcessor,
            replacedWith: r.replacedNode.data.processor as 'constantContour' | 'constantTexture',
            approxSizeBytes: r.approxSizeBytes,
        })),
        nodesBefore: pipeline.graph.nodes.length,
        nodesAfter: trimmedNodes.length,
    }

    /* Trim embedded SupplierConfig — entries pointing at baked-away nodes would
       be no-ops at apply time (constants have no inputs). Drop them. */
    const reachableIds = new Set(trimmedNodes.map(n => n.id))
    const embeddedConfig: SupplierConfig = {
        pipelineId: config.pipelineId,
        pipelineVersion: config.pipelineVersion,
        manifestVersion: config.manifestVersion,
        imageSlots: pickByNodeId(config.imageSlots, reachableIds),
        segmentation: pickByNodeId(config.segmentation, reachableIds),
        fields: pickFields(config.fields, reachableIds),
        texts: pickByNodeId(config.texts, reachableIds),
    }

    const baked: BakedPipeline = {
        id: pipeline.id,
        name: pipeline.name,
        pipelineVersion: pipeline.version,
        manifestVersion: PUBLISH_MANIFEST_VERSION,
        bakeManifestVersion: BAKE_MANIFEST_VERSION,
        bakedAt: new Date().toISOString(),
        graph: { nodes: trimmedNodes, edges: trimmedEdges },
        surface: trimmedSurface,
        bakeReport: report,
        embeddedConfig,
    }

    return { ok: true, baked }
}

function pickByNodeId<V>(
    map: Record<string, V>,
    keep: Set<string>,
): Record<string, V> {
    const out: Record<string, V> = {}
    for (const [k, v] of Object.entries(map)) if (keep.has(k)) out[k] = v
    return out
}

/** Field keys are `${nodeId}:${paramKey}`. */
function pickFields(
    fields: SupplierConfig['fields'],
    keep: Set<string>,
): SupplierConfig['fields'] {
    const out: SupplierConfig['fields'] = {}
    for (const [k, v] of Object.entries(fields)) {
        const nodeId = k.split(':', 1)[0]
        if (keep.has(nodeId)) out[k] = v
    }
    return out
}

/** Processors whose output genuinely changes at runtime in the player.
 *  Keyed by processor type rather than reading `processor.alwaysDirty` off the
 *  live engine because `bakePipeline` decides what to freeze BEFORE walking the
 *  live engine — we need a static answer per type. The two stay in sync by
 *  convention; if you add a new alwaysDirty processor whose output players
 *  observe at runtime, list it here. */
const RUNTIME_DYNAMIC_PROCESSORS: ReadonlySet<string> = new Set([
    'timer',
    'envelope',
    'combineSignals',
    'signalSwitch',
    'animationController',
    'animationSwitch',
    'eventEmitter',
    'tapZone',
    'effect',
])

function isRuntimeDynamic(processorType: string): boolean {
    return RUNTIME_DYNAMIC_PROCESSORS.has(processorType)
}

function buildAdjacencyMaps(graph: PublishedPipeline['graph']) {
    const incomingEdges = new Map<string, SerializedEdge[]>()
    const outgoingEdges = new Map<string, SerializedEdge[]>()
    for (const e of graph.edges) {
        const inSlot = incomingEdges.get(e.target) ?? []
        inSlot.push(e)
        incomingEdges.set(e.target, inSlot)
        const outSlot = outgoingEdges.get(e.source) ?? []
        outSlot.push(e)
        outgoingEdges.set(e.source, outSlot)
    }
    return { incomingEdges, outgoingEdges }
}

/** Used by demotion — pure boundary node whose output isn't bakeable can't
 *  become a constant source; we keep it live as a regular processor. */
function hasBakeableOutput(node: SerializedNode): boolean {
    const entry = PROCESSOR_CATALOG[node.data.processor]
    if (!entry) return false
    for (const out of entry.def.outputs) {
        if (out.type === 'CONTOUR' || out.type === 'TEXTURE') return true
    }
    return false
}

/** Bake-eligible iff `def.pure === true` OR a `segmentation` whose live instance
 *  reports `hasPolygonOverride` (treated as pure passthrough — polygon is
 *  constant, SAM is bypassed). The latter requires reading the live processor
 *  instance off the engine. */
function isProcessorPureForBake(node: SerializedNode, engine: DataflowEngine): boolean {
    const entry = PROCESSOR_CATALOG[node.data.processor]
    if (!entry) return false
    if (entry.def.pure) return true
    if (node.data.processor === 'segmentation') {
        const proc = engine.getProcessor<SegmentationProcessor>(node.id)
        if (proc && (proc as unknown as { hasPolygonOverride?: boolean }).hasPolygonOverride === true) {
            return true
        }
    }
    return false
}

async function resolveBake(
    engine: DataflowEngine,
    node: SerializedNode,
    options: BakeOptions,
): Promise<{
    nodeId: string
    originalProcessor: string
    replacedNode: SerializedNode
    approxSizeBytes: number
}> {
    const outputs = engine.getOutputs(node.id)
    if (!outputs) {
        throw new Error(`no outputs in cache (engine hasn't ticked this node yet?)`)
    }

    const entry = PROCESSOR_CATALOG[node.data.processor]
    if (!entry) throw new Error(`unknown processor "${node.data.processor}"`)

    /* We bake exactly one output per node — no real-world processor has multiple
       bakeable outputs in different slots, and supporting it would require
       changing BakedAsset to multi-payload. If a future processor needs it,
       add a new BakedAsset kind and revisit. */
    for (const out of entry.def.outputs) {
        const value = outputs[out.name]
        if (value == null) continue
        if (out.type === 'CONTOUR') {
            const c = value as ContourSamples
            const params = serializeContour(c)
            const replacedNode: SerializedNode = {
                ...node,
                data: { processor: 'constantContour', params },
            }
            return {
                nodeId: node.id,
                originalProcessor: node.data.processor,
                replacedNode,
                approxSizeBytes: estimateContourBytes(c),
            }
        }
        if (out.type === 'TEXTURE') {
            if (options.skipTextures) {
                throw new Error('skipTextures: refusing to bake texture-output node')
            }
            const src: any = value
            if (!src || !src.width || !src.height) {
                throw new Error(`texture output not ready (width/height missing)`)
            }
            const dataUrl = await extractTextureToPng(engine, src)
            const params = {
                dataUrl,
                width: src.width as number,
                height: src.height as number,
            }
            const replacedNode: SerializedNode = {
                ...node,
                data: { processor: 'constantTexture', params },
            }
            return {
                nodeId: node.id,
                originalProcessor: node.data.processor,
                replacedNode,
                approxSizeBytes: dataUrl.length,
            }
        }
    }

    throw new Error(`no bakeable output (need CONTOUR or TEXTURE) on ${node.data.processor}`)
}

function serializeContour(c: ContourSamples): Record<string, unknown> {
    return {
        version: 1,
        closed: c.closed,
        count: c.count,
        totalLength: c.totalLength,
        aabb: [c.aabb[0], c.aabb[1], c.aabb[2], c.aabb[3]],
        positions: Array.from(c.positions),
        tangents: Array.from(c.tangents),
        arcS: Array.from(c.arcS),
    }
}

function estimateContourBytes(c: ContourSamples): number {
    /* number[] in JSON: ~12 bytes per element conservatively (digits + comma +
       occasional sign). Three buffers of total size N×5 floats. */
    return c.count * 5 * 12
}

/** Encode a `TextureSource` as a PNG data URL.
 *  Wraps the raw source in a one-shot Texture so it can be fed to
 *  `renderer.extract.base64`. Pixi v8's `ExtractSystem.canvas`/`.base64` are
 *  monkey-patched at engine boot (`pixi-patches.ts`) to destroy the intermediate
 *  RenderTexture they would otherwise leak.
 *
 *  Round-trips RGBA through Canvas2D, which premultiplies on store and
 *  un-premultiplies on read — used to corrupt RGB on `A=0` pixels (`RGB *= 0`,
 *  then `0/0 → 0`). The SDF format was rewritten upstream to keep `A=1`
 *  everywhere (signed distance packed into RGB; see `sdf-pure.ts`), making the
 *  round trip lossless for our texture set. A future bake target putting
 *  semantic data in alpha needs a raw-pixel path (`extract.pixels` → base64 →
 *  `BufferImageSource`) — see git history for an earlier draft. */
async function extractTextureToPng(engine: DataflowEngine, source: any): Promise<string> {
    const { Texture } = await import('pixi.js')
    const tex = new Texture({ source })
    try {
        const renderer: any = engine.app.renderer
        const dataUrl: string = await renderer.extract.base64({ target: tex, format: 'png' })
        return dataUrl
    } finally {
        tex.destroy(false)
    }
}

function reachableFromRoot(
    rootId: string,
    nodes: SerializedNode[],
    edges: SerializedEdge[],
): Set<string> {
    const incoming = new Map<string, string[]>()
    for (const e of edges) {
        const slot = incoming.get(e.target) ?? []
        slot.push(e.source)
        incoming.set(e.target, slot)
    }
    const nodeIds = new Set(nodes.map(n => n.id))
    const reachable = new Set<string>()
    const queue: string[] = [rootId]
    while (queue.length) {
        const id = queue.shift()!
        if (reachable.has(id)) continue
        if (!nodeIds.has(id)) continue
        reachable.add(id)
        const ups = incoming.get(id) ?? []
        for (const u of ups) queue.push(u)
    }
    return reachable
}
