/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef } from 'react'
import type { Edge, Node, Viewport } from '@xyflow/react'
import { PROCESSOR_CATALOG } from '../../../node-engine/processors'
import { ImageProcessor } from '../../../node-engine/processors/image'
import { SegmentationProcessor } from '../../../node-engine/processors/segmentation'
import { DataflowEngine } from '../../../node-engine/dataflow-engine'
import {
    sceneStore,
    type SceneSnapshot,
    type SerializedNode,
    type SerializedEdge,
} from '../../../node-engine/scene-store'
import type { PipelineNodeData } from '../constants'
import { SNAPSHOT_DEBOUNCE_MS, IMAGE_BLOB_PREFIX, SEG_BLOB_PREFIX, setNodeIdCounter, getNodeIdCounter, maxNodeIdNumber } from '../constants'

type PNode = Node<PipelineNodeData>

/* Subset of `SceneSnapshot` that history operations actually need to
   serialize / restore. Exported so callers (initial load, import) can
   construct compatible payloads without leaking all of SceneSnapshot's
   metadata fields (id, timestamp). */
export type ScenePayload = Pick<SceneSnapshot,
    'nodes' | 'edges' | 'nodeIdCounter' | 'pinnedIds' | 'viewport'>

interface Deps {
    nodes: PNode[]
    setNodes: React.Dispatch<React.SetStateAction<PNode[]>>
    edges: Edge[]
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
    engineRef: React.MutableRefObject<DataflowEngine | null>
    /* UX state captured alongside the graph. Both are read at serialize
       time and written back at restore time so undo/redo recovers the
       full editor surface. */
    pinnedIds: string[]
    setPinnedIds: (ids: string[]) => void
    getViewport: () => Viewport
    setViewport: (v: Viewport) => void
}

export function useSceneHistory({
    nodes, setNodes, edges, setEdges, engineRef,
    pinnedIds, setPinnedIds, getViewport, setViewport,
}: Deps) {
    const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isRestoringRef = useRef(false)

    const serializeScene = useCallback((): ScenePayload => {
        const engine = engineRef.current
        const serializedNodes: SerializedNode[] = nodes.map(n => {
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
        /* `getViewport` may be called before React Flow has fully mounted
           on the very first render; guard against any throw so a missing
           viewport never blocks a snapshot push. */
        let viewport: Viewport | undefined
        try { viewport = getViewport() } catch { viewport = undefined }
        return {
            nodes: serializedNodes,
            edges: edges as SerializedEdge[],
            nodeIdCounter: getNodeIdCounter(),
            pinnedIds: [...pinnedIds],
            viewport,
        }
    }, [nodes, edges, engineRef, pinnedIds, getViewport])

    const persistBlobs = useCallback(async () => {
        const engine = engineRef.current
        if (!engine) return
        for (const n of nodes) {
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
    }, [nodes, engineRef])

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
            for (const n of nodes) engine.removeNode(n.id)
            /* Sync the shared id counter to whichever is higher: the
               value the snapshot wrote, or the largest numeric suffix
               actually present in the restored nodes. The second clause
               heals snapshots / imports where the counter was 0 (an
               older bug in `exportScene`) — without it the next
               `nextId()` would hand out an ID already in use, and
               React Flow dedupes by `id` so the original node would
               silently disappear. */
            const fromSnap = snap.nodeIdCounter || 0
            const fromIds = maxNodeIdNumber(snap.nodes)
            setNodeIdCounter(Math.max(fromSnap, fromIds))
            const restoredNodes: PNode[] = []
            for (const sn of snap.nodes) {
                if (!PROCESSOR_CATALOG[sn.data.processor]) continue
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

                restoredNodes.push({
                    id: sn.id,
                    type: sn.type,
                    position: sn.position,
                    data: sn.data as PipelineNodeData,
                    ...(sn.style ? { style: sn.style } : {}),
                    ...(typeof sn.width === 'number' ? { width: sn.width } : {}),
                    ...(typeof sn.height === 'number' ? { height: sn.height } : {}),
                } as PNode)
            }
            setNodes(restoredNodes)

            const aliveIds = new Set(restoredNodes.map(n => n.id))
            const migratedEdges = (snap.edges as Edge[])
                .filter(e => aliveIds.has(e.source) && aliveIds.has(e.target))
                .map(e => ({ ...e, type: 'editableStep' }))
            setEdges(migratedEdges)

            /* Restore UX state. Both are optional — legacy snapshots
               written before these fields existed leave the current
               editor surface untouched. */
            if (Array.isArray(snap.pinnedIds)) {
                setPinnedIds(snap.pinnedIds)
            }
            if (snap.viewport &&
                Number.isFinite(snap.viewport.x) &&
                Number.isFinite(snap.viewport.y) &&
                Number.isFinite(snap.viewport.zoom)) {
                try { setViewport(snap.viewport) } catch { /* viewport not yet ready */ }
            }
        } finally {
            isRestoringRef.current = false
        }
    }, [nodes, setNodes, setEdges, setPinnedIds, setViewport])

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
        isRestoringRef,
    }
}
