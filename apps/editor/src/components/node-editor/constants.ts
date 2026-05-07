import type { EdgeTypes } from '@xyflow/react'
import { EditableStepEdge } from '../flow-nodes/EditableStepEdge'
import { SLOT } from '@effects/runtime/node-engine/types'
export type { PipelineNodeData } from '../flow-nodes/types'

export const GRID_SIZE = 20

export function snapToGrid(value: number, step: number = GRID_SIZE): number {
    return Math.round(value / step) * step
}

export const SNAPSHOT_DEBOUNCE_MS = 1200
export const IMAGE_BLOB_PREFIX = 'img:'
export const SEG_BLOB_PREFIX = 'seg:'

/* Custom MIME type used by drag-and-drop from the SceneOutlineSidebar
   onto the canvas. Payload is the original node id; the canvas-side
   `onDrop` decodes it and creates a viewer-only clone at the drop
   coordinates via `addCloneNode`. Using a custom subtype avoids
   conflicts with browser-native drops (text, files, urls). */
export const CLONE_DRAG_MIME = 'application/x-effect-clone-of'

export const pipelineEdgeTypes: EdgeTypes = { editableStep: EditableStepEdge }

export const SLOT_COMPAT: Record<string, Set<string>> = {
    [SLOT.TEXTURE]: new Set([SLOT.TEXTURE, SLOT.ANY]),
    [SLOT.NUMBER]: new Set([SLOT.NUMBER, SLOT.ANY]),
    [SLOT.VEC]: new Set([SLOT.VEC, SLOT.ANY]),
    [SLOT.CONFIG]: new Set([SLOT.CONFIG, SLOT.ANY]),
    [SLOT.CONTOUR]: new Set([SLOT.CONTOUR, SLOT.ANY]),
    [SLOT.EVENT]: new Set([SLOT.EVENT, SLOT.ANY]),
    [SLOT.SIGNAL]: new Set([SLOT.SIGNAL, SLOT.ANY]),
    [SLOT.ANIMATION]: new Set([SLOT.ANIMATION, SLOT.ANY]),
    [SLOT.METRICS]: new Set([SLOT.METRICS, SLOT.ANY]),
    [SLOT.TEXT]: new Set([SLOT.TEXT, SLOT.ANY]),
    [SLOT.TEXT_STYLE]: new Set([SLOT.TEXT_STYLE, SLOT.ANY]),
    [SLOT.ANY]: new Set([SLOT.TEXTURE, SLOT.NUMBER, SLOT.VEC, SLOT.CONFIG, SLOT.CONTOUR, SLOT.EVENT, SLOT.SIGNAL, SLOT.ANIMATION, SLOT.METRICS, SLOT.TEXT, SLOT.TEXT_STYLE, SLOT.ANY]),
}

let nodeIdCounter = 0
export function nextId(): string { return `n_${++nodeIdCounter}` }
export function setNodeIdCounter(v: number) { nodeIdCounter = v }
export function getNodeIdCounter(): number { return nodeIdCounter }

/**
 * Walk a list of serialised nodes and return the highest numeric suffix
 * found in IDs of the form `n_<int>`. Used to defensively bump the
 * shared node-id counter past any imported / restored scene's nodes —
 * otherwise `nextId()` could hand out an ID that already exists, and
 * `setNodes([...nds, dup])` then silently drops the original because
 * React Flow dedupes by `id`.
 */
export function maxNodeIdNumber(nodes: { id: string }[]): number {
    let max = 0
    for (const n of nodes) {
        const m = /^n_(\d+)$/.exec(n.id)
        if (!m) continue
        const v = parseInt(m[1], 10)
        if (Number.isFinite(v) && v > max) max = v
    }
    return max
}
