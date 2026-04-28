import React from 'react'
import { Handle, Position } from '@xyflow/react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import type { HandleDef } from '../../node-engine/types'
import { useIsHeadlessNode } from './HeadlessNodeContext'
import { useResolvedNodeId } from './NodeIdContext'
import { usePinning } from './PinContext'
import { categoryColor } from './categoryColors'

const ROW_H = 22

interface Props {
    title: string
    category: string
    inputs: HandleDef[]
    outputs: HandleDef[]
    children?: React.ReactNode
    minWidth?: number
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
export function BaseNodeShell({ title, category, inputs, outputs, children, minWidth }: Props) {
    const headless = useIsHeadlessNode()
    const nodeId = useResolvedNodeId()
    const maxRows = Math.max(inputs.length, outputs.length)
    const handlesH = headless ? 0 : maxRows * ROW_H
    const accent = categoryColor(category)

    return (
        <div
            className="pn"
            /* The category accent IS the top border (thicker than the side
             * borders). Driving it through a CSS variable keeps the border
             * radius and corner geometry handled natively by the browser
             * — much cleaner than overlaying a separate strip. */
            style={{ minWidth: minWidth ?? undefined, ['--pn-accent' as string]: accent }}
        >
            <div className="pn-header">
                <span className="pn-header-title">{title}</span>
                {nodeId && <PinToggle nodeId={nodeId} headless={headless} />}
            </div>
            {!headless && (
                <div className="pn-handles" style={{ minHeight: handlesH }}>
                    {inputs.map((h, i) => (
                        <React.Fragment key={h.name}>
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={h.name}
                                style={{ top: i * ROW_H + ROW_H / 2 }}
                                className="pn-handle"
                            />
                            <div className="pn-label pn-label-in" style={{ top: i * ROW_H }}>
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
                                style={{ top: i * ROW_H + ROW_H / 2 }}
                                className="pn-handle"
                            />
                            <div className="pn-label pn-label-out" style={{ top: i * ROW_H }}>
                                {h.label ?? h.name}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            )}
            {children && <div className="pn-widgets">{children}</div>}
        </div>
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
                    color: pinned ? 'var(--pn-accent, var(--pn-text))' : 'var(--pn-text-secondary)',
                    p: 0.25,
                    '&:hover': {
                        bgcolor: 'rgba(0, 0, 0, 0.06)',
                        color: 'var(--pn-text)',
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
