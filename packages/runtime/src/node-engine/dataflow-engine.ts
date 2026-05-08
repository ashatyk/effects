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

    /* Cached id list to avoid Map iteration + tuple alloc in the per-tick
       always-dirty loop. Maintained in addNode / removeNode. */
    private alwaysDirtyIds: string[] = []

    /* Reusable per-node inputs record. gatherInputs clears keys and refills
       the same object — processors MUST NOT retain the reference across
       execute() calls; the next tick mutates it in place. */
    private inputBuffers = new Map<string, Record<string, any>>()

    /* FPS cap. 0 disables gating. Positive values throttle tick() — only
       graph evaluation; rAF still drives compositing of static frames. */
    private targetFps = 0
    private lastTickAt = 0

    private geoCache = new Map<string, Geometry>()
    private nodeListeners = new Map<string, Set<() => void>>()

    constructor(app: Application) {
        /* Patch Pixi v8 extract leak before any processor calls extract.*.
           Idempotent (one-shot flag) so multiple engines on the same page
           (editor + supplier in dev) apply it exactly once. */
        applyPixiExtractLeakPatches()
        this.app = app
    }

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
        /* Subscribers are bound to node *id*, not the processor instance —
           applySnapshot() (undo/redo) re-adds the same id and React views
           keep their existing [engine, id] subscription. Dropping the
           listener set here would freeze previews after undo. The set is
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

        // structure change invalidates every cached output
        for (const id of this.processors.keys()) this.dirtySet.add(id)
    }

    markDirty(nodeId: string): void {
        /* BFS via index pointer instead of queue.shift() — shift() is O(N)
           per pop and shows up on high fan-out graphs (AnimationController
           → 8 channels → multiple Effects). */
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

    private gatherInputs(nodeId: string): Record<string, any> {
        /* Reuse the per-node buffer; delete keys (don't just overwrite) so
           a handle that became unwired this tick doesn't leak the previous
           tick's value into execute(). */
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

    getOutputs(nodeId: string): Record<string, any> | undefined {
        return this.outputCache.get(nodeId)
    }

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

    /** Shared fullscreen quad geometry keyed by (w, h). Engine-owned —
     *  caller must NOT destroy. Disposed in destroy(). */
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

    subscribeNode(nodeId: string, cb: () => void): () => void {
        if (!this.nodeListeners.has(nodeId)) this.nodeListeners.set(nodeId, new Set())
        this.nodeListeners.get(nodeId)!.add(cb)
        return () => {
            const set = this.nodeListeners.get(nodeId)
            if (!set) return
            set.delete(cb)
            // drop empty entry so permanently-removed nodes don't leak Sets
            if (set.size === 0) this.nodeListeners.delete(nodeId)
        }
    }

    private notifyNode(nodeId: string): void {
        this.nodeListeners.get(nodeId)?.forEach(cb => cb())
    }

    /** Cap graph re-evaluation rate. fps <= 0 disables the cap. */
    setTargetFps(fps: number): void {
        const next = Number.isFinite(fps) && fps > 0 ? Math.floor(fps) : 0
        if (next === this.targetFps) return
        this.targetFps = next
        // reset gate so a new cap takes effect on the next frame
        this.lastTickAt = 0
    }

    start(): void {
        const tick = () => {
            if (this.targetFps > 0) {
                const now = performance.now()
                /* Slack of 0.5ms so a 60fps cap doesn't drop every other
                   frame to 30fps because of rAF jitter. */
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
        for (let i = 0; i < this.alwaysDirtyIds.length; i++) {
            this.markDirty(this.alwaysDirtyIds[i])
        }

        if (this.dirtySet.size === 0) return

        for (const id of this.topoOrder) {
            if (!this.dirtySet.has(id)) continue
            const proc = this.processors.get(id)
            if (!proc) continue
            const inputs = this.gatherInputs(id)
            const params = this.nodeParams.get(id) ?? {}

            try {
                const outputs = proc.execute(inputs, params, this)
                /* Reference-stabilising diff: keep the previous reference
                   when value-equal so downstream Object.is checks stay
                   stable (paused Timer, idle Envelope, etc.). notifyNode
                   ALWAYS fires — Preview/ContourPreview/Segmentation
                   mutate live state on `this` whose canvas reference
                   doesn't change between ticks. */
                const prev = this.outputCache.get(id)
                if (!prev || !outputsEqual(prev, outputs)) {
                    this.outputCache.set(id, outputs)
                }
                this.notifyNode(id)
            } catch (e) {
                console.warn(`[DataflowEngine] Error executing ${proc.def.type} (${id}):`, e)
            }
        }

        this.dirtySet.clear()
    }

    destroy(): void {
        this.stop()
        for (const proc of this.processors.values()) proc.destroy()
        this.processors.clear()
        this.outputCache.clear()
        for (const geo of this.geoCache.values()) geo.destroy()
        this.geoCache.clear()
        /* Drop the rest of the graph state — without this, late
           subscribeNode unsubscribes reach into stale Set<cb> closures and
           React-pinned outputs survive engine teardown (HMR / remount). */
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
 * Diff-gating equality for processor outputs. Recurses only into plain
 * objects/arrays — TypedArrays, Maps, Pixi instances, ContourSamples are
 * opaque (compared by reference) to avoid walking huge GPU buffers. Depth
 * cap covers outputs.animation.channels['0'].value (4 hops).
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
