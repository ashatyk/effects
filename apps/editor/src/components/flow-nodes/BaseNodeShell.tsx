import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useNodeId, useStore } from '@xyflow/react'
import './styles/node-card.css'
import './styles/node-card-mui.css'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import type { HandleDef } from '@effects/runtime/node-engine/types'
import { useIsHeadlessNode } from './context/HeadlessNodeContext'
import { useResolvedNodeId, useHeadlessNodeData } from './context/NodeIdContext'
import { usePinning } from './context/PinContext'
import { categoryColor } from './categoryColors'
import { useSetNodeLabel } from './hooks/useSetNodeLabel'
import { useAutoGrowNodeBox } from './hooks/useAutoGrowNodeBox'
import type { PipelineNodeData } from './types'

// MUST equal GRID_SIZE so the N-th port still lands on a grid dot.
const ROW_H = 20
// Combined with .pn-header (36px) and .pn top border (4px), puts the first port at Y=60px (3 grid cells).
const ROW_TOP_PAD = 10
const DEFAULT_MIN_WIDTH = 160
const DEFAULT_MIN_HEIGHT = 40

interface Props {
    title: string
    category: string
    inputs: HandleDef[]
    outputs: HandleDef[]
    children?: React.ReactNode
    minWidth?: number
    minHeight?: number
    isClone?: boolean
    titleEditable?: boolean
}

// Two modes: graph (full chrome + <Handle>s + resizer) and headless (used by the pin sidebar).
export function BaseNodeShell({
    title, category, inputs, outputs, children, minWidth, minHeight,
    isClone = false, titleEditable = true,
}: Props) {
    const headless = useIsHeadlessNode()
    const nodeId = useResolvedNodeId()
    const maxRows = Math.max(inputs.length, outputs.length)
    const handlesH = headless ? 0 : ROW_TOP_PAD + maxRows * ROW_H + ROW_TOP_PAD
    const accent = categoryColor(category)

    // Selection from the RF store — avoids threading `selected` through all 28 NodeView props.
    const flowNodeId = useNodeId()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = useStore((s: any) => {
        if (!flowNodeId) return false
        return Boolean(s.nodeLookup?.get?.(flowNodeId)?.selected)
    })

    const labelEditable = titleEditable && !isClone && !!nodeId && !headless

    const mw = minWidth ?? DEFAULT_MIN_WIDTH
    const mh = minHeight ?? DEFAULT_MIN_HEIGHT
    const pnRef = useAutoGrowNodeBox(!headless && !!flowNodeId, mw, mh)

    return (
        <>
            {!headless && (
                <NodeResizer
                    minWidth={minWidth ?? DEFAULT_MIN_WIDTH}
                    minHeight={minHeight ?? DEFAULT_MIN_HEIGHT}
                    isVisible={selected}
                    lineClassName="pn-resize-line"
                    handleClassName="pn-resize-handle"
                />
            )}
            <div
                ref={pnRef}
                className={`pn${headless ? '' : ' pn--graph'}${isClone ? ' pn--clone' : ''}`}
                style={{
                    minWidth: minWidth ?? undefined,
                    ['--pn-accent' as string]: accent,
                }}
            >
                <div className="pn-header">
                    <HeaderTitle
                        title={title}
                        editable={labelEditable}
                        nodeId={nodeId}
                    />
                    {isClone && <span className="pn-header-ref-badge" title="UI reference to another node">REF</span>}
                    {nodeId && <PinToggle nodeId={nodeId} headless={headless} />}
                </div>
                {(!headless || children) && (
                    <div className="pn-body">
                        {!headless && (
                            <div className="pn-handles" style={{ minHeight: handlesH }}>
                                {inputs.map((h, i) => (
                                    <React.Fragment key={h.name}>
                                        <Handle
                                            type="target"
                                            position={Position.Left}
                                            id={h.name}
                                            style={{ top: ROW_TOP_PAD + i * ROW_H + ROW_H / 2 }}
                                            className="pn-handle"
                                        />
                                        <div className="pn-label pn-label-in" style={{ top: ROW_TOP_PAD + i * ROW_H }}>
                                            {h.label ?? h.name}
                                        </div>
                                    </React.Fragment>
                                ))}
                                {outputs.map((h, i) => (
                                    <React.Fragment key={h.name}>
                                        <Handle
                                            type="source"
                                            position={Position.Right}
                                            id={h.name}
                                            style={{ top: ROW_TOP_PAD + i * ROW_H + ROW_H / 2 }}
                                            className="pn-handle"
                                        />
                                        <div className="pn-label pn-label-out" style={{ top: ROW_TOP_PAD + i * ROW_H }}>
                                            {h.label ?? h.name}
                                        </div>
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        {children && <div className="pn-widgets">{children}</div>}
                    </div>
                )}
            </div>
        </>
    )
}

// Live label from RF store (graph) or HeadlessNodeData (sidebar); falls back to `title` (def.title).
function HeaderTitle({
    title, editable, nodeId,
}: { title: string; editable: boolean; nodeId: string | null | undefined }) {
    const setLabel = useSetNodeLabel(nodeId ?? '')
    const flowNodeId = useNodeId()
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const liveLabel = useStore((s: any) => {
        if (!flowNodeId) return undefined
        const n = s.nodeLookup?.get?.(flowNodeId)
        return (n?.data as PipelineNodeData | undefined)?.label
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const headlessData = useHeadlessNodeData()
    const displayed = (liveLabel ?? headlessData?.label ?? '').trim() || title

    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(displayed)
    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (editing) {
            setDraft(displayed)
            requestAnimationFrame(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            })
        }
    }, [editing, displayed])

    const commit = useCallback(() => {
        if (!editable || !nodeId) { setEditing(false); return }
        setLabel(draft)
        setEditing(false)
    }, [draft, editable, nodeId, setLabel])

    const cancel = useCallback(() => setEditing(false), [])

    if (editing) {
        return (
            <input
                ref={inputRef}
                className="pn-header-title-input nodrag"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commit() }
                    if (e.key === 'Escape') { e.preventDefault(); cancel() }
                }}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            />
        )
    }
    return (
        <span
            className="pn-header-title"
            onDoubleClick={editable ? () => setEditing(true) : undefined}
            title={editable ? 'Double-click to rename' : undefined}
        >
            {displayed}
        </span>
    )
}

function PinToggle({ nodeId, headless }: { nodeId: string; headless: boolean }) {
    const { isPinned, togglePin } = usePinning()
    const pinned = isPinned(nodeId)
    const title = pinned ? (headless ? 'Unpin from sidebar' : 'Unpin') : 'Pin to sidebar'
    return (
        <Tooltip title={title}>
            <IconButton
                size="small"
                className="nodrag"
                onClick={(e) => { e.stopPropagation(); togglePin(nodeId) }}
                sx={{
                    color: '#f5f5f5',
                    opacity: pinned ? 1 : 0.7,
                    p: 0.25,
                    '&:hover': {
                        opacity: 1,
                        bgcolor: 'rgba(0, 0, 0, 0.12)',
                    },
                }}
            >
                {pinned
                    ? <PushPinIcon sx={{ fontSize: 14 }} />
                    : <PushPinOutlinedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
        </Tooltip>
    )
}
