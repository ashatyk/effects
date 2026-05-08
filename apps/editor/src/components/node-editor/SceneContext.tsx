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

// Engine sync (engine.setEdges against the resolved scene) lives in NodeEditor, not here.
export interface SceneState {
    pages: PageState[]
    activePageId: string
    activePage: PageState

    addPage: (name?: string) => string
    removePage: (id: string) => void
    renamePage: (id: string, name: string) => void
    switchPage: (id: string) => void

    allRealNodes: () => PNode[]
    findOrigin: (cloneOfId: string) => { node: PNode; pageId: string } | null

    updateNodeData: (id: string, partial: Partial<PNode['data']>) => void
    jumpToNode: (nodeId: string) => void

    setActiveNodes: (updater: PNode[] | ((prev: PNode[]) => PNode[])) => void
    setActiveEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void

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

export function makeInitialScene(): { pages: PageState[]; activePageId: string } {
    return {
        pages: [{ id: DEFAULT_PAGE_ID, name: DEFAULT_PAGE_NAME, nodes: [], edges: [] }],
        activePageId: DEFAULT_PAGE_ID,
    }
}

// Must be mounted inside <ReactFlowProvider> — uses useReactFlow for viewport / setCenter.
export function useSceneState(): SceneState {
    const initial = useMemo(makeInitialScene, [])
    const [pages, setPages] = useState<PageState[]>(initial.pages)
    const [activePageId, setActivePageId] = useState<string>(initial.activePageId)

    const { setViewport, setCenter, getViewport } = useReactFlow()

    // Refs keep returned helpers stable across renders so consumers don't re-mount on every edit.
    const pagesRef = useRef(pages)
    const activeRef = useRef(activePageId)
    pagesRef.current = pages
    activeRef.current = activePageId

    const activePage = useMemo(
        () => pages.find(p => p.id === activePageId) ?? pages[0],
        [pages, activePageId],
    )

    const addPage = useCallback((name?: string) => {
        // Heal counter BEFORE minting: DEFAULT_PAGE_ID is hard-coded p_1 without touching the counter,
        // so the first addPage would otherwise reissue p_1 and produce two pages sharing one id.
        setPageIdCounterFromPages(pagesRef.current)
        const id = nextPageId()
        const idx = pagesRef.current.length + 1
        setPages(prev => [...prev, { id, name: name ?? `Page ${idx}`, nodes: [], edges: [] }])
        return id
    }, [])

    const removePage = useCallback((id: string) => {
        setPages(prev => {
            if (prev.length <= 1) return prev
            const next = prev.filter(p => p.id !== id)
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
        // Save live viewport into the page we're leaving — only persistence point for pan/zoom.
        let leavingViewport: Viewport | undefined
        try { leavingViewport = getViewport() } catch { leavingViewport = undefined }
        setPages(prev => prev.map(p =>
            p.id === activeRef.current ? { ...p, viewport: leavingViewport ?? p.viewport } : p,
        ))
        setActivePageId(id)
        activeRef.current = id
        // rAF so RF has rendered the new page's nodes/edges before viewport applies.
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
        let pageId: string | undefined
        let position: { x: number; y: number } | undefined
        for (const page of pagesRef.current) {
            const n = page.nodes.find(x => x.id === nodeId)
            if (n) { pageId = page.id; position = n.position; break }
        }
        if (!pageId || !position) return
        if (pageId !== activeRef.current) switchPage(pageId)
        // Two rAFs: switchPage uses one for viewport restore; we wait one more so setCenter wins.
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
