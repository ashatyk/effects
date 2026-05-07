/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Constant-folding pass for `PublishedPipeline + SupplierConfig` →
 * `BakedPipeline`.
 *
 * Runs in the **supplier app** at config-export time, against the
 * supplier's already-spinning `DataflowEngine` (the same one that
 * drives the form's preview canvas — it has live `outputCache`
 * entries for every node).
 *
 * Algorithm:
 *
 *   1. Apply the SupplierConfig to the live engine and tick at
 *      least once so every reachable node has run at least once and
 *      its output is in `engine.outputCache`. (Caller's
 *      responsibility — we assume the engine is steady-state.)
 *
 *   2. Compute the **tainted set** (runtime-dynamic): forward BFS
 *      from every node whose processor type is in
 *      `RUNTIME_DYNAMIC_PROCESSORS` (timer, envelope,
 *      animationController, eventEmitter, tapZone, effect, ...).
 *      Anything reachable downstream is also tainted — a static
 *      processor that consumes a runtime signal is itself runtime-
 *      dependent.
 *
 *      The user-facing rule: "collapse every path that doesn't
 *      terminate in an event-emitting / time-driven node." Tainted
 *      = NOT collapsible.
 *
 *   3. Compute the **frozen set**: a node is frozen iff
 *        a. its processor `def.pure === true` (or it's a
 *           `segmentation` whose live processor reports
 *           `hasPolygonOverride === true` — that's the bake-eligible
 *           branch, see `segmentation.ts`),
 *        b. it is NOT in the tainted set,
 *        c. every one of its inputs comes from a frozen node.
 *      Compute by forward BFS: seed with `pure && not-tainted &&
 *      no inputs` processors, propagate forward.
 *
 *      Note that `exposed` flags from `pipeline.surface`
 *      (imageSlots / wholeNodes / fields) DO NOT block freezing.
 *      `exposed` is purely a supplier-app authoring-time concern;
 *      the supplier picks the picture / sets SAM points / tweaks
 *      fields, the bake snapshots the result, and the player
 *      receives a frozen subgraph. If a future use-case needs
 *      live editing in the player itself, we'll add an explicit
 *      `runtimeMutable` flag rather than re-overloading `exposed`.
 *
 *   4. For every frozen node, classify its bakeable output:
 *        - one of `outputs[].type === 'CONTOUR'` → `BakedAsset.kind = 'contour'`.
 *        - one of `outputs[].type === 'TEXTURE'` → `BakedAsset.kind = 'texture'`.
 *      Read the live `outputCache[nodeId]`. Serialise:
 *        - contour: ContourSamples Float32Arrays → number[].
 *        - texture: `renderer.extract.base64(textureSource)` →
 *          PNG dataUrl. The PNG round-trip via Canvas2D used to
 *          be lossy on `A=0` pixels (Canvas2D internally
 *          premultiplies → `toDataURL` un-premultiplies → `0/0 →
 *          0`); the SDF format was rewritten to keep `A=1`
 *          everywhere and pack signed distance into RGB (see
 *          `pipeline/passes/sdf-pure.ts`), which makes the round
 *          trip lossless. Texture extraction is async — the whole
 *          bake function is async because of this.
 *
 *   5. Build the **trimmed graph**:
 *        a. For each frozen node, replace it with a
 *           `constantContour` or `constantTexture` node carrying
 *           the baked payload as `data.params`. Same `id`,
 *           `position`, `width/height` — only `data.processor` and
 *           `data.params` change.
 *        b. Drop every edge whose `target` is a frozen node
 *           (constant-source has no input handles).
 *        c. Reverse-BFS from `publishRoot`. Keep only reachable
 *           nodes. Anything that survived the trim but no longer
 *           reaches publishRoot (e.g. an `image` that fed only a
 *           baked `segmentation`) is dead code — drop it.
 *
 *   6. Build the **trimmed surface**: filter `pipeline.surface.*`
 *      to entries whose `nodeId` is still in the trimmed graph.
 *      Image slots / whole-nodes that pointed at frozen subgraphs
 *      disappear (the supplier-facing UI concern is moot — the
 *      data is baked in).
 *
 *   7. Return `BakedPipeline`.
 *
 * Edge cases handled:
 *
 *   - **Async texture extraction** waits for every PNG dataUrl
 *     before returning. If the engine's output texture isn't
 *     ready yet (e.g. `image.execute` fired its async `Assets.load`
 *     this tick and hasn't resolved), the bake function fails
 *     fast for that node — caller can retry after a few more ticks.
 *   - **Loops in the graph** (shouldn't happen — engine rejects
 *     cycles — but defensive). Forward BFS only marks a node
 *     frozen when it visits it, so a cycle stays unmarked.
 *   - **Unknown processor types** (manifest version drift) — the
 *     processor lookup falls back to "treat as not pure", node
 *     stays in the trimmed graph live.
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
    /** Skip the texture-baking step. Useful for tests / debugging
     *  where you want to verify the contour-baking path without
     *  paying the GPU readback + base64 encoding cost. */
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
 * Bake a `PublishedPipeline + SupplierConfig` into a self-contained
 * `BakedPipeline`. Async because texture baking goes through
 * `renderer.extract.base64(...)` which reads pixels back from GPU.
 *
 * **Precondition**: `engine` must already have the SupplierConfig
 * applied (`applyAllOverrides(engine, pipeline, config)`) and have
 * ticked at least once so every reachable processor has produced its
 * first output. The supplier app's preview canvas already does both
 * by the time the user clicks "Export baked".
 */
export async function bakePipeline(
    engine: DataflowEngine,
    pipeline: PublishedPipeline,
    config: SupplierConfig,
    options: BakeOptions = {},
): Promise<BakeResult | BakeError> {
    const adjacency = buildAdjacencyMaps(pipeline.graph)

    /* Determine the **tainted set**: nodes whose output is genuinely
       runtime-dynamic in the player. Anything reachable downstream
       from a tainted node is also tainted (a static processor that
       eats a runtime signal becomes runtime-dependent itself).
       Everything **outside** the tainted set is a freeze candidate.
       
       Tainted seeds are the only nodes that genuinely change at
       runtime in the player:
         - alwaysDirty processors that own time, events, or
           accumulating state (timer, envelope, combineSignals,
           signalSwitch, animationController, animationSwitch,
           eventEmitter, tapZone);
         - the Effect output itself (alwaysDirty, composites every
           tick).
       
       Note what is NOT in this list:
         - `image` exposed in `imageSlots` — supplier picks the
           picture in the supplier app, but the .baked.json carries
           that exact picture; player doesn't swap it.
         - `segmentation` exposed as `wholeNode` — same logic.
         - `text` / `config` fields exposed — supplier-authored
           values are baked-in. (If a future use-case needs live
           swap of text/image in the player, we'll add an explicit
           `runtimeMutable` flag rather than overloading `exposed`.)
       
       This is the user-requested rule: collapse every path that
       doesn't terminate in an event-emitting / time-driven node. */
    const taintedSeeds: string[] = []
    for (const node of pipeline.graph.nodes) {
        if (isRuntimeDynamic(node.data.processor)) taintedSeeds.push(node.id)
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

    /* Frozen = pure (or segmentation+polygon) AND not tainted AND
       every input is also frozen. Forward BFS from inputs-free
       leaves, mirroring the previous algorithm but with the taint
       check replacing the exposed check. */
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

    /* Identify the **bake boundary**: frozen nodes that have at
       least one non-frozen consumer. Interior frozen nodes (every
       downstream also frozen) are unreachable from publishRoot
       through dynamic edges and will be dropped by the reverse-BFS
       trim later — no need to bake them.
       
       Demotion pass: a boundary node whose output type is NOT
       bakeable (TEXTURE / CONTOUR) can't become a constant source.
       We demote it from `frozen` and propagate — any frozen X that
       relied on this demoted node as input is now no longer
       all-inputs-frozen, so X demotes too. Iterate to fixed point.
       
       Real-world example: `text` (output: TEXT) → `textStrip`
       (output: TEXTURE). If `textStrip` is exposed (and thus not
       frozen), `text` becomes a frozen boundary with a non-bakeable
       output — demote `text`, leave it in the graph as a cheap
       live processor. If `textStrip` is also frozen, `text` is
       interior and gets trimmed. */
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
        /* After demotion, re-run forward BFS once more to propagate:
           any node that was frozen because all inputs frozen may now
           have a non-frozen input. Cheap because frozen set already
           shrunk. */
        for (const id of [...frozen]) {
            const incoming = adjacency.incomingEdges.get(id) ?? []
            const allFrozen = incoming.every(ie => frozen.has(ie.source))
            if (!allFrozen) frozen.delete(id)
        }
    }

    /* Final boundary set after demotion — these are the only nodes
       we actually bake. Interior frozen nodes are NOT in this set;
       they remain in `frozen` for trim purposes (their downstream
       baked nodes don't need them) but resolveBake skips them. */
    const bakeTargets = new Set<string>()
    for (const id of frozen) {
        const downstreams = adjacency.outgoingEdges.get(id) ?? []
        const isBoundary = downstreams.some(e => !frozen.has(e.target))
        if (isBoundary) bakeTargets.add(id)
    }

    /* Resolve each bake-target's output → BakedAsset. Async because
       texture extraction is async. Collect all promises first then
       await — parallel rather than serial. */
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

    /* Build the trimmed graph:
        - Replace every baked node in-place with its constant
          equivalent, AND remember (originalHandle → constantHandle)
          mappings so we can rewrite edges that reference the
          original node's output by name.
        - Drop edges that target a bake target (constants have no
          input handles).
        - Rewrite edges whose source is a bake target so the
          `sourceHandle` matches the constant processor's output
          name ('contour' or 'texture'). E.g. `sdfFromContour`
          exports `outputs: [{ name: 'sdf' }]` but
          `constantTexture` exports `outputs: [{ name: 'texture' }]`;
          without rewriting, downstream consumers' `gatherInputs`
          would silently miss the upstream value and render black.
        - Reverse-BFS from publishRoot — keep only reachable. */
    const replacedById = new Map<string, SerializedNode>()
    /* Per-baked-node: name of the output handle on the constant
       processor that replaced it. Always 'contour' or 'texture'
       since those are the only two constant types. */
    const constantOutputName = new Map<string, 'contour' | 'texture'>()
    for (const r of resolved) {
        replacedById.set(r.nodeId, r.replacedNode)
        constantOutputName.set(
            r.nodeId,
            r.replacedNode.data.processor === 'constantContour' ? 'contour' : 'texture',
        )
    }

    const allNodes = pipeline.graph.nodes.map(n => replacedById.get(n.id) ?? n)
    /* Drop edges whose target is a bake target — the constant source
       node has no input handles. Interior frozen nodes (in `frozen`
       but not in `bakeTargets`) keep their edges; they'll be removed
       by reverse-BFS from publishRoot below as dead code. */
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

    /* Build trimmed surface. Each surface entry's nodeId must still
       exist in the trimmed graph; otherwise it's dead and the
       supplier's UI must NOT pretend it's tunable. */
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

    /* Trim the embedded SupplierConfig to entries that survived the
       trim — entries pointing at nodes that got baked away would be
       no-ops at apply time (the constant has no input handles), so
       drop them from the snapshot to keep the artifact lean. */
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

/** Field keys are `${nodeId}:${paramKey}`; keep only those whose
 *  nodeId still exists in the trimmed graph. */
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

/* ───────── Helpers ───────── */

/** Processors whose output genuinely changes at runtime in the
 *  player. Used as taint seeds in `bakePipeline` — anything
 *  reachable downstream of a runtime-dynamic node inherits the
 *  taint and stays live in the trimmed graph.
 *
 *  All other processors (image, segmentation, contourResample,
 *  sdfFromContour, blur, remap, blend, denoise, text, textStyle,
 *  textStrip, config, ...) are treated as authoring-time mutable
 *  but baked-frozen: supplier picks values in the supplier app,
 *  the bake snapshots the outputCache, and the player ships a
 *  trimmed graph where that whole subgraph collapsed to a single
 *  constantContour / constantTexture node.
 *
 *  This is keyed by processor type rather than reading
 *  `processor.alwaysDirty` off the live engine because
 *  `bakePipeline` decides what to freeze BEFORE walking the live
 *  engine — we need a static answer per type. The two stay in
 *  sync by convention; if you add a new alwaysDirty processor
 *  whose output players observe at runtime, list it here. */
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

/** True iff the node has at least one output of a bake-supported
 *  slot type (CONTOUR or TEXTURE). Used by the demotion pass: a
 *  pure boundary node whose output isn't bakeable can't become a
 *  constant source — we keep it live as a regular processor. */
function hasBakeableOutput(node: SerializedNode): boolean {
    const entry = PROCESSOR_CATALOG[node.data.processor]
    if (!entry) return false
    for (const out of entry.def.outputs) {
        if (out.type === 'CONTOUR' || out.type === 'TEXTURE') return true
    }
    return false
}

/** A processor is bake-eligible iff its `def.pure === true` OR it's
 *  a `segmentation` whose live instance reports
 *  `hasPolygonOverride` (we treat that as a pure passthrough — the
 *  polygon is constant, SAM is bypassed). The latter check requires
 *  reading the live processor instance off the engine. */
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

    /* Find the first bakeable output by SLOT type. We bake exactly
       one output per node — there's no real-world processor with
       multiple bakeable outputs in different slots, and supporting
       it would require changing the BakedAsset shape (multi-payload
       per node). If a future processor needs it, add a new
       BakedAsset kind and revisit. */
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
    /* number[] in JSON: ~12 bytes per element conservatively
       (digits + comma + occasional sign). Three buffers of total
       size N×5 floats. */
    return c.count * 5 * 12
}

/** Encode the contents of a `TextureSource` as a PNG data URL.
 *
 *  Wraps the raw `TextureSource` in a one-shot `Texture` so it
 *  can be fed to `renderer.extract.base64`. Pixi v8's
 *  `ExtractSystem.canvas` / `.base64` are monkey-patched at
 *  engine boot (`packages/runtime/src/node-engine/pixi-patches.ts`)
 *  to destroy the intermediate `RenderTexture` they would
 *  otherwise leak — the same patch covers our extract here.
 *
 *  Note: this round-trips RGBA through Canvas2D, which premultiplies
 *  on store and un-premultiplies on read. That used to corrupt RGB
 *  on `A=0` pixels (`RGB *= 0`, then `0/0 → 0`). The SDF format
 *  was rewritten upstream to keep `A=1` everywhere (signed distance
 *  packed into RGB, see `pipeline/passes/sdf-pure.ts`), which makes
 *  the round trip lossless for our texture set. If a future
 *  bake-target output puts semantic data in alpha and needs
 *  arbitrary `A` values, we'll need to switch to a raw-pixel path
 *  (`extract.pixels` → base64 → `BufferImageSource`) — see git
 *  history for an earlier draft of that approach. */
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
