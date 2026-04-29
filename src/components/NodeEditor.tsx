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
import './node-editor.css'

import { DataflowEngine } from '../node-engine/dataflow-engine'
import { PROCESSOR_CATALOG } from '../node-engine/processors'
import { ImageProcessor } from '../node-engine/processors/image'
import { SLOT } from '../node-engine/types'
import { sceneStore, type SerializedNode, type SerializedEdge } from '../node-engine/scene-store'

import { EngineProvider } from './flow-nodes/context/EngineContext'
import { pipelineNodeTypes } from './flow-nodes/nodeTypes'
import { PinProvider, usePinState } from './flow-nodes/context/PinContext'
import { NodePinSidebar } from './flow-nodes/NodePinSidebar'

import {
    GRID_SIZE, snapToGrid, nextId,
    pipelineEdgeTypes, SLOT_COMPAT,
    type PipelineNodeData,
} from './node-editor/constants'
import { getMenuGroups } from './node-editor/menuGroups'
import { useSceneHistory } from './node-editor/hooks/useSceneHistory'
import { useNodeEditorShortcuts } from './node-editor/hooks/useNodeEditorShortcuts'
import { useEdgeColouring } from './node-editor/hooks/useEdgeColouring'
import { usePipelineEngine } from './node-editor/hooks/usePipelineEngine'
import { NodeEditorToolbar, FPS_OPTIONS, type FpsOption } from './node-editor/NodeEditorToolbar'
import { AddNodePopover } from './node-editor/AddNodePopover'

type PNode = Node<PipelineNodeData>

interface SceneData {
    nodes: PNode[]
    edges: Edge[]
    nodeIdCounter: number
    pinnedIds?: string[]
    viewport?: { x: number; y: number; zoom: number }
}

function NodeEditorInner() {
    const [nodes, setNodes, onNodesChange] = useNodesState<PNode>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const engineRef = useRef<DataflowEngine | null>(null)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('nodeEditor.sidebarOpen.v1') !== '0' } catch { return true }
    })
    const [fps, setFps] = useState<FpsOption>(() => {
        try {
            const raw = localStorage.getItem('nodeEditor.fps.v1')
            const n = raw == null ? 60 : Number(raw)
            return (FPS_OPTIONS as readonly number[]).includes(n) ? (n as FpsOption) : 60
        } catch { return 60 }
    })
    const { screenToFlowPosition, getViewport, setViewport } = useReactFlow()

    const liveNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes])

    useEffect(() => {
        try { localStorage.setItem('nodeEditor.sidebarOpen.v1', sidebarOpen ? '1' : '0') } catch { /* */ }
    }, [sidebarOpen])

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
        nodes, setNodes, edges, setEdges, engineRef,
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
    useNodeEditorShortcuts({ nodes, setNodes, engineRef, handleUndo, handleRedo })

    /* ── Edge colouring ── */
    const colouredEdges = useEdgeColouring(nodes, edges)

    /* ── Auto-save snapshot on changes ── */
    useEffect(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [nodes, edges, pin.pinnedIds, engineReady, pushSnapshot])

    /* React Flow drives pan/zoom through its internal store and never
       mutates `nodes`/`edges`, so the effect above doesn't observe
       viewport changes. Hook into `onMoveEnd` so a snapshot is queued
       (and debounced) once the user stops panning/zooming. */
    const onMoveEnd = useCallback(() => {
        if (!engineReady) return
        pushSnapshot()
    }, [engineReady, pushSnapshot])

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

    /* ── Context menu ── */
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

    const onNodesDelete = useCallback((deleted: PNode[]) => {
        for (const n of deleted) engineRef.current?.removeNode(n.id)
    }, [])

    /* ── Export / Import / Clear ── */
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
        let viewport: SceneData['viewport']
        try { viewport = getViewport() } catch { /* ignore */ }
        const data: SceneData = {
            nodes: exportNodes,
            edges,
            nodeIdCounter: 0,
            pinnedIds: [...pin.pinnedIds],
            viewport,
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'scene.json'
        a.click()
        URL.revokeObjectURL(url)
    }, [nodes, edges, pin.pinnedIds, getViewport])

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

                await applySnapshot({
                    nodes: scene.nodes as SerializedNode[],
                    edges: scene.edges as SerializedEdge[],
                    nodeIdCounter: scene.nodeIdCounter ?? 0,
                    pinnedIds: scene.pinnedIds,
                    viewport: scene.viewport,
                }, engine)
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
        pin.clear()
        await sceneStore.clearAll()
    }, [nodes, setNodes, setEdges, pin])

    /* ── Loading gate ── */
    if (!engineReady || !engineRef.current) {
        return <div className="node-editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Initializing GPU...</div>
    }

    const menuGroups = getMenuGroups()

    return (
        <EngineProvider value={engineRef.current}>
            <PinProvider value={pin}>
                <div className="node-editor">
                    <NodeEditorToolbar
                        sidebarOpen={sidebarOpen}
                        onToggleSidebar={() => setSidebarOpen(v => !v)}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onExport={exportScene}
                        onImport={importScene}
                        onClear={clearScene}
                        fps={fps}
                        onFpsChange={setFps}
                    />
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
                                onMoveEnd={onMoveEnd}
                                onClick={() => setContextMenu(null)}
                                deleteKeyCode={['Delete', 'Backspace']}
                                multiSelectionKeyCode="Shift"
                                selectionKeyCode="Shift"
                                minZoom={0.2}
                                maxZoom={3}
                                defaultEdgeOptions={{ type: 'editableStep' }}
                                snapToGrid
                                snapGrid={[GRID_SIZE, GRID_SIZE]}
                            >
                                <Background color="rgba(255,255,255,0.05)" gap={GRID_SIZE} size={1} />
                            </ReactFlow>
                            <AddNodePopover
                                open={!!contextMenu}
                                anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
                                onClose={() => setContextMenu(null)}
                                groups={menuGroups}
                                onAdd={addNode}
                            />
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
