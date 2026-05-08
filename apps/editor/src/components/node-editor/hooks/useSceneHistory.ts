/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef } from 'react'
import type { Edge, Node, Viewport } from '@xyflow/react'
import {
    PROCESSOR_CATALOG,
    ImageProcessor,
    SegmentationProcessor,
    DataflowEngine,
    PUBLISH_MANIFEST_VERSION,
} from '@effects/runtime'
import {
    sceneStore,
    type SceneSnapshot,
    type SerializedNode,
    type SerializedEdge,
    type SerializedPage,
} from '@/scene-store'
import type { PipelineNodeData } from '../constants'
import { SNAPSHOT_DEBOUNCE_MS, IMAGE_BLOB_PREFIX, SEG_BLOB_PREFIX, setNodeIdCounter, getNodeIdCounter } from '../constants'
import {
    DEFAULT_PAGE_ID, DEFAULT_PAGE_NAME,
    setPageIdCounterFromPages,
    maxNodeIdAcrossPages,
    type PageState,
} from '../sceneResolver'

type PNode = Node<PipelineNodeData>

// nodes/edges/viewport are populated only when reading a pre-pages snapshot.
export type ScenePayload = Pick<SceneSnapshot,
    'pages' | 'activePageId' | 'nodeIdCounter' | 'pinnedIds' | 'manifestVersion' |
    'nodes' | 'edges' | 'viewport'>

interface Deps {
    pages: PageState[]
    activePageId: string
    replaceScene: (pages: PageState[], activePageId: string) => void
    engineRef: React.MutableRefObject<DataflowEngine | null>
    pinnedIds: string[]
    setPinnedIds: (ids: string[]) => void
    getViewport: () => Viewport
    setViewport: (v: Viewport) => void
}

export function useSceneHistory({
    pages, activePageId, replaceScene, engineRef,
    pinnedIds, setPinnedIds, getViewport, setViewport,
}: Deps) {
    const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isRestoringRef = useRef(false)

    const serializeScene = useCallback((): ScenePayload => {
        const engine = engineRef.current
        const serializedPages: SerializedPage[] = pages.map(page => {
            const serializedNodes: SerializedNode[] = page.nodes.map(n => {
                const sn: SerializedNode = {
                    id: n.id,
                    type: n.type ?? n.data.processor,
                    position: { ...n.position },
                    data: { ...n.data, params: { ...n.data.params } },
                }
                const w = (n as { width?: number }).width
                const h = (n as { height?: number }).height
                if (typeof w === 'number') sn.width = w
                if (typeof h === 'number') sn.height = h
                if (n.style) sn.style = { ...n.style } as Record<string, unknown>
                if (n.data.cloneOf) return sn
                if (n.data.processor === 'image' && engine) {
                    const proc = engine.getProcessor<ImageProcessor>(n.id)
                    if (proc?.loadedUrl) {
                        sn.data.imageUrl = `${IMAGE_BLOB_PREFIX}${n.id}`
                    }
                }
                if (n.data.processor === 'segmentation' && engine) {
                    const proc = engine.getProcessor<SegmentationProcessor>(n.id)
                    if (proc) {
                        if (proc.points.length > 0) sn.data.segPoints = proc.points
                        if (proc.polygon.length >= 6) sn.data.segPolygon = proc.polygon
                        if (proc.maskData) sn.data.segMaskKey = `${SEG_BLOB_PREFIX}${n.id}`
                    }
                }
                return sn
            })
            // Active page: capture live viewport (page.viewport is only updated on switch).
            let viewport: Viewport | undefined = page.viewport
            if (page.id === activePageId) {
                try { viewport = getViewport() } catch { viewport = page.viewport }
            }
            return {
                id: page.id,
                name: page.name,
                nodes: serializedNodes,
                edges: page.edges as SerializedEdge[],
                viewport,
            }
        })
        return {
            pages: serializedPages,
            activePageId,
            nodeIdCounter: getNodeIdCounter(),
            pinnedIds: [...pinnedIds],
            manifestVersion: PUBLISH_MANIFEST_VERSION,
        }
    }, [pages, activePageId, engineRef, pinnedIds, getViewport])

    const persistBlobs = useCallback(async () => {
        const engine = engineRef.current
        if (!engine) return
        for (const page of pages) {
            for (const n of page.nodes) {
                if (n.data.cloneOf) continue
                if (n.data.processor === 'image') {
                    const proc = engine.getProcessor<ImageProcessor>(n.id)
                    if (!proc?.loadedUrl) continue
                    const key = `${IMAGE_BLOB_PREFIX}${n.id}`
                    if (proc.loadedUrl.startsWith('data:')) {
                        await sceneStore.putDataUrl(key, proc.loadedUrl)
                    }
                }
                if (n.data.processor === 'segmentation') {
                    const proc = engine.getProcessor<SegmentationProcessor>(n.id)
                    if (!proc?.maskData) continue
                    const { mask, width, height } = proc.maskData
                    const bytes = new Uint8Array(mask.length)
                    for (let i = 0; i < mask.length; i++) bytes[i] = mask[i] > 0 ? 1 : 0
                    const blob = new Blob([bytes], { type: 'application/octet-stream' })
                    await sceneStore.putBlob(`${SEG_BLOB_PREFIX}${n.id}`, blob, { width, height })
                }
            }
        }
    }, [pages, engineRef])

    const pushSnapshot = useCallback((label = 'edit') => {
        if (isRestoringRef.current) return
        if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
        snapshotTimer.current = setTimeout(async () => {
            await persistBlobs()
            const scene = serializeScene()
            await sceneStore.pushSnapshot({ label, ...scene })
        }, SNAPSHOT_DEBOUNCE_MS)
    }, [serializeScene, persistBlobs])

    const applySnapshot = useCallback(async (
        snap: ScenePayload,
        engine: DataflowEngine,
    ) => {
        isRestoringRef.current = true
        try {
            // Full rebuild from snapshot — no incremental diff. Skip clones/frames (no engine processor).
            for (const page of pages) {
                for (const n of page.nodes) {
                    if (n.data.cloneOf) continue
                    if (n.data.processor === 'frame') continue
                    engine.removeNode(n.id)
                }
            }

            // Migrate legacy single-page snapshots (flat nodes/edges/viewport) into one default page.
            const incomingPages: SerializedPage[] = snap.pages && snap.pages.length > 0
                ? snap.pages
                : [{
                    id: DEFAULT_PAGE_ID,
                    name: DEFAULT_PAGE_NAME,
                    nodes: snap.nodes ?? [],
                    edges: snap.edges ?? [],
                    viewport: snap.viewport,
                }]

            // Heal id counters BEFORE allocations so nextId/nextPageId can't collide with restored ids.
            const fromSnap = snap.nodeIdCounter || 0
            const fromIds = maxNodeIdAcrossPages(incomingPages.map(p => ({
                id: p.id, name: p.name,
                nodes: p.nodes as PNode[], edges: p.edges as Edge[],
            })))
            setNodeIdCounter(Math.max(fromSnap, fromIds))
            setPageIdCounterFromPages(incomingPages)

            // Backfill event-source nodes (eventEmitter/tapZone) missing id/label with deterministic
            // defaults keyed on node id so external glue stays stable across sessions.
            for (const page of incomingPages) {
                for (const sn of page.nodes) {
                    if (sn.data.cloneOf) continue
                    if (sn.data.processor === 'eventEmitter') {
                        const p = sn.data.params as Record<string, unknown>
                        if (typeof p.id !== 'string' || !p.id) p.id = `evt_${sn.id.replace(/^n_/, '')}`
                        if (typeof p.label !== 'string' || !p.label) p.label = 'Event'
                    }
                    if (sn.data.processor === 'tapZone') {
                        const p = sn.data.params as Record<string, unknown>
                        if (typeof p.id !== 'string' || !p.id) p.id = `tap_${sn.id.replace(/^n_/, '')}`
                        if (typeof p.label !== 'string' || !p.label) p.label = 'Tap zone'
                    }
                }
            }

            // Drop unknown processor types (retired processors in old snapshots). Frames/clones
            // bypass the catalog check by design.
            const restoredPages: PageState[] = []
            for (const page of incomingPages) {
                const restoredNodes: PNode[] = []
                for (const sn of page.nodes) {
                    const isClone = !!sn.data.cloneOf
                    const isFrame = sn.data.processor === 'frame'
                    if (!isClone && !isFrame && !PROCESSOR_CATALOG[sn.data.processor]) continue

                    if (!isClone && !isFrame) {
                        engine.addNode(sn.id, sn.data.processor, { ...sn.data.params })

                        if (sn.data.processor === 'image' && sn.data.imageUrl) {
                            const proc = engine.getProcessor<ImageProcessor>(sn.id)
                            if (proc) {
                                const imgKey = String(sn.data.imageUrl)
                                if (imgKey.startsWith(IMAGE_BLOB_PREFIX)) {
                                    const dataUrl = await sceneStore.getDataUrl(imgKey)
                                    if (dataUrl) proc.setImageUrl(dataUrl, engine)
                                } else {
                                    proc.setImageUrl(imgKey, engine)
                                }
                            }
                        }

                        if (sn.data.processor === 'segmentation') {
                            const proc = engine.getProcessor<SegmentationProcessor>(sn.id)
                            if (proc) {
                                if (Array.isArray(sn.data.segPoints)) proc.points = sn.data.segPoints as any
                                if (Array.isArray(sn.data.segPolygon)) proc.polygon = sn.data.segPolygon as number[]
                                if (sn.data.segMaskKey) {
                                    const entry = await sceneStore.getBlob(String(sn.data.segMaskKey))
                                    if (entry && entry.width && entry.height) {
                                        const bytes = new Uint8Array(await entry.blob.arrayBuffer())
                                        proc.maskData = {
                                            mask: Array.from(bytes),
                                            width: entry.width,
                                            height: entry.height,
                                        }
                                    }
                                }
                                engine.markDirty(sn.id)
                            }
                        }
                    }

                    restoredNodes.push({
                        id: sn.id,
                        type: sn.type,
                        position: sn.position,
                        data: sn.data as PipelineNodeData,
                        ...(sn.style ? { style: sn.style } : {}),
                        ...(typeof sn.width === 'number' ? { width: sn.width } : {}),
                        ...(typeof sn.height === 'number' ? { height: sn.height } : {}),
                        // Frames paint behind processors; CSS + node.zIndex both needed (CSS beats
                        // RF's inline elevateNodesOnSelect bump; field keeps RF stacking math consistent).
                        ...(isFrame ? { zIndex: -1 } : {}),
                    } as PNode)
                }
                // Per-page filter: drop edges whose endpoints aren't on this page (resolveSceneForEngine
                // handles the cross-page clone-source resolution later).
                const aliveIdsOnPage = new Set(restoredNodes.map(n => n.id))
                const restoredEdges = (page.edges as Edge[])
                    .filter(e => aliveIdsOnPage.has(e.source) && aliveIdsOnPage.has(e.target))
                    .map(e => ({ ...e, type: 'editableStep' }))
                restoredPages.push({
                    id: page.id,
                    name: page.name,
                    nodes: restoredNodes,
                    edges: restoredEdges,
                    viewport: page.viewport,
                })
            }

            const incomingActiveId = snap.activePageId && restoredPages.some(p => p.id === snap.activePageId)
                ? snap.activePageId
                : restoredPages[0]?.id ?? DEFAULT_PAGE_ID
            replaceScene(restoredPages, incomingActiveId)

            if (Array.isArray(snap.pinnedIds)) {
                setPinnedIds(snap.pinnedIds)
            }
            const activeViewport = restoredPages.find(p => p.id === incomingActiveId)?.viewport
                ?? snap.viewport
            if (activeViewport &&
                Number.isFinite(activeViewport.x) &&
                Number.isFinite(activeViewport.y) &&
                Number.isFinite(activeViewport.zoom)) {
                // Wait one frame for RF to mount the new active page (key={activePageId} re-mounts on restore).
                requestAnimationFrame(() => {
                    try { setViewport(activeViewport) } catch { /* viewport not yet ready */ }
                })
            }
        } finally {
            isRestoringRef.current = false
        }
    }, [pages, replaceScene, setPinnedIds, setViewport])

    const handleUndo = useCallback(async () => {
        const snap = await sceneStore.undo()
        if (!snap || !engineRef.current) return
        await applySnapshot(snap, engineRef.current)
    }, [applySnapshot, engineRef])

    const handleRedo = useCallback(async () => {
        const snap = await sceneStore.redo()
        if (!snap || !engineRef.current) return
        await applySnapshot(snap, engineRef.current)
    }, [applySnapshot, engineRef])

    return {
        serializeScene,
        persistBlobs,
        pushSnapshot,
        applySnapshot,
        handleUndo,
        handleRedo,
    }
}
