import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { NodeResizer, useNodeId, useStore, type NodeProps } from '@xyflow/react'
import {
    FRAME_HEADER_HEIGHT,
    FRAME_MIN_HEIGHT,
    FRAME_MIN_WIDTH,
    FRAME_DEFAULT_COLOR,
    hexToRgba,
} from '../frame-constants'
import { useSetNodeLabel } from '../hooks/useSetNodeLabel'
import type { PipelineNodeData } from '../types'
import '../styles/frame-card.css'

// Body uses pointer-events:none so clicks pass through to overlapping processor nodes.
// Colour from data.params.color (hex); body=α0.18, header band=α0.55 from same hex.
export const FrameNodeView = memo(function FrameNodeView(
    { id, data }: NodeProps & { data: PipelineNodeData },
) {
    const flowNodeId = useNodeId()
    const params = data.params as { color?: string; label?: string }
    const color = (params.color ?? FRAME_DEFAULT_COLOR).toString()
    const label = (data.label ?? '').toString().trim() || (params.label ?? '').toString().trim() || 'Frame'

    const selected = useStore((s: { nodeLookup?: Map<string, { selected?: boolean }> }) => {
        if (!flowNodeId) return false
        return Boolean(s.nodeLookup?.get?.(flowNodeId)?.selected)
    })

    const setLabel = useSetNodeLabel(id)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(label)
    const inputRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        if (editing) {
            setDraft(label)
            requestAnimationFrame(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
            })
        }
    }, [editing, label])
    const commit = useCallback(() => {
        setLabel(draft)
        setEditing(false)
    }, [draft, setLabel])
    const cancel = useCallback(() => setEditing(false), [])

    const styleVars: React.CSSProperties = {
        ['--frame-body-bg' as string]: hexToRgba(color, 0.18),
        ['--frame-header-bg' as string]: hexToRgba(color, 0.55),
        ['--frame-border' as string]: hexToRgba(color, 0.40),
        ['--frame-border-selected' as string]: hexToRgba(color, 0.85),
        ['--frame-header-h' as string]: `${FRAME_HEADER_HEIGHT}px`,
    }

    return (
        <>
            <NodeResizer
                minWidth={FRAME_MIN_WIDTH}
                minHeight={FRAME_MIN_HEIGHT}
                isVisible={selected}
                lineClassName="pn-resize-line"
                handleClassName="pn-resize-handle"
            />
            <div className={`pn-frame${selected ? ' selected' : ''}`} style={styleVars}>
                <div
                    className="pn-frame-header"
                    onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditing(true)
                    }}
                >
                    {editing ? (
                        <input
                            ref={inputRef}
                            className="pn-frame-title-input nodrag"
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
                    ) : (
                        <span className="pn-frame-title" title="Double-click to rename">
                            {label}
                        </span>
                    )}
                </div>
                <div className="pn-frame-body" />
            </div>
        </>
    )
})

export { FRAME_PROCESSOR } from '../frame-constants'
