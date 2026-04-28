/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    addEdge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Application } from 'pixi.js'
import { Link } from 'react-router-dom'

import { DataflowEngine } from '../node-engine/dataflow-engine'
import { PROCESSOR_CATALOG } from '../node-engine/processors'
import { ImageProcessor } from '../node-engine/processors/image'
import { SegmentationProcessor } from '../node-engine/processors/segmentation'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Popover from '@mui/material/Popover'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import IosShareIcon from '@mui/icons-material/IosShare'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import PushPinIcon from '@mui/icons-material/PushPin'

import { EngineProvider } from './flow-nodes/EngineContext'
import { pipelineNodeTypes } from './flow-nodes/nodeTypes'
import { categoryColor } from './flow-nodes/categoryColors'
import type { PipelineNodeData } from './flow-nodes/types'
import { SLOT } from '../node-engine/types'
import { sceneStore, type SerializedNode, type SerializedEdge } from '../node-engine/scene-store'
import { PinProvider } from './flow-nodes/PinContext'
import { NodePinSidebar } from './flow-nodes/NodePinSidebar'

type PNode = Node<PipelineNodeData>

let nodeIdCounter = 0
function nextId(): string { return `n_${++nodeIdCounter}` }

const SLOT_COMPAT: Record<string, Set<string>> = {
    [SLOT.TEXTURE]: new Set([SLOT.TEXTURE, SLOT.ANY]),
    [SLOT.POLYGON]: new Set([SLOT.POLYGON, SLOT.ANY]),
    [SLOT.NUMBER]: new Set([SLOT.NUMBER, SLOT.ANY]),
    [SLOT.VEC]: new Set([SLOT.VEC, SLOT.ANY]),
    [SLOT.DEPTH_RAW]: new Set([SLOT.DEPTH_RAW, SLOT.ANY]),
    [SLOT.CONFIG]: new Set([SLOT.CONFIG, SLOT.ANY]),
    [SLOT.CONTOUR]: new Set([SLOT.CONTOUR, SLOT.ANY]),
    [SLOT.PULSE]: new Set([SLOT.PULSE, SLOT.ANY]),
    [SLOT.SIGNAL]: new Set([SLOT.SIGNAL, SLOT.ANY]),
    [SLOT.ANIMATION]: new Set([SLOT.ANIMATION, SLOT.ANY]),
    [SLOT.ANY]: new Set([SLOT.TEXTURE, SLOT.POLYGON, SLOT.NUMBER, SLOT.VEC, SLOT.DEPTH_RAW, SLOT.CONFIG, SLOT.CONTOUR, SLOT.PULSE, SLOT.SIGNAL, SLOT.ANIMATION, SLOT.ANY]),
}

interface SceneData {
    nodes: PNode[]
    edges: Edge[]
    nodeIdCounter: number
}

const SNAPSHOT_DEBOUNCE_MS = 1200
const IMAGE_BLOB_PREFIX = 'img:'
const SEG_BLOB_PREFIX = 'seg:'

function NodeEditorInner() {
    const [nodes, setNodes, onNodesChange] = useNodesState<PNode>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const engineRef = useRef<DataflowEngine | null>(null)
    const [engineReady, setEngineReady] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('nodeEditor.sidebarOpen.v1') !== '0' } catch { return true }
    })
    const clipboardRef = useRef<PNode[]>([])
    const restoredRef = useRef(false)
    const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isRestoringRef = useRef(false)
    const { screenToFlowPosition } = useReactFlow()

    /* Set of currently-existing node ids — used by PinProvider to evict stale
       pins (deleted nodes) from the persisted list. Recomputed only when the
       node list mutates. */
    const liveNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes])

    useEffect(() => {
        try { localStorage.setItem('nodeEditor.sidebarOpen.v1', sidebarOpen ? '1' : '0') } catch { /* */ }
    }, [sidebarOpen])

    /* ── Serialize scene for snapshot ── */
    const serializeScene = useCallback((): { nodes: SerializedNode[]; edges: SerializedEdge[]; nodeIdCounter: number } => {
        const engine = engineRef.current
        const serializedNodes: SerializedNode[] = nodes.map(n => {
            const sn: SerializedNode = {
                id: n.id,
                type: n.type ?? n.data.processor,
                position: { ...n.position },
                data: { ...n.data, params: { ...n.data.params } },
            }
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
        return { nodes: serializedNodes, edges: edges as SerializedEdge[], nodeIdCounter }
    }, [nodes, edges])

    /* ── Save blobs to Dexie (images + segmentation masks) ── */
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
    }, [nodes])

    /* ── Push snapshot (debounced) ── */
    const pushSnapshot = useCallback((label = 'edit') => {
        if (isRestoringRef.current) return
        if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
        snapshotTimer.current = setTimeout(async () => {
            await persistBlobs()
            const scene = serializeScene()
            await sceneStore.pushSnapshot({ label, ...scene })
        }, SNAPSHOT_DEBOUNCE_MS)
    }, [serializeScene, persistBlobs])

    /* ── Restore a snapshot into the editor ── */
    const applySnapshot = useCallback(async (
        snapNodes: SerializedNode[],
        snapEdges: SerializedEdge[],
        snapCounter: number,
        engine: DataflowEngine,
    ) => {
        isRestoringRef.current = true
        try {
            for (const n of nodes) engine.removeNode(n.id)
            nodeIdCounter = snapCounter || 0
            const restoredNodes: PNode[] = []
            for (const sn of snapNodes) {
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
                } as PNode)
            }
            setNodes(restoredNodes)
            setEdges(snapEdges as Edge[])
        } finally {
            isRestoringRef.current = false
        }
    }, [nodes, setNodes, setEdges])

    /* ── Init Pixi + Engine + restore from Dexie ── */
    useEffect(() => {
        let destroyed = false
        const app = new Application()
        ;(async () => {
            await app.init({
                width: 16, height: 16,
                preference: 'webgl',
                preferWebGLVersion: 2,
                background: 0x000000,
                backgroundAlpha: 1,
                antialias: false,
                autoStart: false,
            } as any)
            if (destroyed) { app.destroy(true, { children: true }); return }

            const canvas = app.canvas as HTMLCanvasElement
            canvas.style.position = 'fixed'
            canvas.style.left = '-9999px'
            canvas.style.top = '-9999px'
            canvas.style.pointerEvents = 'none'
            document.body.appendChild(canvas)

            app.stage.eventMode = 'none'
            const engine = new DataflowEngine(app)
            engineRef.current = engine
            engine.start()
            setEngineReady(true)

            if (!restoredRef.current) {
                restoredRef.current = true
                await sceneStore.init()
                const snap = await sceneStore.currentSnapshot()
                if (snap && snap.nodes.length > 0) {
                    await applySnapshot(snap.nodes, snap.edges, snap.nodeIdCounter, engine)
                }
            }
        })()

        return () => {
            destroyed = true
            const eng = engineRef.current
            if (eng) {
                const canvas = eng.app.canvas as HTMLCanvasElement
                eng.destroy()
                try { eng.app.destroy(true, { children: true }) } catch { /* */ }
                canvas?.remove()
            }
            engineRef.current = null
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /* ── Auto-save snapshot on changes ── */
    useEffect(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [nodes, edges, engineReady, pushSnapshot])

    /* ── Sync edges with engine ── */
    useEffect(() => {
        engineRef.current?.setEdges(edges)
    }, [edges])

    /* ── Connection handler ── */
    const onConnect = useCallback((conn: Connection) => {
        setEdges(eds => {
            const filtered = eds.filter(
                e => !(e.target === conn.target && e.targetHandle === conn.targetHandle),
            )
            return addEdge(conn, filtered)
        })
        if (conn.target) engineRef.current?.markDirty(conn.target)
    }, [setEdges])

    /* ── Edge validation ── */
    const isValidConnection = useCallback((conn: Connection | Edge) => {
        const sourceNode = nodes.find(n => n.id === conn.source)
        const targetNode = nodes.find(n => n.id === conn.target)
        if (!sourceNode || !targetNode) return false

        const srcDef = PROCESSOR_CATALOG[sourceNode.data.processor]?.def
        const tgtDef = PROCESSOR_CATALOG[targetNode.data.processor]?.def
        if (!srcDef || !tgtDef) return false

        const srcHandle = srcDef.outputs.find(o => o.name === conn.sourceHandle)
        const tgtHandle = tgtDef.inputs.find(i => i.name === conn.targetHandle)
        if (!srcHandle || !tgtHandle) return false

        if (tgtHandle.type === SLOT.ANY || srcHandle.type === SLOT.ANY) return true
        const compat = SLOT_COMPAT[srcHandle.type]
        return compat ? compat.has(tgtHandle.type) : srcHandle.type === tgtHandle.type
    }, [nodes])

    /* ── Context menu: add node at mouse position ── */
    const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
        event.preventDefault()
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        setContextMenu({ x: event.clientX, y: event.clientY, flowX: flowPos.x, flowY: flowPos.y })
    }, [screenToFlowPosition])

    const addNode = useCallback((processorType: string) => {
        const entry = PROCESSOR_CATALOG[processorType]
        if (!entry) return
        const id = nextId()
        const newNode: PNode = {
            id,
            type: processorType,
            position: { x: contextMenu?.flowX ?? 200, y: contextMenu?.flowY ?? 200 },
            data: { processor: processorType, params: { ...entry.def.defaultParams } },
            ...(processorType === 'preview' ? { style: { width: 300 } } : {}),
        }
        setNodes(nds => [...nds, newNode])
        engineRef.current?.addNode(id, processorType, { ...entry.def.defaultParams })
        setContextMenu(null)
    }, [setNodes, contextMenu])

    /* ── Insert reroute node on edge double-click ── */
    const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
        const engine = engineRef.current
        if (!engine) return
        const flowPos = screenToFlowPosition({ x: _event.clientX, y: _event.clientY })

        const rerouteId = nextId()
        const entry = PROCESSOR_CATALOG['reroute']
        if (!entry) return

        engine.addNode(rerouteId, 'reroute', {})
        const rerouteNode: PNode = {
            id: rerouteId,
            type: 'reroute',
            position: { x: flowPos.x - 10, y: flowPos.y - 10 },
            data: { processor: 'reroute', params: {} },
        }

        setNodes(nds => [...nds, rerouteNode])
        setEdges(eds => {
            const without = eds.filter(e => e.id !== edge.id)
            const edgeToReroute: Edge = {
                id: `e_${edge.source}_${edge.sourceHandle}_${rerouteId}`,
                source: edge.source,
                sourceHandle: edge.sourceHandle,
                target: rerouteId,
                targetHandle: 'in',
            }
            const edgeFromReroute: Edge = {
                id: `e_${rerouteId}_out_${edge.target}_${edge.targetHandle}`,
                source: rerouteId,
                sourceHandle: 'out',
                target: edge.target!,
                targetHandle: edge.targetHandle,
            }
            return [...without, edgeToReroute, edgeFromReroute]
        })

        setTimeout(() => {
            engine.markDirty(rerouteId)
            if (edge.target) engine.markDirty(edge.target)
        }, 50)
    }, [screenToFlowPosition, setNodes, setEdges])

    /* ── Delete nodes ── */
    const onNodesDelete = useCallback((deleted: PNode[]) => {
        for (const n of deleted) engineRef.current?.removeNode(n.id)
    }, [])

    /* ── Undo / Redo ── */
    const handleUndo = useCallback(async () => {
        const snap = await sceneStore.undo()
        if (!snap || !engineRef.current) return
        await applySnapshot(snap.nodes, snap.edges, snap.nodeIdCounter, engineRef.current)
    }, [applySnapshot])

    const handleRedo = useCallback(async () => {
        const snap = await sceneStore.redo()
        if (!snap || !engineRef.current) return
        await applySnapshot(snap.nodes, snap.edges, snap.nodeIdCounter, engineRef.current)
    }, [applySnapshot])

    /* ── Keyboard: Copy / Paste / Undo / Redo ── */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey

            if (isMeta && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                handleUndo()
                return
            }
            if (isMeta && e.key === 'z' && e.shiftKey) {
                e.preventDefault()
                handleRedo()
                return
            }
            if (isMeta && e.key === 'y') {
                e.preventDefault()
                handleRedo()
                return
            }

            if (isMeta && e.key === 'c') {
                const selected = nodes.filter(n => n.selected)
                if (selected.length > 0) clipboardRef.current = selected
            }
            if (isMeta && e.key === 'v' && clipboardRef.current.length > 0) {
                const offset = 40
                const newNodes: PNode[] = clipboardRef.current.map(n => {
                    const id = nextId()
                    const nn: PNode = {
                        id,
                        type: n.type,
                        position: { x: n.position.x + offset, y: n.position.y + offset },
                        data: { ...n.data, params: { ...n.data.params } },
                        selected: true,
                    }
                    return nn
                })
                setNodes(nds => {
                    const deselected = nds.map(n => ({ ...n, selected: false }))
                    return [...deselected, ...newNodes]
                })
                for (const nn of newNodes) {
                    engineRef.current?.addNode(nn.id, nn.data.processor, { ...nn.data.params })
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [nodes, setNodes, handleUndo, handleRedo])

    /* ── Export / Import ── */
    const exportScene = useCallback(() => {
        const engine = engineRef.current
        const exportNodes = nodes.map(n => {
            if (n.data.processor === 'image' && engine) {
                const proc = engine.getProcessor<ImageProcessor>(n.id)
                if (proc?.loadedUrl) {
                    return { ...n, data: { ...n.data, imageUrl: proc.loadedUrl } }
                }
            }
            return n
        })
        const data: SceneData = { nodes: exportNodes, edges, nodeIdCounter }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'scene.json'
        a.click()
        URL.revokeObjectURL(url)
    }, [nodes, edges])

    const importScene = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
                const text = await file.text()
                const scene = JSON.parse(text) as SceneData
                if (!scene.nodes || !scene.edges) return
                const engine = engineRef.current
                if (!engine) return

                await applySnapshot(
                    scene.nodes as SerializedNode[],
                    scene.edges as SerializedEdge[],
                    scene.nodeIdCounter ?? 0,
                    engine,
                )
                await persistBlobs()
                const ser = serializeScene()
                await sceneStore.pushSnapshot({ label: 'import', ...ser })
            } catch { /* bad json */ }
        }
        input.click()
    }, [applySnapshot, persistBlobs, serializeScene])

    const clearScene = useCallback(async () => {
        for (const n of nodes) engineRef.current?.removeNode(n.id)
        setNodes([])
        setEdges([])
        await sceneStore.clearAll()
    }, [nodes, setNodes, setEdges])

    /* ── Per-edge stroke colour from source node's category ──
       Reroute nodes fall through to their incoming edge's colour so the
       hop appears as a continuous coloured line. */
    const colouredEdges = useMemo(() => {
        const colorByNode = new Map<string, string>()
        const isReroute = new Set<string>()
        for (const n of nodes) {
            if (n.data?.processor === 'reroute') isReroute.add(n.id)
            const cat = PROCESSOR_CATALOG[n.data?.processor]?.def.category
            colorByNode.set(n.id, categoryColor(cat))
        }
        /* Resolve the actual upstream colour for reroutes by walking back
           through their incoming edge until we hit a real node. */
        const resolvedColor = (id: string, depth = 0): string => {
            if (depth > 32) return colorByNode.get(id) ?? categoryColor(undefined)
            if (!isReroute.has(id)) return colorByNode.get(id) ?? categoryColor(undefined)
            const incoming = edges.find(e => e.target === id)
            if (!incoming) return colorByNode.get(id) ?? categoryColor(undefined)
            return resolvedColor(incoming.source, depth + 1)
        }
        return edges.map(e => {
            const stroke = resolvedColor(e.source)
            const existing = (e.style ?? {}) as React.CSSProperties
            return { ...e, style: { ...existing, stroke } }
        })
    }, [edges, nodes])

    if (!engineReady || !engineRef.current) {
        return <div className="node-editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Initializing GPU...</div>
    }

    /* Explicit, hand-curated menu layout. The auto-grouping by
     * `def.category` collapsed everything into 5 over-broad bins
     * ("source" mixed images, polygons, signals, text generators) which
     * scaled badly past ~30 nodes. Here groups follow the user's actual
     * mental model — what kind of *task* the node performs — and items
     * are ordered roughly by how often they're reached for. Groups
     * collapse to their items in the order listed; items not present in
     * the catalog are silently skipped, so adding a new processor only
     * requires touching this list. */
    const menuGroups: { title: string; items: string[] }[] = [
        {
            title: 'Inputs',
            items: ['image', 'polygon', 'segmentation', 'number', 'sdfTextAtlas', 'textStrip'],
        },
        {
            title: 'Animation · Triggers',
            items: ['tap', 'autoTimer'],
        },
        {
            title: 'Animation · Modulators',
            items: ['envelope', 'combineSignals'],
        },
        {
            title: 'Animation · Controllers',
            items: ['ribbonAnimController', 'particlesAnimController', 'fullscreenAnimController'],
        },
        {
            title: 'Image Ops',
            items: ['blur', 'remap', 'blend', 'denoise', 'edgeDetect', 'sdf', 'sdfFromContour'],
        },
        {
            title: 'Contour',
            items: ['contourResample'],
        },
        {
            title: 'Depth',
            items: ['depthEstimate', 'depthBlit', 'depthProject'],
        },
        {
            title: 'AI / ML',
            items: ['materialEstimate', 'marigoldDepth', 'marigoldNormals', 'qwenImageEdit', 'textRemovalMask'],
        },
        {
            title: 'Output',
            items: ['effect', 'preview', 'contourPreview'],
        },
        {
            title: 'Utilities',
            items: ['config'],
        },
    ]
        /* Filter out anything hidden, missing from the catalog, or the
         * special internal `reroute` waypoint (added by edge double-click). */
        .map(g => ({
            ...g,
            items: g.items.filter(t => {
                const e = PROCESSOR_CATALOG[t]
                return e && !e.def.hidden && t !== 'reroute'
            }),
        }))
        .filter(g => g.items.length > 0)

    return (
        <EngineProvider value={engineRef.current}>
            <PinProvider liveNodeIds={liveNodeIds}>
                <div className="node-editor">
                    <Box
                        component="header"
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 2,
                            py: 1,
                            bgcolor: 'background.paper',
                            borderBottom: 1,
                            borderColor: 'divider',
                        }}
                    >
                        <Button
                            component={Link}
                            to="/"
                            size="small"
                            variant="text"
                            color="inherit"
                            startIcon={<ArrowBackIcon fontSize="small" />}
                        >
                            Back
                        </Button>
                        <Divider orientation="vertical" flexItem />
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                            Node Pipeline
                        </Typography>
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title={sidebarOpen ? 'Hide pin sidebar' : 'Show pin sidebar'}>
                            <Button
                                size="small"
                                variant="text"
                                color="inherit"
                                onClick={() => setSidebarOpen(v => !v)}
                                startIcon={sidebarOpen
                                    ? <PushPinIcon fontSize="small" />
                                    : <PushPinOutlinedIcon fontSize="small" />}
                            >
                                Pins
                            </Button>
                        </Tooltip>
                        <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Undo (⌘Z)">
                                <Button size="small" variant="text" color="inherit" onClick={handleUndo} startIcon={<UndoIcon fontSize="small" />}>
                                    Undo
                                </Button>
                            </Tooltip>
                            <Tooltip title="Redo (⌘⇧Z)">
                                <Button size="small" variant="text" color="inherit" onClick={handleRedo} startIcon={<RedoIcon fontSize="small" />}>
                                    Redo
                                </Button>
                            </Tooltip>
                        </Stack>
                        <Divider orientation="vertical" flexItem />
                        <Stack direction="row" spacing={0.5}>
                            <Button size="small" variant="text" color="inherit" onClick={exportScene} startIcon={<IosShareIcon fontSize="small" />}>
                                Export
                            </Button>
                            <Button size="small" variant="text" color="inherit" onClick={importScene} startIcon={<FileUploadIcon fontSize="small" />}>
                                Import
                            </Button>
                            <Button size="small" variant="text" color="error" onClick={clearScene} startIcon={<DeleteSweepIcon fontSize="small" />}>
                                Clear
                            </Button>
                        </Stack>
                    </Box>
                    <div className="node-editor-body">
                        <div className="node-editor-graph-full">
                            <ReactFlow
                                nodes={nodes}
                                edges={colouredEdges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onNodesDelete={onNodesDelete}
                                isValidConnection={isValidConnection}
                                nodeTypes={pipelineNodeTypes as unknown as NodeTypes}
                                onEdgeDoubleClick={onEdgeDoubleClick}
                                onPaneContextMenu={onPaneContextMenu}
                                onClick={() => setContextMenu(null)}
                                deleteKeyCode={['Delete', 'Backspace']}
                                multiSelectionKeyCode="Shift"
                                selectionKeyCode="Shift"
                                minZoom={0.2}
                                maxZoom={3}
                                /* Smoothstep for every edge — applied to new
                                   connections (via addEdge) and to edges
                                   loaded from the persisted scene that have
                                   no explicit type. */
                                defaultEdgeOptions={{ type: 'smoothstep' }}
                            >
                                <Background color="rgba(255,255,255,0.05)" gap={20} size={1} />
                            </ReactFlow>
                            <Popover
                                open={!!contextMenu}
                                anchorReference="anchorPosition"
                                anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
                                onClose={() => setContextMenu(null)}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            bgcolor: 'background.paper',
                                            border: 1,
                                            borderColor: 'divider',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                            maxHeight: '80vh',
                                        },
                                    },
                                }}
                            >
                                {/* CSS column-count gives a natural masonry-ish
                                    flow: each group block stays whole (break-
                                    inside: avoid) and the renderer balances
                                    the two columns by total height — much
                                    nicer than `grid 1fr 1fr` for unevenly-
                                    sized groups. */}
                                <Box
                                    sx={{
                                        columnCount: 2,
                                        columnGap: '12px',
                                        p: 1,
                                        width: 460,
                                    }}
                                >
                                    {menuGroups.map(group => (
                                        <Box
                                            key={group.title}
                                            sx={{
                                                breakInside: 'avoid',
                                                pageBreakInside: 'avoid',
                                                display: 'inline-block',
                                                width: '100%',
                                                mb: 1,
                                            }}
                                        >
                                            <Typography
                                                component="div"
                                                sx={{
                                                    px: 1.5,
                                                    pt: 0.5,
                                                    pb: 0.5,
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: 'text.disabled',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: 0.8,
                                                    borderBottom: 1,
                                                    borderColor: 'divider',
                                                    mb: 0.25,
                                                }}
                                            >
                                                {group.title}
                                            </Typography>
                                            <MenuList dense disablePadding>
                                                {group.items.map(t => (
                                                    <MenuItem
                                                        key={t}
                                                        onClick={() => addNode(t)}
                                                        sx={{ fontSize: 12, py: 0.5, pl: 1.5 }}
                                                    >
                                                        {PROCESSOR_CATALOG[t].def.title}
                                                    </MenuItem>
                                                ))}
                                            </MenuList>
                                        </Box>
                                    ))}
                                </Box>
                            </Popover>
                        </div>
                        <NodePinSidebar
                            nodes={nodes}
                            visible={sidebarOpen}
                            onClose={() => setSidebarOpen(false)}
                        />
                    </div>
                </div>
            </PinProvider>
        </EngineProvider>
    )
}

export function NodeEditor() {
    return (
        <ReactFlowProvider>
            <NodeEditorInner />
        </ReactFlowProvider>
    )
}
