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
import type { PipelineNodeData } from './types'

/* Row pitch for input/output handles inside a node card. MUST equal the
   editor grid step (`GRID_SIZE = 20` in NodeEditor.tsx) so that connecting
   to the N-th port of any node still lands on the same dotted grid as the
   1st port — otherwise edges fanning out of multi-input nodes would drift
   off-grid by `(ROW_H - GRID_SIZE) * N` per port. */
const ROW_H = 20
/* Top inset of the first port row inside `.pn-handles`. Combined with the
   fixed `.pn-header` height (36 px in `styles/node-card.css`) and the
   4 px `.pn` top border, this puts the centre of the FIRST port at
   exactly Y = 60 px from the node's top edge — i.e. 3 grid cells down —
   so every port's midpoint lands on a dot of the editor grid. Subsequent
   ports inherit this alignment because ROW_H is also a multiple of
   GRID_SIZE. */
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
    /* Mark this card as a viewer-only clone of another node. Adds the
       dashed `.pn--clone` class and the REF badge in the header. */
    isClone?: boolean
    /* Allow the user to rename the node by double-clicking the header
       title. Defaults to true for real nodes; CloneNodeView passes
       `false` so the title stays a read-only mirror of the original's
       label. */
    titleEditable?: boolean
}

/**
 * Renders the chrome around any node view: coloured header, slot handles,
 * widget area. The header hosts a pin toggle that adds/removes this node
 * from the sidebar.
 *
 * Two render modes:
 *   - graph (default): full chrome including <Handle>s for connections.
 *   - headless: no <Handle>s, no resizer; used inside the pin sidebar where
 *     we only care about the widgets and the live preview.
 */
export function BaseNodeShell({
    title, category, inputs, outputs, children, minWidth, minHeight,
    isClone = false, titleEditable = true,
}: Props) {
    const headless = useIsHeadlessNode()
    const nodeId = useResolvedNodeId()
    const maxRows = Math.max(inputs.length, outputs.length)
    /* Symmetric top/bottom padding (`ROW_TOP_PAD` on each side) so the
       handles container is grid-aligned both ways and widgets below it
       start on a dot row too. */
    const handlesH = headless ? 0 : ROW_TOP_PAD + maxRows * ROW_H + ROW_TOP_PAD
    const accent = categoryColor(category)

    /* Selection state for the NodeResizer overlay. We pull it from the
       React Flow store rather than threading `selected` through all 28
       NodeView props — the lookup hits a single Map and only re-renders
       this node when its own selection flips. */
    const flowNodeId = useNodeId()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = useStore((s: any) => {
        if (!flowNodeId) return false
        return Boolean(s.nodeLookup?.get?.(flowNodeId)?.selected)
    })

    /* Inline rename state. Owned here (not in SceneContext) because it's
       transient UI — we only commit to the scene on Enter / blur. */
    const labelEditable = titleEditable && !isClone && !!nodeId && !headless

    return (
        <>
            {/* Resizer is mounted next to the card chrome (not inside it)
                so its absolute-positioned edges/corners overlay the
                ReactFlow node bounding box, not the inner card. The
                react-flow store-driven `snapToGrid` makes resize itself
                grid-aligned without extra wiring. */}
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
                className={`pn${headless ? '' : ' pn--graph'}${isClone ? ' pn--clone' : ''}`}
                /* The category accent IS the top border (thicker than the side
                 * borders). Driving it through a CSS variable keeps the border
                 * radius and corner geometry handled natively by the browser
                 * — much cleaner than overlaying a separate strip. */
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
                {/* Everything below the header lives inside `.pn-body` — its
                    rounded top corners "arch" against the accent backdrop
                    on `.pn`, replacing the previous flat header underline. */}
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

/**
 * Renders the header title. The displayed text is the live label from
 * either:
 *   - the React Flow store (graph mode — node lives in the active page
 *     and the store is the source of truth), or
 *   - the headless data context (pin sidebar — the parent injects the
 *     live `data` via `HeadlessNodeDataProvider` so renames done on
 *     other pages still reflect here),
 * falling back to the `title` prop (`def.title`) when no label is set.
 *
 * When `editable` is true, double-clicking swaps the static label for
 * an inline input that commits on Enter / blur and aborts on Escape.
 * The hooks are mounted unconditionally to keep React's hook order
 * stable; when `editable` is false the commit path is never invoked.
 */
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
                    /* Match the unified light header title — pinned vs
                       unpinned is differentiated via opacity (and the
                       filled/outlined pin glyph), not a second colour. */
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
