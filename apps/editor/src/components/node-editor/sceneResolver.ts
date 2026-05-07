import type { Edge, Node, Viewport } from '@xyflow/react'
import type { PipelineNodeData } from './constants'

export type PNode = Node<PipelineNodeData>

/**
 * One scenario tab in the editor. Owns its own slice of the graph plus
 * an optional viewport (so each page remembers its zoom/pan position).
 *
 * Pages exist purely in the UI — `DataflowEngine` sees the union of all
 * non-clone nodes from every page and the resolved edges (with edges
 * whose source is a clone rewritten to point at the original).
 */
export interface PageState {
    id: string                 // 'p_<int>'
    name: string               // user-given; defaults to 'Main'
    nodes: PNode[]
    edges: Edge[]
    viewport?: Viewport
}

/**
 * Find the original node a clone is pointing at, across every page.
 * Returns null if `cloneOfId` is empty or the original was deleted.
 *
 * Originals always live on exactly one page (the one they were created
 * on); clones can live anywhere. We walk all pages because the lookup
 * is rare (per-clone-render and per-connection-validation) and avoids
 * having to maintain a separate index.
 */
export function findOriginAcrossPages(
    pages: PageState[],
    cloneOfId: string,
): { node: PNode; pageId: string } | null {
    if (!cloneOfId) return null
    for (const page of pages) {
        for (const n of page.nodes) {
            if (n.id !== cloneOfId) continue
            /* Don't follow chains of clones — we only allow clones of
               originals. The AddNodePopover filters the list to exclude
               clones, so this guard is defence-in-depth for legacy
               snapshots / hand-edited scenes. */
            if (n.data.cloneOf) return null
            return { node: n, pageId: page.id }
        }
    }
    return null
}

/**
 * Resolve the multi-page UI scene into the flat (nodes, edges) shape
 * the engine consumes:
 *  - `realNodes`: every non-clone node from every page, deduplicated by
 *    id (an id should be unique scene-wide, but we dedupe defensively).
 *  - `resolvedEdges`: every edge from every page; if its source is a
 *    clone, the source id is rewritten to the original's id. Edges
 *    pointing at non-existent nodes (deleted clones with broken
 *    `cloneOf`, dangling targets) are dropped.
 *
 * The engine never sees clones. The engine never sees "pages". This
 * function is the entire UI→engine mapping.
 */
export function resolveSceneForEngine(pages: PageState[]): {
    realNodes: PNode[]
    resolvedEdges: Edge[]
} {
    const realById = new Map<string, PNode>()
    const cloneToOrigin = new Map<string, string>()
    /* Pass 1: index real nodes and clone→origin lookup. */
    for (const page of pages) {
        for (const n of page.nodes) {
            if (n.data.cloneOf) {
                cloneToOrigin.set(n.id, n.data.cloneOf)
                continue
            }
            if (!realById.has(n.id)) realById.set(n.id, n)
        }
    }
    const resolvedEdges: Edge[] = []
    for (const page of pages) {
        for (const e of page.edges) {
            const resolvedSource = cloneToOrigin.get(e.source) ?? e.source
            const resolvedTarget = cloneToOrigin.get(e.target) ?? e.target
            /* Both endpoints must resolve to a real node (target is
               typically already real — clones have no input handles —
               but we resolve symmetrically for resilience to legacy
               graphs). Drop the edge otherwise. */
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

/**
 * Build the directed adjacency `source → set of targets` over the
 * RESOLVED graph (i.e. after rewriting clone source ids). Used by the
 * cycle detector. Multi-page: edges from every page contribute.
 */
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

/**
 * Return true if adding an edge `sourceId → targetId` (as-they-appear
 * in React Flow, possibly clone ids) would close a directed cycle in
 * the resolved adjacency.
 *
 * We resolve both endpoints to their originals (so a "clone of A → A"
 * loop is rejected as a self-cycle), then BFS forward from the
 * candidate target — if we can reach the candidate source, the new
 * edge closes a cycle.
 */
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
    /* BFS from tgt: if we ever reach src, the new edge `src→tgt` would
       close a cycle. */
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

/**
 * Walk every page's nodes, ignoring clones, and return the highest
 * numeric suffix found in IDs of the form `n_<int>`. Used by the
 * scene-history hook to heal `nodeIdCounter` after a multi-page
 * snapshot import. (Clones do take ids too, so we include them in the
 * scan defensively.)
 */
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

/**
 * Page id minting. Like `nextId()` for nodes — module-local counter,
 * heals against any pre-existing `p_<int>` suffix on
 * `setPageIdCounterFromPages` so undo/redo and import don't reissue
 * existing ids.
 */
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

/**
 * Default page used when bootstrapping a fresh scene or migrating a
 * legacy (flat) snapshot.
 */
export const DEFAULT_PAGE_NAME = 'Main'
export const DEFAULT_PAGE_ID = 'p_1'
