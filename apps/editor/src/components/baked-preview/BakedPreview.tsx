import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    type Edge,
    type Node,
    type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import type { BakedPipeline } from '@effects/runtime'
import { parseBaked } from '@effects/player'

import { EngineProvider } from '../flow-nodes/context/EngineContext'
import { PinProvider, usePinState } from '../flow-nodes/context/PinContext'
import { SceneProvider, type SceneState } from '../node-editor/SceneContext'
import { pipelineNodeTypes } from '../flow-nodes/nodeTypes'
import { GRID_SIZE, pipelineEdgeTypes, type PipelineNodeData } from '../node-editor/constants'
import { DEFAULT_PAGE_ID, DEFAULT_PAGE_NAME, type PageState } from '../node-editor/sceneResolver'
import { useBakedEngine } from './useBakedEngine'
import '../node-editor.css'

/**
 * Read-only viewer for `.baked.json` (AOT artifact from the supplier
 * app). We still mount real engines and real node views because
 * processors that opted out of baking via `data.runtimeDynamic`
 * survive in the trimmed graph and need a live engine for previews.
 */
export const BakedPreview = memo(function BakedPreview() {
    const [baked, setBaked] = useState<BakedPipeline | null>(null)
    const [filename, setFilename] = useState<string | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const navigate = useNavigate()

    const onFile = useCallback(async (file: File) => {
        setParseError(null)
        const text = await file.text()
        const result = parseBaked(text)
        if (!result.ok) {
            setParseError(result.error)
            return
        }
        setBaked(result.baked)
        setFilename(file.name)
    }, [])

    const onClear = useCallback(() => {
        setBaked(null)
        setFilename(null)
        setParseError(null)
    }, [])

    const onBack = useCallback(() => navigate('/'), [navigate])

    if (!baked) {
        return <BakedDropZone onFile={onFile} onBack={onBack} error={parseError} />
    }

    return (
        <BakedGraphView
            baked={baked}
            filename={filename}
            onClear={onClear}
            onBack={onBack}
        />
    )
})

interface DropZoneProps {
    onFile: (file: File) => void
    onBack: () => void
    error: string | null
}

function BakedDropZone({ onFile, onBack, error }: DropZoneProps) {
    const [dragOver, setDragOver] = useState(false)

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
    }, [onFile])

    const onPick = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (file) onFile(file)
        }
        input.click()
    }, [onFile])

    return (
        <Box sx={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            bgcolor: 'background.default',
        }}>
            <Box
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                sx={{
                    width: 'min(560px, 100%)',
                    minHeight: 320,
                    border: '2px dashed',
                    borderColor: dragOver ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    bgcolor: dragOver ? 'action.hover' : 'background.paper',
                    transition: 'border-color 120ms, background-color 120ms',
                }}
            >
                <LocalFireDepartmentIcon sx={{ fontSize: 36, color: 'warning.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
                    Baked preview
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 440 }}>
                    Drop a <code>.baked.json</code> here to inspect the trimmed graph that
                    survived the supplier-app's bake step. Read-only view — same node cards
                    as the editor, no settings or pages.
                </Typography>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={<FileUploadIcon fontSize="small" />}
                    onClick={onPick}
                    sx={{ mt: 1 }}
                >
                    Choose file
                </Button>
                {error && (
                    <Alert severity="error" sx={{ width: '100%', fontSize: 12 }}>
                        {error}
                    </Alert>
                )}
                <Button
                    variant="text"
                    size="small"
                    startIcon={<ArrowBackIcon fontSize="small" />}
                    onClick={onBack}
                    sx={{ color: 'text.disabled', mt: 1 }}
                >
                    Back to editor
                </Button>
            </Box>
        </Box>
    )
}

interface GraphViewProps {
    baked: BakedPipeline
    filename: string | null
    onClear: () => void
    onBack: () => void
}

function BakedGraphView({ baked, filename, onClear, onBack }: GraphViewProps) {
    const { engine, ready, error } = useBakedEngine(baked)

    /* Mark every node non-draggable/connectable/deletable so React Flow
       stays read-only — pan/zoom/select work, mutations don't. Positions
       come verbatim from the baked snapshot. */
    const flowNodes = useMemo<Node<PipelineNodeData>[]>(() => {
        return baked.graph.nodes.map(sn => ({
            id: sn.id,
            type: sn.type ?? sn.data.processor,
            position: sn.position,
            data: sn.data as PipelineNodeData,
            ...(typeof sn.width === 'number' ? { width: sn.width } : {}),
            ...(typeof sn.height === 'number' ? { height: sn.height } : {}),
            ...(sn.style ? { style: sn.style } : {}),
            draggable: false,
            connectable: false,
            deletable: false,
        }))
    }, [baked])

    const flowEdges = useMemo<Edge[]>(() => {
        return baked.graph.edges.map((e, i) => ({
            id: e.id ?? `e_${i}_${e.source}_${e.target}`,
            source: e.source,
            sourceHandle: e.sourceHandle ?? undefined,
            target: e.target,
            targetHandle: e.targetHandle ?? undefined,
            type: e.type ?? 'editableStep',
            data: e.data,
            deletable: false,
        }))
    }, [baked])

    /* `BaseNodeShell.HeaderTitle` calls `useScene()` unconditionally,
       so a SceneProvider is structurally required even though every
       mutation here is a no-op. */
    const sceneShim = useMemo<SceneState>(() => buildReadOnlySceneShim(flowNodes), [flowNodes])

    /* `BaseNodeShell` renders a pin button that calls `usePinning()`
       regardless of mode; mount real `usePinState` so toggling is a
       harmless localStorage no-op (no PinsPanel in this view). */
    const liveNodeIds = useMemo(() => new Set(flowNodes.map(n => n.id)), [flowNodes])
    const pin = usePinState({ liveNodeIds })

    const reportSummary = baked.bakeReport
        ? `${baked.bakeReport.entries.length} baked · ${baked.bakeReport.nodesBefore}→${baked.bakeReport.nodesAfter} nodes`
        : `${baked.graph.nodes.length} nodes`

    if (error) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
                <Header
                    filename={filename}
                    bakedName={baked.name}
                    bakedId={baked.id}
                    summary={reportSummary}
                    onBack={onBack}
                    onClear={onClear}
                />
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
                    <Alert severity="error" sx={{ maxWidth: 480 }}>
                        Engine init failed: {error}
                    </Alert>
                </Box>
            </Box>
        )
    }

    if (!ready || !engine) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
                <Header
                    filename={filename}
                    bakedName={baked.name}
                    bakedId={baked.id}
                    summary={reportSummary}
                    onBack={onBack}
                    onClear={onClear}
                />
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
                    Initializing GPU…
                </Box>
            </Box>
        )
    }

    return (
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
            <Header
                filename={filename}
                bakedName={baked.name}
                bakedId={baked.id}
                summary={reportSummary}
                onBack={onBack}
                onClear={onClear}
            />
            <SceneProvider value={sceneShim}>
                <EngineProvider value={engine}>
                    <PinProvider value={pin}>
                        <ReactFlowProvider>
                            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                <ReactFlow
                                    nodes={flowNodes}
                                    edges={flowEdges}
                                    nodeTypes={pipelineNodeTypes as unknown as NodeTypes}
                                    edgeTypes={pipelineEdgeTypes}
                                    nodesDraggable={false}
                                    nodesConnectable={false}
                                    elementsSelectable
                                    fitView
                                    minZoom={0.2}
                                    maxZoom={3}
                                    proOptions={{ hideAttribution: true }}
                                >
                                    <Background color="rgba(255,255,255,0.07)" gap={GRID_SIZE} size={1} />
                                </ReactFlow>
                            </Box>
                        </ReactFlowProvider>
                    </PinProvider>
                </EngineProvider>
            </SceneProvider>
        </Box>
    )
}

interface HeaderProps {
    filename: string | null
    bakedName: string
    bakedId: string
    summary: string
    onBack: () => void
    onClear: () => void
}

function Header({ filename, bakedName, bakedId, summary, onBack, onClear }: HeaderProps) {
    return (
        <Box sx={{
            px: 2, py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            bgcolor: 'background.paper',
            flexShrink: 0,
        }}>
            <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={onBack}
                startIcon={<ArrowBackIcon fontSize="small" />}
                sx={{ flexShrink: 0 }}
            >
                Editor
            </Button>
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {bakedName}
                </Typography>
                <Typography variant="caption" sx={{
                    color: 'text.disabled',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {bakedId} · {summary}{filename ? ` · ${filename}` : ''}
                </Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={onClear}
                startIcon={<RestartAltIcon fontSize="small" />}
                sx={{ flexShrink: 0 }}
            >
                Drop another
            </Button>
        </Box>
    )
}

/**
 * Single read-only "Main" page over the baked nodes; every mutation
 * is a no-op. A header rename commits via `updateNodeData` which
 * silently drops the call, and the input collapses back to the
 * baked-snapshot label on next render.
 */
function buildReadOnlySceneShim(nodes: Node<PipelineNodeData>[]): SceneState {
    const page: PageState = {
        id: DEFAULT_PAGE_ID,
        name: DEFAULT_PAGE_NAME,
        nodes,
        edges: [],
    }
    const noop = () => { /* read-only */ }
    return {
        pages: [page],
        activePageId: DEFAULT_PAGE_ID,
        activePage: page,
        addPage: () => DEFAULT_PAGE_ID,
        removePage: noop,
        renamePage: noop,
        switchPage: noop,
        allRealNodes: () => nodes,
        findOrigin: () => null,
        updateNodeData: noop,
        jumpToNode: noop,
        setActiveNodes: noop,
        setActiveEdges: noop,
        replaceScene: noop,
    }
}
