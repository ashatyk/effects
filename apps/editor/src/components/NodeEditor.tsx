/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    addEdge,
    useReactFlow,
    applyNodeChanges,
    applyEdgeChanges,
    type Connection,
    type Edge,
    type Node,
    type NodeChange,
    type EdgeChange,
    type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './node-editor.css'

import {
    DataflowEngine,
    PROCESSOR_CATALOG,
    ImageProcessor,
    SLOT,
    type PublishError,
} from '@effects/runtime'
import { sceneStore, type SceneSnapshot, type SerializedNode, type SerializedEdge, type SerializedPage } from '@/scene-store'
import { deriveFromPages } from './node-editor/publish-from-pages'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

import { EngineProvider } from './flow-nodes/context/EngineContext'
import { pipelineNodeTypes } from './flow-nodes/nodeTypes'
import { PinProvider, usePinState } from './flow-nodes/context/PinContext'
import { RightRail } from './node-editor/RightRail'

import {
    GRID_SIZE, snapToGrid, nextId, getNodeIdCounter, setNodeIdCounter, maxNodeIdNumber,
    pipelineEdgeTypes, SLOT_COMPAT, CLONE_DRAG_MIME,
    type PipelineNodeData,
} from './node-editor/constants'
import { getMenuGroups } from './node-editor/menuGroups'
import { useSceneHistory } from './node-editor/hooks/useSceneHistory'
import { useNodeEditorShortcuts } from './node-editor/hooks/useNodeEditorShortcuts'
import { useEdgeColouring } from './node-editor/hooks/useEdgeColouring'
import { usePipelineEngine } from './node-editor/hooks/usePipelineEngine'
import { NodeEditorToolbar, FPS_OPTIONS, type FpsOption } from './node-editor/NodeEditorToolbar'
import { AddNodePopover, type AddNodeAction } from './node-editor/AddNodePopover'
import { NodeEditorTabs } from './node-editor/NodeEditorTabs'
import { SceneOutlineSidebar } from './flow-nodes/SceneOutlineSidebar'
import { SceneProvider, useSceneState } from './node-editor/SceneContext'
import {
    resolveSceneForEngine, wouldCreateCycle,
    type PageState,
} from './node-editor/sceneResolver'
import {
    FRAME_DEFAULT_HEIGHT, FRAME_DEFAULT_WIDTH, FRAME_PROCESSOR, frameDefaultParams,
} from './flow-nodes/frame-constants'

type PNode = Node<PipelineNodeData>

interface SceneFile {
    pages?: SerializedPage[]
    activePageId?: string
    nodeIdCounter: number
    pinnedIds?: string[]
    /* Legacy single-page export — only present when reading old files. */
    nodes?: SerializedNode[]
    edges?: SerializedEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

function NodeEditorInner() {
    const scene = useSceneState()
    const { pages, activePageId, activePage, setActiveNodes, setActiveEdges, replaceScene } = scene

    const engineRef = useRef<DataflowEngine | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
    /* Legacy Pin terminal was retired; `PinContext` + per-card
       `PinToggle` survive as latent infrastructure with no consumer. */
    const [publishMessage, setPublishMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
    const [fps, setFps] = useState<FpsOption>(() => {
        try {
            const raw = localStorage.getItem('nodeEditor.fps.v1')
            const n = raw == null ? 60 : Number(raw)
            return (FPS_OPTIONS as readonly number[]).includes(n) ? (n as FpsOption) : 60
        } catch { return 60 }
    })
    const { screenToFlowPosition, getViewport, setViewport } = useReactFlow()

    /* Union across pages so pins survive page switches and are reaped
       only when the underlying node is deleted everywhere. */
    const liveNodeIds = useMemo(() => {
        const set = new Set<string>()
        for (const p of pages) for (const n of p.nodes) set.add(n.id)
        return set
    }, [pages])

    /* Hash only the parts the engine cares about (node ids, processor
       types, clone wiring, edges); excluding viewport/name/order means
       page switches don't cascade into `setEdges` → `rebuildGraph` →
       full re-execution, which used to manifest as a tab-switch freeze
       on heavy effect/segmentation graphs. */
    const pagesStructuralHash = useMemo(() => {
        const parts: string[] = []
        for (const p of pages) {
            for (const n of p.nodes) {
                parts.push(`N:${n.id}:${n.data.processor}:${n.data.cloneOf ?? ''}`)
            }
            for (const e of p.edges) {
                parts.push(`E:${e.source}:${e.sourceHandle ?? ''}>${e.target}:${e.targetHandle ?? ''}`)
            }
        }
        return parts.join('|')
    }, [pages])

    /* Persist the FPS choice so a fresh tab keeps the user's preference. */
    useEffect(() => {
        try { localStorage.setItem('nodeEditor.fps.v1', String(fps)) } catch { /* */ }
        engineRef.current?.setTargetFps(fps)
    }, [fps])

    /* Pin state is captured in snapshots, hence lifted above PinProvider. */
    const pin = usePinState({ liveNodeIds })

    const {
        serializeScene, persistBlobs, pushSnapshot, applySnapshot,
        handleUndo, handleRedo,
    } = useSceneHistory({
        pages,
        activePageId,
        replaceScene,
        engineRef,
        pinnedIds: pin.pinnedIds,
        setPinnedIds: pin.setAll,
        getViewport, setViewport,
    })

    const { engineReady } = usePipelineEngine({ engineRef, applySnapshot })

    /* Engine is created asynchronously inside usePipelineEngine, so the
       earlier `fps` effect couldn't push the cap yet. Re-apply on ready. */
    useEffect(() => {
        if (!engineReady) return
        engineRef.current?.setTargetFps(fps)
    }, [engineReady, fps])

    useNodeEditorShortcuts({
        nodes: activePage.nodes,
        setNodes: setActiveNodes,
        engineRef,
        handleUndo, handleRedo,
    })

    const colouredEdges = useEdgeColouring(activePage.nodes, activePage.edges, pages)

    useEffect(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [pages, activePageId, pin.pinnedIds, engineReady, pushSnapshot])

    /* React Flow drives pan/zoom through its internal store without
       mutating `nodes`/`edges`, so the auto-save effect above misses
       viewport changes — `onMoveEnd` queues a (debounced) snapshot
       once the user stops panning/zooming. */
    const onMoveEnd = useCallback(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [engineReady, pushSnapshot])

    /* Sync engine edges from the resolved (clone-rewritten) scene on
       STRUCTURAL changes only — viewport-only page switches must not
       re-fire setEdges (rebuildGraph marks every node dirty). Also
       fires on the engine-ready transition so the first edge push
       happens after the engine boots. */
    useEffect(() => {
        if (!engineRef.current) return
        const { resolvedEdges } = resolveSceneForEngine(pages)
        engineRef.current.setEdges(resolvedEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagesStructuralHash, engineReady])

    /* Snap intrinsic-measurement dimensions UP to a multiple of
       GRID_SIZE (RF's snapToGrid only handles drag/resize, not initial
       measure). `setAttributes: true` writes the snapped values to
       node.width/height so the rendered DOM matches; idempotent when
       already grid-aligned to avoid spurious change objects. */
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        const snapped = changes.map(c => {
            if (c.type !== 'dimensions' || !c.dimensions) return c
            const w = Math.ceil(c.dimensions.width  / GRID_SIZE) * GRID_SIZE
            const h = Math.ceil(c.dimensions.height / GRID_SIZE) * GRID_SIZE
            if (w === c.dimensions.width && h === c.dimensions.height) return c
            return { ...c, dimensions: { width: w, height: h }, setAttributes: true as const }
        })
        setActiveNodes(prev => applyNodeChanges(snapped, prev) as PNode[])
    }, [setActiveNodes])

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
        setActiveEdges(prev => applyEdgeChanges(changes, prev))
    }, [setActiveEdges])

    const onConnect = useCallback((conn: Connection) => {
        if (!conn.source || !conn.target) return
        if (wouldCreateCycle(pages, conn.source, conn.target)) return
        setActiveEdges(eds => {
            const filtered = eds.filter(
                e => !(e.target === conn.target && e.targetHandle === conn.targetHandle),
            )
            return addEdge(conn, filtered)
        })
        /* Mark the engine target dirty so the new wire takes effect
           next tick. Target is always real today (clones have no
           inputs) but resolve symmetrically for future safety. */
        const cloneToOrigin = new Map<string, string>()
        for (const p of pages) for (const n of p.nodes) {
            if (n.data.cloneOf) cloneToOrigin.set(n.id, n.data.cloneOf)
        }
        const realTarget = cloneToOrigin.get(conn.target) ?? conn.target
        engineRef.current?.markDirty(realTarget)
    }, [pages, setActiveEdges])

    const isValidConnection = useCallback((conn: Connection | Edge) => {
        if (!conn.source || !conn.target) return false
        /* Resolve both endpoints through clone aliases (source is the
           common case; target is always real today but kept symmetric). */
        const cloneToOrigin = new Map<string, string>()
        for (const p of pages) for (const n of p.nodes) {
            if (n.data.cloneOf) cloneToOrigin.set(n.id, n.data.cloneOf)
        }
        const srcId = cloneToOrigin.get(conn.source) ?? conn.source
        const tgtId = cloneToOrigin.get(conn.target) ?? conn.target
        if (srcId === tgtId) return false

        let sourceNode: PNode | undefined
        let targetNode: PNode | undefined
        for (const p of pages) {
            for (const n of p.nodes) {
                if (!sourceNode && n.id === srcId) sourceNode = n
                if (!targetNode && n.id === tgtId) targetNode = n
                if (sourceNode && targetNode) break
            }
            if (sourceNode && targetNode) break
        }
        if (!sourceNode || !targetNode) return false

        const srcDef = PROCESSOR_CATALOG[sourceNode.data.processor]?.def
        const tgtDef = PROCESSOR_CATALOG[targetNode.data.processor]?.def
        if (!srcDef || !tgtDef) return false

        const srcHandle = srcDef.outputs.find(o => o.name === conn.sourceHandle)
        const tgtHandle = tgtDef.inputs.find(i => i.name === conn.targetHandle)
        if (!srcHandle || !tgtHandle) return false

        const slotOk = srcHandle.type === SLOT.ANY || tgtHandle.type === SLOT.ANY
            || (SLOT_COMPAT[srcHandle.type]?.has(tgtHandle.type) ?? srcHandle.type === tgtHandle.type)
        if (!slotOk) return false

        if (wouldCreateCycle(pages, conn.source, conn.target)) return false
        return true
    }, [pages])

    const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
        event.preventDefault()
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        setContextMenu({ x: event.clientX, y: event.clientY, flowX: flowPos.x, flowY: flowPos.y })
    }, [screenToFlowPosition])

    /* Heal the global node-id counter against every page's max suffix
       before minting; covers every node-creation path (processor add,
       clone add, restore). */
    const healAndMintNodeId = useCallback((): string => {
        const allNodes: { id: string }[] = []
        for (const p of pages) for (const n of p.nodes) allNodes.push(n)
        setNodeIdCounter(Math.max(getNodeIdCounter(), maxNodeIdNumber(allNodes)))
        return nextId()
    }, [pages])

    const addProcessorNode = useCallback((type: string, position: { x: number; y: number }) => {
        const entry = PROCESSOR_CATALOG[type]
        if (!entry) return
        const id = healAndMintNodeId()
        /* Auto-mint stable event ids for `tapZone` / `eventEmitter`:
           Tier-3 dispatches route on these, so renaming `data.label`
           must not invalidate external glue. Scan scene-wide ids to
           avoid collisions and to keep the publish validator's
           duplicate-id check satisfied. */
        const params: Record<string, unknown> = { ...entry.def.defaultParams }
        if (type === 'tapZone' || type === 'eventEmitter') {
            const prefix = type === 'tapZone' ? 'tap' : 'evt'
            const used = new Set<string>()
            for (const p of pages) {
                for (const n of p.nodes) {
                    if (n.data.processor !== type) continue
                    const v = (n.data.params as Record<string, unknown>).id
                    if (typeof v === 'string' && v) used.add(v)
                }
            }
            let i = 1
            while (used.has(`${prefix}_${i}`)) i++
            params.id = `${prefix}_${i}`
        }
        const newNode: PNode = {
            id,
            type,
            position: { x: snapToGrid(position.x), y: snapToGrid(position.y) },
            data: { processor: type, params },
            ...(type === 'preview' ? { style: { width: 300 } } : {}),
        }
        setActiveNodes(nds => [...nds, newNode])
        engineRef.current?.addNode(id, type, { ...params })
    }, [healAndMintNodeId, pages, setActiveNodes])

    /* UI-only frame node — engine is never informed; lives in pages[]
       so undo/redo + import/export carry it. `zIndex: -1` plus the
       `.react-flow__node-frame { z-index: -1 !important }` rule in
       `frame-card.css` keeps frames painted behind processor nodes
       even when selected (RF's `elevateNodesOnSelect` would
       otherwise bump them to the top). */
    const addFrameNode = useCallback((position: { x: number; y: number }) => {
        const id = healAndMintNodeId()
        const newNode: PNode = {
            id,
            type: FRAME_PROCESSOR,
            position: { x: snapToGrid(position.x), y: snapToGrid(position.y) },
            data: { processor: FRAME_PROCESSOR, params: { ...frameDefaultParams() } },
            width: FRAME_DEFAULT_WIDTH,
            height: FRAME_DEFAULT_HEIGHT,
            zIndex: -1,
        } as PNode
        setActiveNodes(nds => [...nds, newNode])
    }, [healAndMintNodeId, setActiveNodes])

    /* Viewer-only clone — engine is never informed; outgoing edges
       are rewritten to the original by sceneResolver. */
    const addCloneNode = useCallback((originId: string, position: { x: number; y: number }) => {
        const id = healAndMintNodeId()
        const cloneNode: PNode = {
            id,
            type: 'clone',
            position: { x: snapToGrid(position.x), y: snapToGrid(position.y) },
            data: { processor: 'clone', params: {}, cloneOf: originId },
        }
        setActiveNodes(nds => [...nds, cloneNode])
    }, [healAndMintNodeId, setActiveNodes])

    /* Picker emits processor or frame actions; clones come from
       SceneOutlineSidebar via drag-and-drop. The `clone` variant
       below is kept for back-compat / programmatic callers. */
    const onAddFromPopover = useCallback((action: AddNodeAction) => {
        const pos = { x: contextMenu?.flowX ?? 200, y: contextMenu?.flowY ?? 200 }
        if (action.kind === 'processor') {
            addProcessorNode(action.type, pos)
        } else if (action.kind === 'clone') {
            addCloneNode(action.originId, pos)
        } else if (action.kind === 'frame') {
            addFrameNode(pos)
        }
        setContextMenu(null)
    }, [addProcessorNode, addCloneNode, addFrameNode, contextMenu])

    const onCanvasDragOver = useCallback((event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes(CLONE_DRAG_MIME)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
    }, [])

    const onCanvasDrop = useCallback((event: React.DragEvent) => {
        const originId = event.dataTransfer.getData(CLONE_DRAG_MIME)
        if (!originId) return
        event.preventDefault()
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        addCloneNode(originId, flowPos)
    }, [screenToFlowPosition, addCloneNode])

    const onNodesDelete = useCallback((deleted: PNode[]) => {
        for (const n of deleted) {
            if (n.data.cloneOf) continue   // clone is UI-only; engine never knew about it
            if (n.data.processor === FRAME_PROCESSOR) continue   // frame is UI-only markup
            engineRef.current?.removeNode(n.id)
        }
    }, [])

    const exportScene = useCallback(() => {
        const engine = engineRef.current
        const exportPages: SerializedPage[] = pages.map(page => {
            const exportNodes: SerializedNode[] = page.nodes.map(n => {
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
                        sn.data.imageUrl = proc.loadedUrl
                    }
                }
                return sn
            })
            return {
                id: page.id,
                name: page.name,
                nodes: exportNodes,
                edges: page.edges as SerializedEdge[],
                viewport: page.id === activePageId
                    ? (() => { try { return getViewport() } catch { return page.viewport } })()
                    : page.viewport,
            }
        })
        const data: SceneFile = {
            pages: exportPages,
            activePageId,
            /* Persist the live counter so re-import / fresh-tab load
               doesn't hand out IDs already used in the exported graph. */
            nodeIdCounter: getNodeIdCounter(),
            pinnedIds: [...pin.pinnedIds],
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'scene.json'
        a.click()
        URL.revokeObjectURL(url)
    }, [pages, activePageId, pin.pinnedIds, getViewport])

    const importScene = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
                const text = await file.text()
                const scene = JSON.parse(text) as SceneFile
                const engine = engineRef.current
                if (!engine) return

                /* applySnapshot reads either `pages` or the legacy
                   `nodes`/`edges`/`viewport` triplet — same migration
                   path the Dexie loader uses. */
                const snap: SceneSnapshot = {
                    timestamp: Date.now(),
                    label: 'import',
                    nodeIdCounter: scene.nodeIdCounter ?? 0,
                    pinnedIds: scene.pinnedIds,
                    pages: scene.pages,
                    activePageId: scene.activePageId,
                    nodes: scene.nodes,
                    edges: scene.edges,
                    viewport: scene.viewport,
                }
                await applySnapshot(snap, engine)
                await persistBlobs()
                const ser = serializeScene()
                await sceneStore.pushSnapshot({ label: 'import', ...ser })
            } catch { /* bad json */ }
        }
        input.click()
    }, [applySnapshot, persistBlobs, serializeScene])

    /* On success downloads `<effectId>.published.json` — the contract
       Tier-2 supplier-app and Tier-3 runtime consume. The snackbar is
       intentionally terse; the inspector + PublishRoot card already
       render full inline error lists. */
    const publishScene = useCallback(() => {
        const result = deriveFromPages(pages)
        if (!result.ok) {
            setPublishMessage({
                tone: 'error',
                text: `Publish failed (${result.errors.length} error${result.errors.length === 1 ? '' : 's'}): ${describePublishError(result.errors[0])}`,
            })
            return
        }
        const { pipeline } = result
        const blob = new Blob([JSON.stringify(pipeline, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${pipeline.id}.published.json`
        a.click()
        URL.revokeObjectURL(url)
        setPublishMessage({
            tone: 'success',
            text: `Published "${pipeline.name}" v${pipeline.version} (${pipeline.graph.nodes.length} nodes).`,
        })
    }, [pages])

    if (!engineReady || !engineRef.current) {
        return <div className="node-editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Initializing GPU...</div>
    }

    const menuGroups = getMenuGroups()

    return (
        <SceneProvider value={scene}>
            <EngineProvider value={engineRef.current}>
                <PinProvider value={pin}>
                    <div className="node-editor">
                        <NodeEditorToolbar
                            onExport={exportScene}
                            onImport={importScene}
                            onPublish={publishScene}
                            fps={fps}
                            onFpsChange={setFps}
                        />
                        <div className="node-editor-body">
                            <SceneOutlineSidebar />
                            <div className="node-editor-main">
                                <NodeEditorTabs />
                                <div className="node-editor-graph-row">
                                    <div
                                        className="node-editor-graph-full"
                                        onDragOver={onCanvasDragOver}
                                        onDrop={onCanvasDrop}
                                    >
                                        <ReactFlow
                                            /* Intentionally NO `key={activePageId}`:
                                               remounting on every page switch tore
                                               down + rebuilt every node card (each
                                               Effect/Preview/Segmentation pays
                                               canvas init + subscriber setup) — the
                                               user-visible "freeze on tab switch".
                                               xyflow's own diff against the nodes/
                                               edges arrays handles page swaps
                                               cheaply. */
                                            nodes={activePage.nodes}
                                            edges={colouredEdges}
                                            onNodesChange={onNodesChange}
                                            onEdgesChange={onEdgesChange}
                                            onConnect={onConnect}
                                            onNodesDelete={onNodesDelete}
                                            isValidConnection={isValidConnection}
                                            nodeTypes={pipelineNodeTypes as unknown as NodeTypes}
                                            edgeTypes={pipelineEdgeTypes}
                                            onPaneContextMenu={onPaneContextMenu}
                                            onMoveEnd={onMoveEnd}
                                            onClick={() => setContextMenu(null)}
                                            deleteKeyCode={['Delete', 'Backspace']}
                                            multiSelectionKeyCode="Shift"
                                            selectionKeyCode="Shift"
                                            minZoom={0.2}
                                            maxZoom={3}
                                            defaultViewport={activePage.viewport}
                                            defaultEdgeOptions={{ type: 'editableStep' }}
                                            snapToGrid
                                            snapGrid={[GRID_SIZE, GRID_SIZE]}
                                            proOptions={{ hideAttribution: true }}
                                        >
                                            <Background color="rgba(255,255,255,0.07)" gap={GRID_SIZE} size={1} />
                                        </ReactFlow>
                                        <AddNodePopover
                                            open={!!contextMenu}
                                            anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
                                            onClose={() => setContextMenu(null)}
                                            groups={menuGroups}
                                            onAdd={onAddFromPopover}
                                        />
                                    </div>
                                </div>
                            </div>
                            <RightRail />
                        </div>
                        <Snackbar
                            open={publishMessage != null}
                            autoHideDuration={publishMessage?.tone === 'success' ? 3500 : 6000}
                            onClose={() => setPublishMessage(null)}
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        >
                            {publishMessage ? (
                                <Alert
                                    severity={publishMessage.tone}
                                    variant="filled"
                                    onClose={() => setPublishMessage(null)}
                                    sx={{ fontSize: 12 }}
                                >
                                    {publishMessage.text}
                                </Alert>
                            ) : undefined}
                        </Snackbar>
                    </div>
                </PinProvider>
            </EngineProvider>
        </SceneProvider>
    )
}

export function NodeEditor() {
    return (
        <ReactFlowProvider>
            <NodeEditorInner />
        </ReactFlowProvider>
    )
}

export type { PageState }

function describePublishError(e: PublishError): string {
    switch (e.kind) {
        case 'no-root': return 'no PublishRoot node'
        case 'multiple-roots': return `${e.nodeIds.length} PublishRoot nodes`
        case 'orphan-exposed': return `orphan exposed node ${e.nodeId}`
        case 'duplicate-tap-id': return `duplicate tap id "${e.eventId}"`
        case 'image-slot-missing-label': return `image slot ${e.nodeId} missing label`
        case 'effect-id-missing': return 'PublishRoot.id (slug) is empty'
    }
}
