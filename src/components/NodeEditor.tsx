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
    type EdgeTypes,
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
import { EditableStepEdge } from './flow-nodes/EditableStepEdge'
import { categoryColor } from './flow-nodes/categoryColors'
import type { PipelineNodeData } from './flow-nodes/types'
import { SLOT } from '../node-engine/types'
import { sceneStore, type SerializedNode, type SerializedEdge } from '../node-engine/scene-store'
import { PinProvider } from './flow-nodes/PinContext'
import { NodePinSidebar } from './flow-nodes/NodePinSidebar'

type PNode = Node<PipelineNodeData>

let nodeIdCounter = 0
function nextId(): string { return `n_${++nodeIdCounter}` }

/* React Flow edge type registry. Single entry — every connection uses the
   custom orthogonal "editable step" edge with hover-revealed per-segment
   drag handles (replaces the old reroute waypoint node). */
const pipelineEdgeTypes: EdgeTypes = { editableStep: EditableStepEdge }

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

/* Editor grid step (px in flow space). Drives both:
   - <Background gap> dot pattern, so the dotted grid users see is the
     exact grid they snap against;
   - <ReactFlow snapGrid> for node move/resize, so any drag/resize lands
     on a multiple of GRID_SIZE.
   Initial node placement (context-menu insert, paste duplicate) is also
   floored to GRID_SIZE so a freshly-spawned node is immediately on-grid. */
const GRID_SIZE = 20

function snapToGrid(value: number, step: number = GRID_SIZE): number {
    return Math.round(value / step) * step
}

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
            /* React Flow v12 stashes NodeResizer-driven dimensions on the
               node directly (`width`/`height`), so persist them too — else
               a resized card "snaps back" to its content size on reload. */
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
                    /* Persisted explicit dimensions (NodeResizer output)
                       round-trip directly onto the React Flow node so the
                       card opens at the size the user last left it at. */
                    ...(typeof sn.width === 'number' ? { width: sn.width } : {}),
                    ...(typeof sn.height === 'number' ? { height: sn.height } : {}),
                } as PNode)
            }
            setNodes(restoredNodes)

            /* Drop edges whose endpoints didn't survive (e.g. legacy
               reroute waypoints that no longer exist in the catalog) and
               normalise edge type to the new orthogonal editable step
               renderer — this transparently migrates older snapshots that
               were saved as `smoothstep`. */
            const aliveIds = new Set(restoredNodes.map(n => n.id))
            const migratedEdges = (snapEdges as Edge[])
                .filter(e => aliveIds.has(e.source) && aliveIds.has(e.target))
                .map(e => ({ ...e, type: 'editableStep' }))
            setEdges(migratedEdges)
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
            position: {
                x: snapToGrid(contextMenu?.flowX ?? 200),
                y: snapToGrid(contextMenu?.flowY ?? 200),
            },
            data: { processor: processorType, params: { ...entry.def.defaultParams } },
            ...(processorType === 'preview' ? { style: { width: 300 } } : {}),
        }
        setNodes(nds => [...nds, newNode])
        engineRef.current?.addNode(id, processorType, { ...entry.def.defaultParams })
        setContextMenu(null)
    }, [setNodes, contextMenu])

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
                /* Two-cell paste offset keeps the clones visibly off the
                   originals while still landing on grid intersections. */
                const offset = GRID_SIZE * 2
                const newNodes: PNode[] = clipboardRef.current.map(n => {
                    const id = nextId()
                    const nn: PNode = {
                        id,
                        type: n.type,
                        position: {
                            x: snapToGrid(n.position.x + offset),
                            y: snapToGrid(n.position.y + offset),
                        },
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

    /* ── Per-edge stroke colour from source node's category. ── */
    const colouredEdges = useMemo(() => {
        const colorByNode = new Map<string, string>()
        for (const n of nodes) {
            const cat = PROCESSOR_CATALOG[n.data?.processor]?.def.category
            colorByNode.set(n.id, categoryColor(cat))
        }
        return edges.map(e => {
            const stroke = colorByNode.get(e.source) ?? categoryColor(undefined)
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
            items: ['blur', 'remap', 'blend', 'denoise', 'sdfFromContour'],
        },
        {
            title: 'Contour',
            items: ['contourResample'],
        },
        {
            title: 'Depth',
            items: ['depthEstimate', 'depthBlit'],
        },
        {
            title: 'AI / ML',
            items: ['materialEstimate', 'marigoldDepth', 'marigoldNormals'],
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
        /* Filter out anything hidden or missing from the catalog. */
        .map(g => ({
            ...g,
            items: g.items.filter(t => {
                const e = PROCESSOR_CATALOG[t]
                return e && !e.def.hidden
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
                                edgeTypes={pipelineEdgeTypes}
                                onPaneContextMenu={onPaneContextMenu}
                                onClick={() => setContextMenu(null)}
                                deleteKeyCode={['Delete', 'Backspace']}
                                multiSelectionKeyCode="Shift"
                                selectionKeyCode="Shift"
                                minZoom={0.2}
                                maxZoom={3}
                                /* Custom orthogonal edge with hover-revealed
                                   per-segment drag handles (replaces both
                                   smoothstep and the old reroute-node hop). */
                                defaultEdgeOptions={{ type: 'editableStep' }}
                                /* Grid-aligned movement & resize. React Flow
                                   applies snapGrid to BOTH node drag and the
                                   NodeResizer, so we get consistent step in
                                   one place. The visual dot pattern below
                                   uses the same step so what you see is
                                   what you snap to. */
                                snapToGrid
                                snapGrid={[GRID_SIZE, GRID_SIZE]}
                            >
                                <Background color="rgba(255,255,255,0.05)" gap={GRID_SIZE} size={1} />
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
