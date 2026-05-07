/* eslint-disable @typescript-eslint/no-explicit-any */
import { Application, Geometry, Mesh, RenderTexture, Shader } from 'pixi.js'
import { DEFAULT_VERTEX } from '../pipeline/default-vertex'
import type { IDataflowEngine } from './types'
import type { BaseProcessor } from './processors/base-processor'
import { PROCESSOR_CATALOG } from './processors'
import { applyPixiExtractLeakPatches } from './pixi-patches'

interface EdgeRecord {
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
}

export class DataflowEngine implements IDataflowEngine {
    readonly app: Application
    readonly defaultWidth = 900
    readonly defaultHeight = 1200

    private processors = new Map<string, BaseProcessor>()
    private nodeParams = new Map<string, Record<string, any>>()
    private outputCache = new Map<string, Record<string, any>>()
    private dirtySet = new Set<string>()
    private topoOrder: string[] = []
    private adjacency = new Map<string, string[]>()
    private targetEdges = new Map<string, EdgeRecord[]>()
    private edges: EdgeRecord[] = []
    private rafId = 0

    /* Cached list of node ids whose processor sets `alwaysDirty = true`.
       Maintained in `addNode` / `removeNode` so the per-tick "mark
       always-dirty" loop doesn't iterate the entire `processors` Map and
       allocate a destructured tuple per entry every frame. */
    private alwaysDirtyIds: string[] = []

    /* Reusable inputs records per nodeId. `gatherInputs` clears keys and
       refills the same object so we don't allocate a fresh `{}` per dirty
       node per tick. Processors must NOT retain the reference across
       `execute` calls — the next tick's `gatherInputs` mutates it. */
    private inputBuffers = new Map<string, Record<string, any>>()

    /* FPS cap. 0 disables gating and lets the engine tick at the browser's
       native rAF cadence. Positive values throttle `tick()` so the editor
       stops melting laptops while the user iterates on parameters. The cap
       only governs how often we *evaluate* the graph; rAF still drives
       compositing of static frames. */
    private targetFps = 0
    private lastTickAt = 0

    private geoCache = new Map<string, Geometry>()
    private nodeListeners = new Map<string, Set<() => void>>()

    constructor(app: Application) {
        /* Patch Pixi v8's known extract-system leak before any
           processor has a chance to call `extract.canvas` /
           `extract.base64` (Segmentation, Preview, future processors).
           Idempotent — the patch carries its own one-shot flag, so
           multiple engines on the same page (editor + supplier in dev)
           apply it exactly once. */
        applyPixiExtractLeakPatches()
        this.app = app
    }

    /* ── Node lifecycle ── */

    addNode(nodeId: string, processorType: string, initialParams?: Record<string, any>): void {
        const entry = PROCESSOR_CATALOG[processorType]
        if (!entry) { console.warn(`Unknown processor type: ${processorType}`); return }
        const proc = entry.create()
        proc.nodeId = nodeId
        this.processors.set(nodeId, proc)
        this.nodeParams.set(nodeId, initialParams ?? { ...entry.def.defaultParams })
        if (proc.alwaysDirty) this.alwaysDirtyIds.push(nodeId)
        this.rebuildGraph()
    }

    removeNode(nodeId: string): void {
        const proc = this.processors.get(nodeId)
        proc?.destroy()
        this.processors.delete(nodeId)
        this.nodeParams.delete(nodeId)
        this.outputCache.delete(nodeId)
        this.dirtySet.delete(nodeId)
        this.inputBuffers.delete(nodeId)
        const adIdx = this.alwaysDirtyIds.indexOf(nodeId)
        if (adIdx !== -1) this.alwaysDirtyIds.splice(adIdx, 1)
        /* Subscribers are bound to the node *id*, not to a processor instance.
           applySnapshot() (undo/redo) tears down every node and immediately
           re-adds the same ids; the React views stay mounted with stable
           [engine, id] deps so their subscribe-effect never re-fires. If we
           dropped the listener set here, the re-added processor's outputs
           would publish into an empty set and previews / metrics / output-
           reading widgets would freeze on the pre-undo frame. The set is
           cleaned up by the unsubscribe closure once it goes empty. */
        this.rebuildGraph()
    }

    updateNodeParams(nodeId: string, params: Record<string, any>): void {
        this.nodeParams.set(nodeId, params)
        this.markDirty(nodeId)
    }

    getNodeParams(nodeId: string): Record<string, any> {
        return this.nodeParams.get(nodeId) ?? {}
    }

    getProcessor<T extends BaseProcessor>(nodeId: string): T | undefined {
        return this.processors.get(nodeId) as T | undefined
    }

    /* ── Edges / graph topology ── */

    setEdges(edges: Array<{ source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }>): void {
        this.edges = edges.map(e => ({
            source: e.source,
            sourceHandle: e.sourceHandle ?? '',
            target: e.target,
            targetHandle: e.targetHandle ?? '',
        }))
        this.rebuildGraph()
    }

    private rebuildGraph(): void {
        this.adjacency.clear()
        this.targetEdges.clear()

        for (const e of this.edges) {
            if (!this.processors.has(e.source) || !this.processors.has(e.target)) continue
            const adj = this.adjacency.get(e.source)
            if (adj) adj.push(e.target)
            else this.adjacency.set(e.source, [e.target])

            const te = this.targetEdges.get(e.target)
            const rec = { ...e }
            if (te) te.push(rec)
            else this.targetEdges.set(e.target, [rec])
        }

        // Kahn's topological sort
        const inDegree = new Map<string, number>()
        for (const id of this.processors.keys()) inDegree.set(id, 0)
        for (const e of this.edges) {
            if (!this.processors.has(e.source) || !this.processors.has(e.target)) continue
            inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
        }

        const queue: string[] = []
        for (const [id, deg] of inDegree) {
            if (deg === 0) queue.push(id)
        }

        this.topoOrder = []
        while (queue.length) {
            const id = queue.shift()!
            this.topoOrder.push(id)
            for (const child of this.adjacency.get(id) ?? []) {
                const nd = (inDegree.get(child) ?? 1) - 1
                inDegree.set(child, nd)
                if (nd === 0) queue.push(child)
            }
        }

        // Mark everything dirty after structure change
        for (const id of this.processors.keys()) this.dirtySet.add(id)
    }

    /* ── Dirty propagation ── */

    markDirty(nodeId: string): void {
        /* BFS via index pointer instead of `queue.shift()` (which is O(N)
           per pop and shows up on graphs with high fan-out — e.g. an
           AnimationController feeding 8 channels into multiple Effect
           nodes). The visited check via `dirtySet` keeps the traversal
           linear in the number of reachable nodes. */
        const queue = [nodeId]
        for (let head = 0; head < queue.length; head++) {
            const id = queue[head]
            if (this.dirtySet.has(id)) continue
            this.dirtySet.add(id)
            const adj = this.adjacency.get(id)
            if (!adj) continue
            for (let i = 0; i < adj.length; i++) queue.push(adj[i])
        }
    }

    /* ── Input gathering ── */

    private gatherInputs(nodeId: string): Record<string, any> {
        /* Reuse a per-node inputs object — avoids one `{}` allocation per
           dirty node per tick. We delete keys instead of overwriting so a
           handle that became unwired in this tick doesn't leak the
           previous tick's value into `execute(inputs, ...)`. */
        let inputs = this.inputBuffers.get(nodeId)
        if (!inputs) {
            inputs = {}
            this.inputBuffers.set(nodeId, inputs)
        } else {
            for (const k in inputs) delete inputs[k]
        }
        const edges = this.targetEdges.get(nodeId)
        if (!edges) return inputs
        for (let i = 0; i < edges.length; i++) {
            const e = edges[i]
            const srcOut = this.outputCache.get(e.source)
            if (srcOut && e.sourceHandle in srcOut) {
                inputs[e.targetHandle] = srcOut[e.sourceHandle]
            }
        }
        return inputs
    }

    /* ── Output access ── */

    getOutputs(nodeId: string): Record<string, any> | undefined {
        return this.outputCache.get(nodeId)
    }

    /* ── Render helpers (GPU) ── */

    renderPass(fragment: string, resources: Record<string, unknown>, w?: number, h?: number): RenderTexture {
        const rw = w ?? this.defaultWidth
        const rh = h ?? this.defaultHeight
        const rt = RenderTexture.create({ width: rw, height: rh, scaleMode: 'linear' })
        this.renderPassInto(rt, fragment, resources)
        return rt
    }

    renderPassInto(target: RenderTexture, fragment: string, resources: Record<string, unknown>): void {
        const rw = target.width
        const rh = target.height
        const geo = this.getQuadGeometry(rw, rh)
        const quad = new Mesh({
            geometry: geo,
            shader: Shader.from({
                gl: { vertex: DEFAULT_VERTEX, fragment },
                resources: resources as any,
            }),
        })
        quad.width = rw
        quad.height = rh
        this.app.renderer.render({ container: quad, target, clear: true })
        quad.destroy()
    }

    /**
     * Shared fullscreen quad geometry keyed by (w, h). Cached on the engine
     * so processors that render their own fullscreen passes (currently
     * `EffectProcessor`'s fullscreen passes) don't each maintain a private
     * quad allocation. Caller must NOT destroy the returned Geometry — the
     * engine owns it and disposes in `destroy()`.
     */
    getQuadGeometry(w: number, h: number): Geometry {
        const key = `${w}x${h}`
        let geo = this.geoCache.get(key)
        if (!geo) {
            geo = new Geometry({
                attributes: {
                    aPosition: [0, 0, w, 0, w, h, 0, h],
                    aUV: [0, 0, 1, 0, 1, 1, 0, 1],
                },
                indexBuffer: [0, 1, 2, 0, 2, 3],
            })
            this.geoCache.set(key, geo)
        }
        return geo
    }

    /* ── Subscriber system for React components ── */

    subscribeNode(nodeId: string, cb: () => void): () => void {
        if (!this.nodeListeners.has(nodeId)) this.nodeListeners.set(nodeId, new Set())
        this.nodeListeners.get(nodeId)!.add(cb)
        return () => {
            const set = this.nodeListeners.get(nodeId)
            if (!set) return
            set.delete(cb)
            /* Drop the empty entry so a permanently-removed node doesn't
               leave a dangling Set behind. Re-add at the same id (undo/redo)
               recreates the entry on the next subscribe call. */
            if (set.size === 0) this.nodeListeners.delete(nodeId)
        }
    }

    private notifyNode(nodeId: string): void {
        this.nodeListeners.get(nodeId)?.forEach(cb => cb())
    }

    /* ── Main loop ── */

    /**
     * Cap how often the dataflow graph is re-evaluated. `fps <= 0` removes
     * the cap. The cap is purely temporal — alwaysDirty processors still
     * get evaluated on every accepted frame, so dropping fps directly
     * reduces work proportionally.
     */
    setTargetFps(fps: number): void {
        const next = Number.isFinite(fps) && fps > 0 ? Math.floor(fps) : 0
        if (next === this.targetFps) return
        this.targetFps = next
        /* Reset the gate so a new cap takes effect on the very next frame
           rather than waiting out the previous interval. */
        this.lastTickAt = 0
    }

    start(): void {
        const tick = () => {
            if (this.targetFps > 0) {
                const now = performance.now()
                /* Subtract a small slack so a 60fps cap doesn't drop every
                   other frame to 30fps because of rAF jitter. */
                const minInterval = 1000 / this.targetFps - 0.5
                if (now - this.lastTickAt < minInterval) {
                    this.rafId = requestAnimationFrame(tick)
                    return
                }
                this.lastTickAt = now
            }
            this.tick()
            this.rafId = requestAnimationFrame(tick)
        }
        this.rafId = requestAnimationFrame(tick)
    }

    stop(): void {
        if (this.rafId) cancelAnimationFrame(this.rafId)
        this.rafId = 0
    }

    private tick(): void {
        // 1. Mark always-dirty nodes (cached id list — no Map iteration / tuple alloc)
        for (let i = 0; i < this.alwaysDirtyIds.length; i++) {
            this.markDirty(this.alwaysDirtyIds[i])
        }

        // 2. Nothing to do?
        if (this.dirtySet.size === 0) return

        // 3. Execute dirty nodes in topological order
        for (const id of this.topoOrder) {
            if (!this.dirtySet.has(id)) continue
            const proc = this.processors.get(id)
            if (!proc) continue
            const inputs = this.gatherInputs(id)
            const params = this.nodeParams.get(id) ?? {}

            try {
                const outputs = proc.execute(inputs, params, this)
                /* Reference-stabilising diff: when an alwaysDirty
                   processor re-runs but produces output that's value-
                   equal to the previous tick (paused Timer, idle
                   Envelope, AnimationController whose channels didn't
                   move), keep the previous reference in `outputCache`
                   instead of overwriting with the new (equal) one.
                   This way `useNodeOutputs` / downstream Object.is
                   checks see a stable reference and React's useState
                   bail-outs prevent re-renders.
                   We still ALWAYS call notifyNode — some processors
                   (Preview, ContourPreview, Segmentation, ...) hold
                   live state on `this` (e.g. `proc.imgCanvas` whose
                   bitmap content changes without the canvas reference
                   changing) and rely on the view's subscribe callback
                   firing every tick to copy that state into the DOM.
                   Skipping notify here would freeze those previews. */
                const prev = this.outputCache.get(id)
                if (!prev || !outputsEqual(prev, outputs)) {
                    this.outputCache.set(id, outputs)
                }
                this.notifyNode(id)
            } catch (e) {
                console.warn(`[DataflowEngine] Error executing ${proc.def.type} (${id}):`, e)
            }
        }

        // 4. Clear
        this.dirtySet.clear()
    }

    /* ── Cleanup ── */

    destroy(): void {
        this.stop()
        for (const proc of this.processors.values()) proc.destroy()
        this.processors.clear()
        this.outputCache.clear()
        for (const geo of this.geoCache.values()) geo.destroy()
        this.geoCache.clear()
        /* Drop every other piece of graph state too. Without this, late
           `subscribeNode` unsubscribes still reach into stale `Set<cb>`
           closures, and React-side `setState` callbacks pinned by
           subscribers keep node output objects alive long after the
           engine has been torn down (HMR / route remount scenarios). */
        this.nodeListeners.clear()
        this.nodeParams.clear()
        this.adjacency.clear()
        this.targetEdges.clear()
        this.dirtySet.clear()
        this.inputBuffers.clear()
        this.alwaysDirtyIds.length = 0
        this.edges = []
        this.topoOrder = []
    }
}

/**
 * Recursive content-equality check used by the engine's diff-gated
 * notification path. Designed for processor `outputs` records that mostly
 * carry primitives, plain `{}` packets (Signal / ChannelSignal /
 * AnimationSignal / EventSignal / EffectMetrics / PassMetric[]), and
 * opaque GPU resources (Pixi `RenderTexture` / `TextureSource`,
 * `ContourSamples` Float32Arrays).
 *
 * Equality rules:
 *   - `Object.is` short-circuit handles primitives + identical references
 *     (the common case when a processor caches its output).
 *   - Recursion is allowed only into PLAIN objects and Arrays. Anything
 *     with a non-Object prototype (TypedArrays, Maps, Pixi instances,
 *     ContourSamples…) is treated as opaque and compared by reference
 *     only. This keeps the walk cheap and prevents accidental deep
 *     traversal of huge GPU buffers.
 *   - Depth is capped at MAX_DIFF_DEPTH (deep enough to cover
 *     `outputs.animation.channels['0'].value` = 4 hops).
 */
const MAX_DIFF_DEPTH = 6

function outputsEqual(a: unknown, b: unknown, depth = 0): boolean {
    if (Object.is(a, b)) return true
    if (depth >= MAX_DIFF_DEPTH) return false
    if (!isPlainContainer(a) || !isPlainContainer(b)) return false
    const aArr = Array.isArray(a)
    const bArr = Array.isArray(b)
    if (aArr !== bArr) return false
    if (aArr) {
        const arrA = a as unknown[]
        const arrB = b as unknown[]
        if (arrA.length !== arrB.length) return false
        for (let i = 0; i < arrA.length; i++) {
            if (!outputsEqual(arrA[i], arrB[i], depth + 1)) return false
        }
        return true
    }
    const objA = a as Record<string, unknown>
    const objB = b as Record<string, unknown>
    const aKeys = Object.keys(objA)
    if (aKeys.length !== Object.keys(objB).length) return false
    for (let i = 0; i < aKeys.length; i++) {
        const k = aKeys[i]
        if (!(k in objB)) return false
        if (!outputsEqual(objA[k], objB[k], depth + 1)) return false
    }
    return true
}

function isPlainContainer(v: unknown): boolean {
    if (v === null || typeof v !== 'object') return false
    if (Array.isArray(v)) return true
    return Object.getPrototypeOf(v) === Object.prototype
}
