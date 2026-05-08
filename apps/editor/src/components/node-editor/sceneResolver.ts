import type { Edge, Node, Viewport } from '@xyflow/react'
import type { PipelineNodeData } from './constants'

export type PNode = Node<PipelineNodeData>

// Pages are UI-only; engine sees the union of non-clone nodes with clone-source edges rewritten.
export interface PageState {
    id: string                 // 'p_<int>'
    name: string               // user-given; defaults to 'Main'
    nodes: PNode[]
    edges: Edge[]
    viewport?: Viewport
}

export function findOriginAcrossPages(
    pages: PageState[],
    cloneOfId: string,
): { node: PNode; pageId: string } | null {
    if (!cloneOfId) return null
    for (const page of pages) {
        for (const n of page.nodes) {
            if (n.id !== cloneOfId) continue
            // Defence-in-depth: never follow chains of clones (AddNodePopover already filters them out).
            if (n.data.cloneOf) return null
            return { node: n, pageId: page.id }
        }
    }
    return null
}

// Flatten multi-page UI scene → (nodes, edges) for the engine. Clones and frames are stripped;
// edges from clones are rewritten to point at their origin; edges with missing endpoints are dropped.
export function resolveSceneForEngine(pages: PageState[]): {
    realNodes: PNode[]
    resolvedEdges: Edge[]
} {
    const realById = new Map<string, PNode>()
    const cloneToOrigin = new Map<string, string>()
    // Index real (non-clone, non-frame) nodes and clone→origin lookup. Frames are UI-only markup.
    for (const page of pages) {
        for (const n of page.nodes) {
            if (n.data.cloneOf) {
                cloneToOrigin.set(n.id, n.data.cloneOf)
                continue
            }
            if (n.data.processor === 'frame') continue
            if (!realById.has(n.id)) realById.set(n.id, n)
        }
    }
    const resolvedEdges: Edge[] = []
    for (const page of pages) {
        for (const e of page.edges) {
            const resolvedSource = cloneToOrigin.get(e.source) ?? e.source
            const resolvedTarget = cloneToOrigin.get(e.target) ?? e.target
            if (!realById.has(resolvedSource) || !realById.has(resolvedTarget)) continue
            if (resolvedSource !== e.source || resolvedTarget !== e.target) {
                resolvedEdges.push({ ...e, source: resolvedSource, target: resolvedTarget })
            } else {
                resolvedEdges.push(e)
            }
        }
    }
    return {
        realNodes: Array.from(realById.values()),
        resolvedEdges,
    }
}

export function buildResolvedAdjacency(pages: PageState[]): Map<string, Set<string>> {
    const { resolvedEdges } = resolveSceneForEngine(pages)
    const adj = new Map<string, Set<string>>()
    for (const e of resolvedEdges) {
        let set = adj.get(e.source)
        if (!set) { set = new Set(); adj.set(e.source, set) }
        set.add(e.target)
    }
    return adj
}

// Returns true if sourceId→targetId (with clone-id resolution) would close a cycle.
export function wouldCreateCycle(
    pages: PageState[],
    sourceId: string,
    targetId: string,
): boolean {
    const cloneToOrigin = new Map<string, string>()
    for (const page of pages) {
        for (const n of page.nodes) {
            if (n.data.cloneOf) cloneToOrigin.set(n.id, n.data.cloneOf)
        }
    }
    const src = cloneToOrigin.get(sourceId) ?? sourceId
    const tgt = cloneToOrigin.get(targetId) ?? targetId
    if (src === tgt) return true
    const adj = buildResolvedAdjacency(pages)
    const seen = new Set<string>([tgt])
    const queue: string[] = [tgt]
    while (queue.length) {
        const cur = queue.shift()!
        const nexts = adj.get(cur)
        if (!nexts) continue
        for (const n of nexts) {
            if (n === src) return true
            if (seen.has(n)) continue
            seen.add(n)
            queue.push(n)
        }
    }
    return false
}

// Highest n_<int> across all pages — used to heal nodeIdCounter after snapshot import.
export function maxNodeIdAcrossPages(pages: PageState[]): number {
    let max = 0
    for (const page of pages) {
        for (const n of page.nodes) {
            const m = /^n_(\d+)$/.exec(n.id)
            if (!m) continue
            const v = parseInt(m[1], 10)
            if (Number.isFinite(v) && v > max) max = v
        }
    }
    return max
}

// Module-local counter; healed by setPageIdCounterFromPages so undo/redo/import don't reissue ids.
let pageIdCounter = 0
export function nextPageId(): string { return `p_${++pageIdCounter}` }
export function getPageIdCounter(): number { return pageIdCounter }
export function setPageIdCounter(v: number) { pageIdCounter = v }

export function setPageIdCounterFromPages(pages: { id: string }[]) {
    let max = pageIdCounter
    for (const p of pages) {
        const m = /^p_(\d+)$/.exec(p.id)
        if (!m) continue
        const v = parseInt(m[1], 10)
        if (Number.isFinite(v) && v > max) max = v
    }
    pageIdCounter = max
}

export const DEFAULT_PAGE_NAME = 'Main'
export const DEFAULT_PAGE_ID = 'p_1'
