import { useEffect, useRef } from 'react'
import type { Node } from '@xyflow/react'
import type { PipelineNodeData } from '../constants'
import { GRID_SIZE, snapToGrid, nextId } from '../constants'
import type { DataflowEngine } from '@effects/runtime/node-engine/dataflow-engine'

type PNode = Node<PipelineNodeData>

interface Deps {
    nodes: PNode[]
    setNodes: React.Dispatch<React.SetStateAction<PNode[]>> | ((updater: PNode[] | ((prev: PNode[]) => PNode[])) => void)
    engineRef: React.MutableRefObject<DataflowEngine | null>
    handleUndo: () => void
    handleRedo: () => void
}

// Cmd/Ctrl+Z undo, +Shift+Z or +Y redo, +C/+V copy/paste on active page.
// Pasted clones keep their cloneOf id (no new engine processor materialised).
export function useNodeEditorShortcuts({ nodes, setNodes, engineRef, handleUndo, handleRedo }: Deps) {
    const clipboardRef = useRef<PNode[]>([])

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
                setNodes((nds: PNode[]) => {
                    const deselected = nds.map(n => ({ ...n, selected: false }))
                    return [...deselected, ...newNodes]
                })
                for (const nn of newNodes) {
                    if (nn.data.cloneOf) continue
                    engineRef.current?.addNode(nn.id, nn.data.processor, { ...nn.data.params })
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [nodes, setNodes, handleUndo, handleRedo, engineRef])
}
