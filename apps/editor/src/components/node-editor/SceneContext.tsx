/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Edge, Viewport } from '@xyflow/react'
import { useReactFlow } from '@xyflow/react'
import {
    findOriginAcrossPages,
    nextPageId,
    setPageIdCounterFromPages,
    DEFAULT_PAGE_ID,
    DEFAULT_PAGE_NAME,
    type PageState,
    type PNode,
} from './sceneResolver'

/**
 * Public surface of the multi-page scene state. Owned by `useSceneState`,
 * exposed via `SceneProvider` / `useScene`. Engine sync (running
 * `engine.setEdges` against the resolved scene) lives in `NodeEditor`
 * which has the `engineRef` — not in this context.
 */
export interface SceneState {
    pages: PageState[]
    activePageId: string
    activePage: PageState

    /* ── Page CRUD ──────────────────────────────────────────────── */
    addPage: (name?: string) => string                  // returns new page id
    removePage: (id: string) => void
    renamePage: (id: string, name: string) => void
    switchPage: (id: string) => void

    /* ── Read helpers ───────────────────────────────────────────── */
    /** All non-clone nodes across every page, deduplicated by id. */
    allRealNodes: () => PNode[]
    /** Walk every page; resolve a clone's `cloneOf` to its origin. */
    findOrigin: (cloneOfId: string) => { node: PNode; pageId: string } | null

    /* ── Mutations across pages ─────────────────────────────────── */
    /** Patch `node.data` on whichever page hosts the node. */
    updateNodeData: (id: string, partial: Partial<PNode['data']>) => void
    /** Switch to the page that hosts `nodeId` and centre on it. */
    jumpToNode: (nodeId: string) => void

    /* ── Active-page mutations ──────────────────────────────────── */
    setActiveNodes: (updater: PNode[] | ((prev: PNode[]) => PNode[])) => void
    setActiveEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void

    /* ── Bulk replace (used by snapshot apply / clear scene) ────── */
    replaceScene: (pages: PageState[], activePageId: string) => void
}

const SceneCtx = createContext<SceneState | null>(null)

export function SceneProvider({ value, children }: { value: SceneState; children: ReactNode }) {
    return <SceneCtx.Provider value={value}>{children}</SceneCtx.Provider>
}

export function useScene(): SceneState {
    const v = useContext(SceneCtx)
    if (!v) throw new Error('useScene must be inside SceneProvider')
    return v
}

/** A safe initial scene — single empty `Main` page. */
export function makeInitialScene(): { pages: PageState[]; activePageId: string } {
    return {
        pages: [{ id: DEFAULT_PAGE_ID, name: DEFAULT_PAGE_NAME, nodes: [], edges: [] }],
        activePageId: DEFAULT_PAGE_ID,
    }
}

/**
 * Owns the multi-page state and exposes the SceneState surface. Must be
 * mounted inside `<ReactFlowProvider>` because `jumpToNode` and
 * `switchPage` consult `useReactFlow().setCenter / setViewport`.
 */
export function useSceneState(): SceneState {
    const initial = useMemo(makeInitialScene, [])
    const [pages, setPages] = useState<PageState[]>(initial.pages)
    const [activePageId, setActivePageId] = useState<string>(initial.activePageId)

    const { setViewport, setCenter, getViewport } = useReactFlow()

    /* Track latest pages/activeId in refs so the returned helpers stay
       stable across renders (consumers like CloneNodeView should not
       re-mount every time the user adds a node). */
    const pagesRef = useRef(pages)
    const activeRef = useRef(activePageId)
    pagesRef.current = pages
    activeRef.current = activePageId

    const activePage = useMemo(
        () => pages.find(p => p.id === activePageId) ?? pages[0],
        [pages, activePageId],
    )

    const addPage = useCallback((name?: string) => {
        /* Heal the module-level page-id counter against every live
           page's `p_<int>` suffix BEFORE minting. The initial scene
           bootstraps with the hard-coded `DEFAULT_PAGE_ID = 'p_1'`
           without touching the counter, so the very first `addPage`
           would otherwise reissue `p_1` and produce two pages sharing
           one id (the active-page filter then matches both pages and
           any edit applies to both — "обе активны как одно целое").
           Mirrors `healAndMintNodeId` in NodeEditor. */
        setPageIdCounterFromPages(pagesRef.current)
        const id = nextPageId()
        const idx = pagesRef.current.length + 1
        setPages(prev => [...prev, { id, name: name ?? `Page ${idx}`, nodes: [], edges: [] }])
        return id
    }, [])

    const removePage = useCallback((id: string) => {
        setPages(prev => {
            if (prev.length <= 1) return prev   // never remove the last page
            const next = prev.filter(p => p.id !== id)
            /* Switch to the previous (or first) page if we removed the
               active one. The state update below races with this; we
               capture the next active id and apply it after pages
               update via the activeRef path. */
            if (activeRef.current === id) {
                const removedIdx = prev.findIndex(p => p.id === id)
                const nextActive = next[Math.max(0, removedIdx - 1)]?.id ?? next[0]?.id
                if (nextActive) {
                    setActivePageId(nextActive)
                    activeRef.current = nextActive
                }
            }
            return next
        })
    }, [])

    const renamePage = useCallback((id: string, name: string) => {
        const trimmed = name.trim() || 'Untitled'
        setPages(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p))
    }, [])

    const switchPage = useCallback((id: string) => {
        if (id === activeRef.current) return
        if (!pagesRef.current.some(p => p.id === id)) return
        /* Save the live viewport into the page we're leaving — React
           Flow drives pan/zoom through its own store and never mutates
           our pages, so this is the only point at which the current
           viewport gets persisted into the page object. */
        let leavingViewport: Viewport | undefined
        try { leavingViewport = getViewport() } catch { leavingViewport = undefined }
        setPages(prev => prev.map(p =>
            p.id === activeRef.current ? { ...p, viewport: leavingViewport ?? p.viewport } : p,
        ))
        setActivePageId(id)
        activeRef.current = id
        /* Apply incoming viewport AFTER React Flow re-renders the new
           page's nodes/edges. A microtask is enough — but the safest
           pattern is `requestAnimationFrame` so layout has settled. */
        const target = pagesRef.current.find(p => p.id === id)?.viewport
        if (target) {
            requestAnimationFrame(() => {
                try { setViewport(target) } catch { /* viewport not yet ready */ }
            })
        }
    }, [getViewport, setViewport])

    const allRealNodes = useCallback((): PNode[] => {
        const out: PNode[] = []
        const seen = new Set<string>()
        for (const page of pagesRef.current) {
            for (const n of page.nodes) {
                if (n.data.cloneOf) continue
                if (seen.has(n.id)) continue
                seen.add(n.id)
                out.push(n)
            }
        }
        return out
    }, [])

    const findOrigin = useCallback((cloneOfId: string) =>
        findOriginAcrossPages(pagesRef.current, cloneOfId),
    [])

    const updateNodeData = useCallback((id: string, partial: Partial<PNode['data']>) => {
        setPages(prev => prev.map(page => {
            const idx = page.nodes.findIndex(n => n.id === id)
            if (idx < 0) return page
            const next = page.nodes.slice()
            const cur = next[idx]
            next[idx] = { ...cur, data: { ...cur.data, ...partial } as any }
            return { ...page, nodes: next }
        }))
    }, [])

    const jumpToNode = useCallback((nodeId: string) => {
        /* Find the page hosting the node — could be the host of the
           original (when a clone calls this with the cloneOf id) or any
           other page that contains the node. */
        let pageId: string | undefined
        let position: { x: number; y: number } | undefined
        for (const page of pagesRef.current) {
            const n = page.nodes.find(x => x.id === nodeId)
            if (n) { pageId = page.id; position = n.position; break }
        }
        if (!pageId || !position) return
        if (pageId !== activeRef.current) switchPage(pageId)
        /* Centre after the page swap settles — switchPage already uses
           rAF for the viewport restore; do the same here so the centre
           lands AFTER the new viewport applies. */
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try { setCenter(position!.x, position!.y, { zoom: 1, duration: 300 }) } catch { /* */ }
            })
        })
    }, [switchPage, setCenter])

    const setActiveNodes = useCallback((updater: PNode[] | ((prev: PNode[]) => PNode[])) => {
        setPages(prev => prev.map(page => {
            if (page.id !== activeRef.current) return page
            const nextNodes = typeof updater === 'function' ? (updater as any)(page.nodes) : updater
            return { ...page, nodes: nextNodes }
        }))
    }, [])

    const setActiveEdges = useCallback((updater: Edge[] | ((prev: Edge[]) => Edge[])) => {
        setPages(prev => prev.map(page => {
            if (page.id !== activeRef.current) return page
            const nextEdges = typeof updater === 'function' ? (updater as any)(page.edges) : updater
            return { ...page, edges: nextEdges }
        }))
    }, [])

    const replaceScene = useCallback((nextPages: PageState[], nextActiveId: string) => {
        setPageIdCounterFromPages(nextPages)
        const safePages = nextPages.length > 0 ? nextPages : makeInitialScene().pages
        const safeActive = safePages.some(p => p.id === nextActiveId)
            ? nextActiveId
            : safePages[0].id
        setPages(safePages)
        setActivePageId(safeActive)
        activeRef.current = safeActive
        pagesRef.current = safePages
    }, [])

    return useMemo<SceneState>(() => ({
        pages,
        activePageId,
        activePage,
        addPage,
        removePage,
        renamePage,
        switchPage,
        allRealNodes,
        findOrigin,
        updateNodeData,
        jumpToNode,
        setActiveNodes,
        setActiveEdges,
        replaceScene,
    }), [
        pages, activePageId, activePage,
        addPage, removePage, renamePage, switchPage,
        allRealNodes, findOrigin, updateNodeData, jumpToNode,
        setActiveNodes, setActiveEdges, replaceScene,
    ])
}
