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
import { NodePinTerminal } from './flow-nodes/NodePinTerminal'
import { PublishInspector } from './node-editor/PublishInspector'

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
    DEFAULT_PAGE_ID, DEFAULT_PAGE_NAME,
    type PageState,
} from './node-editor/sceneResolver'

type PNode = Node<PipelineNodeData>

interface SceneFile {
    pages?: SerializedPage[]
    activePageId?: string
    nodeIdCounter: number
    pinnedIds?: string[]
    /* Legacy (single-page) export — only present when reading old files. */
    nodes?: SerializedNode[]
    edges?: SerializedEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

function NodeEditorInner() {
    /* Scene state (pages + active id) lives here so it can be passed
       through SceneProvider and consumed by everything below. */
    const scene = useSceneState()
    const { pages, activePageId, activePage, setActiveNodes, setActiveEdges, replaceScene } = scene

    const engineRef = useRef<DataflowEngine | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('nodeEditor.sidebarOpen.v1') !== '0' } catch { return true }
    })
    const [outlineOpen, setOutlineOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('nodeEditor.outlineOpen.v1') !== '0' } catch { return true }
    })
    const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('nodeEditor.inspectorOpen.v1') !== '0' } catch { return true }
    })
    const [publishMessage, setPublishMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
    const [fps, setFps] = useState<FpsOption>(() => {
        try {
            const raw = localStorage.getItem('nodeEditor.fps.v1')
            const n = raw == null ? 60 : Number(raw)
            return (FPS_OPTIONS as readonly number[]).includes(n) ? (n as FpsOption) : 60
        } catch { return 60 }
    })
    const { screenToFlowPosition, getViewport, setViewport } = useReactFlow()

    /* Pin state's `liveNodeIds` is the UNION across pages — pins should
       survive page switches, only get reaped when the underlying node
       is actually deleted from any page. */
    const liveNodeIds = useMemo(() => {
        const set = new Set<string>()
        for (const p of pages) for (const n of p.nodes) set.add(n.id)
        return set
    }, [pages])

    /* Stable hash of the parts of `pages` the engine actually cares
       about — node ids, processor types, clone wiring, and edges. We
       deliberately EXCLUDE viewport / name / page ordering because
       changing any of them shouldn't force a graph rebuild. Without
       this, every page switch (which mutates the leaving page's
       viewport into `pages`) cascaded into `engine.setEdges` →
       `rebuildGraph` → "mark every node dirty" → a full graph re-
       execution on the next tick — which is what made tab switching
       feel like a freeze with heavy effects/segmentations on the
       canvas. */
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

    useEffect(() => {
        try { localStorage.setItem('nodeEditor.sidebarOpen.v1', sidebarOpen ? '1' : '0') } catch { /* */ }
    }, [sidebarOpen])

    useEffect(() => {
        try { localStorage.setItem('nodeEditor.outlineOpen.v1', outlineOpen ? '1' : '0') } catch { /* */ }
    }, [outlineOpen])

    useEffect(() => {
        try { localStorage.setItem('nodeEditor.inspectorOpen.v1', inspectorOpen ? '1' : '0') } catch { /* */ }
    }, [inspectorOpen])

    /* Push the cap to the engine whenever it (or the engine itself) changes.
       Persist the choice so opening a fresh tab keeps the user's preference. */
    useEffect(() => {
        try { localStorage.setItem('nodeEditor.fps.v1', String(fps)) } catch { /* */ }
        engineRef.current?.setTargetFps(fps)
    }, [fps])

    /* ── Pin state (captured in snapshots, hence lifted above PinProvider) ── */
    const pin = usePinState({ liveNodeIds })

    /* ── History (serialize / snapshot / undo / redo) ── */
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

    /* ── Init Pixi + Engine + restore from Dexie ── */
    const { engineReady } = usePipelineEngine({ engineRef, applySnapshot })

    /* The engine is created asynchronously inside usePipelineEngine; the
       earlier `fps` effect runs before the engine exists, so it can't push
       the cap yet. Re-apply once the engine reports ready. */
    useEffect(() => {
        if (!engineReady) return
        engineRef.current?.setTargetFps(fps)
    }, [engineReady, fps])

    /* ── Keyboard shortcuts ── */
    useNodeEditorShortcuts({
        nodes: activePage.nodes,
        setNodes: setActiveNodes,
        engineRef,
        handleUndo, handleRedo,
    })

    /* ── Edge colouring (clone-aware) ── */
    const colouredEdges = useEdgeColouring(activePage.nodes, activePage.edges, pages)

    /* ── Auto-save snapshot on changes ── */
    useEffect(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [pages, activePageId, pin.pinnedIds, engineReady, pushSnapshot])

    /* React Flow drives pan/zoom through its internal store and never
       mutates `nodes`/`edges`, so the effect above doesn't observe
       viewport changes. Hook into `onMoveEnd` so a snapshot is queued
       (and debounced) once the user stops panning/zooming. */
    const onMoveEnd = useCallback(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [engineReady, pushSnapshot])

    /* ── Sync engine edges from the resolved (clone-rewritten) scene ──
       Triggers on STRUCTURAL changes only (nodes / clones / edges),
       NOT on viewport-only mutations from page switches. Without the
       structural-hash gate every switch would re-fire setEdges, which
       calls rebuildGraph and marks every node dirty (~freeze with
       heavy graphs). Also fires on the engine-ready transition so the
       very first edge push happens after the engine boots even if
       pages haven't changed since mount. */
    useEffect(() => {
        if (!engineRef.current) return
        const { resolvedEdges } = resolveSceneForEngine(pages)
        engineRef.current.setEdges(resolvedEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagesStructuralHash, engineReady])

    /* ── Node change handlers (active page) ──
       Dimensions changes are rewritten in-place so every node's rendered
       width/height is a whole multiple of GRID_SIZE — both for the
       initial measurement (newly added nodes are sized to their content,
       which is rarely grid-aligned) and for content-driven growth later
       (e.g. an AnimationController gaining a new channel row). React
       Flow's own snapToGrid handles drag/resize positions and resize
       deltas; this snap takes care of the remaining intrinsic-measure
       case so a freshly added node doesn't sit half a grid cell short.

       `Math.ceil` rounds UP — never crops content. `setAttributes: true`
       forces React Flow to write the snapped values onto node.width /
       node.height so the rendered DOM box matches the snapped size on
       the next render (otherwise the snap would only update the
       internal `measured` field and the visible card would stay
       intrinsic). The change is applied idempotently — if the
       measurement is already grid-aligned we don't allocate a new
       change object. */
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

    /* ── Connection handler ── */
    const onConnect = useCallback((conn: Connection) => {
        if (!conn.source || !conn.target) return
        if (wouldCreateCycle(pages, conn.source, conn.target)) return
        setActiveEdges(eds => {
            const filtered = eds.filter(
                e => !(e.target === conn.target && e.targetHandle === conn.targetHandle),
            )
            return addEdge(conn, filtered)
        })
        /* Mark the engine target dirty so the new wire takes effect on
           the next tick. Resolve through clone aliases first — the
           target itself is always a real node (clones have no inputs)
           but we keep the resolve symmetric for safety. */
        const cloneToOrigin = new Map<string, string>()
        for (const p of pages) for (const n of p.nodes) {
            if (n.data.cloneOf) cloneToOrigin.set(n.id, n.data.cloneOf)
        }
        const realTarget = cloneToOrigin.get(conn.target) ?? conn.target
        engineRef.current?.markDirty(realTarget)
    }, [pages, setActiveEdges])

    /* ── Edge validation ── */
    const isValidConnection = useCallback((conn: Connection | Edge) => {
        if (!conn.source || !conn.target) return false
        /* Resolve both endpoints through clone aliases. Source is the
           common clone case; target is always real today (clones have
           no input handles), but resolving symmetrically keeps the
           check robust against future schema changes. */
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

    /* ── Context menu ── */
    const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
        event.preventDefault()
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        setContextMenu({ x: event.clientX, y: event.clientY, flowX: flowPos.x, flowY: flowPos.y })
    }, [screenToFlowPosition])

    /* Heal the global node-id counter against every page's max suffix
       BEFORE minting a new id. Used by every node-creation path —
       processor add, clone add (popover or sidebar drag-drop), restore. */
    const healAndMintNodeId = useCallback((): string => {
        const allNodes: { id: string }[] = []
        for (const p of pages) for (const n of p.nodes) allNodes.push(n)
        setNodeIdCounter(Math.max(getNodeIdCounter(), maxNodeIdNumber(allNodes)))
        return nextId()
    }, [pages])

    /* Add a real (engine-backed) processor node at a given flow-space
       position on the active page. Both the popover and copy/paste end
       up here. */
    const addProcessorNode = useCallback((type: string, position: { x: number; y: number }) => {
        const entry = PROCESSOR_CATALOG[type]
        if (!entry) return
        const id = healAndMintNodeId()
        /* Autogenerate stable event ids for newly created event sources
           (`tapZone` / `eventEmitter`). The Tier-3 client routes
           dispatches on these ids; minting them at creation time means
           any subsequent rename of `data.label` doesn't invalidate
           external glue code that pinned to the id, and the publish
           validator's duplicate-id check stays satisfied by default.
           Existing scene-wide ids are scanned so adding multiple
           emitters of the same type doesn't collide. */
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

    /* Add a viewer-only clone at a given flow-space position on the
       active page. Engine is NEVER informed (the clone is a UI alias;
       outgoing edges are rewritten to the original by sceneResolver). */
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

    /* ── Add a node from the popover (processor only — clones come
           from the SceneOutlineSidebar via drag-and-drop). ── */
    const onAddFromPopover = useCallback((action: AddNodeAction) => {
        const pos = { x: contextMenu?.flowX ?? 200, y: contextMenu?.flowY ?? 200 }
        if (action.kind === 'processor') {
            addProcessorNode(action.type, pos)
        } else if (action.kind === 'clone') {
            /* Backward-compat — popover no longer surfaces clone items,
               but keep the path working for any external caller. */
            addCloneNode(action.originId, pos)
        }
        setContextMenu(null)
    }, [addProcessorNode, addCloneNode, contextMenu])

    /* ── Drag-and-drop from SceneOutlineSidebar onto canvas ── */
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

    /* ── Delete handler — only call engine for real nodes. ── */
    const onNodesDelete = useCallback((deleted: PNode[]) => {
        for (const n of deleted) {
            if (n.data.cloneOf) continue   // clone is UI-only; engine never knew about it
            engineRef.current?.removeNode(n.id)
        }
    }, [])

    /* ── Export / Import / Clear ── */
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
            /* Persist the live counter so re-importing the file (or
               loading it on a fresh tab) doesn't reset the id sequence
               and start handing out IDs that already exist in the
               exported graph. */
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

    const clearScene = useCallback(async () => {
        for (const p of pages) for (const n of p.nodes) {
            if (n.data.cloneOf) continue
            engineRef.current?.removeNode(n.id)
        }
        replaceScene([{ id: DEFAULT_PAGE_ID, name: DEFAULT_PAGE_NAME, nodes: [], edges: [] }], DEFAULT_PAGE_ID)
        pin.clear()
        await sceneStore.clearAll()
    }, [pages, replaceScene, pin])

    /* ── Publish Tier-2 manifest ────────────────────────────────────
       Runs `derivePublishedSurface` against the current scene; on
       success downloads `<effectId>.published.json` (the contract
       Tier-2 supplier-app and Tier-3 multi-platform runtime consume).
       Errors surface in a snackbar — the inspector + PublishRoot
       node card already show inline error lists for each one, so the
       snackbar is intentionally terse. */
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

    /* ── Loading gate ── */
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
                            sidebarOpen={sidebarOpen}
                            onToggleSidebar={() => setSidebarOpen(v => !v)}
                            outlineOpen={outlineOpen}
                            onToggleOutline={() => setOutlineOpen(v => !v)}
                            inspectorOpen={inspectorOpen}
                            onToggleInspector={() => setInspectorOpen(v => !v)}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            onExport={exportScene}
                            onImport={importScene}
                            onClear={clearScene}
                            onPublish={publishScene}
                            fps={fps}
                            onFpsChange={setFps}
                        />
                        {/* IDE-style three-region layout below the toolbar:
                            outline | (tabs + canvas) | inspector across the
                            top, pin terminal across the bottom. The
                            outline rail and inspector each span the full
                            top-region height; the page tab strip lives
                            inside the central column so it starts where
                            the outline ends. */}
                        <div className="node-editor-body">
                            <div className="node-editor-top-row">
                                <SceneOutlineSidebar
                                    visible={outlineOpen}
                                    onClose={() => setOutlineOpen(false)}
                                />
                                <div className="node-editor-main">
                                    <NodeEditorTabs />
                                    <div className="node-editor-graph-row">
                                        <div
                                            className="node-editor-graph-full"
                                            onDragOver={onCanvasDragOver}
                                            onDrop={onCanvasDrop}
                                        >
                                            <ReactFlow
                                                /* No `key={activePageId}` here on purpose:
                                                   remounting ReactFlow on every switch
                                                   tore down + rebuilt every node card
                                                   (Effect/Preview/Segmentation each pay
                                                   canvas init + subscriber setup), which
                                                   was the user-visible "freeze on tab
                                                   switch". xyflow's own diff against
                                                   `nodes`/`edges` arrays already handles
                                                   page swaps cheaply, and selection /
                                                   hover state attached to nodes that no
                                                   longer exist gets cleaned up by
                                                   react-flow on its own. */
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
                                <PublishInspector
                                    visible={inspectorOpen}
                                    onClose={() => setInspectorOpen(false)}
                                />
                            </div>
                            <NodePinTerminal
                                visible={sidebarOpen}
                                onClose={() => setSidebarOpen(false)}
                            />
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

/* Re-export so consumers (or tests) constructing snapshots manually have
   the local `PageState` type without reaching into sceneResolver. */
export type { PageState }

/** Single-line description of a publish error — used by the toolbar
 *  snackbar (the inspector + PublishRoot card already show full
 *  multi-error lists with full descriptions). */
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
