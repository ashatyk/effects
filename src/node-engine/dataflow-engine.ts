/* eslint-disable @typescript-eslint/no-explicit-any */
import { Application, Geometry, Mesh, RenderTexture, Shader } from 'pixi.js'
import { DEFAULT_VERTEX } from '../pipeline/default-vertex'
import type { IDataflowEngine } from './types'
import type { BaseProcessor } from './processors/base-processor'
import { PROCESSOR_CATALOG } from './processors'

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
        this.rebuildGraph()
    }

    removeNode(nodeId: string): void {
        const proc = this.processors.get(nodeId)
        proc?.destroy()
        this.processors.delete(nodeId)
        this.nodeParams.delete(nodeId)
        this.outputCache.delete(nodeId)
        this.dirtySet.delete(nodeId)
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
        const queue = [nodeId]
        while (queue.length) {
            const id = queue.shift()!
            if (this.dirtySet.has(id)) continue
            this.dirtySet.add(id)
            for (const child of this.adjacency.get(id) ?? []) {
                queue.push(child)
            }
        }
    }

    /* ── Input gathering ── */

    private gatherInputs(nodeId: string): Record<string, any> {
        const inputs: Record<string, any> = {}
        for (const e of this.targetEdges.get(nodeId) ?? []) {
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
        const geo = this.getGeometry(rw, rh)
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

    private getGeometry(w: number, h: number): Geometry {
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
        // 1. Mark always-dirty nodes
        for (const [id, proc] of this.processors) {
            if (proc.alwaysDirty) this.markDirty(id)
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
                this.outputCache.set(id, outputs)
            } catch (e) {
                console.warn(`[DataflowEngine] Error executing ${proc.def.type} (${id}):`, e)
            }

            this.notifyNode(id)

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
        this.edges = []
        this.topoOrder = []
    }
}
