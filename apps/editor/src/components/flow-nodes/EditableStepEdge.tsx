/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useMemo, useState } from 'react'
import {
    EdgeLabelRenderer,
    useReactFlow,
    useStore,
    type EdgeProps,
} from '@xyflow/react'
import './styles/editable-edge.css'

// Orthogonal step edge with stored corner points (edge.data.bends). Midpoint handles drag
// perpendicular to their segment. Refs: SO 77831116 (CC BY-SA 4.0), RF Pro editable-edge example.
interface Bend {
    x: number
    y: number
}

export interface EditableStepEdgeData {
    bends?: Bend[]
}

const CORNER_R = 8
const HANDLE_MIN_SEG_PX = 18

// SVG path through `points` with quadratic-bezier rounded corners; corner radius capped at half
// the shorter incident segment so corners never exceed segment length.
function buildPath(points: Bend[], r: number): string {
    if (points.length < 2) return ''
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const next = points[i + 1]
        const inDx = Math.sign(curr.x - prev.x)
        const inDy = Math.sign(curr.y - prev.y)
        const outDx = Math.sign(next.x - curr.x)
        const outDy = Math.sign(next.y - curr.y)
        const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y)
        const outLen = Math.hypot(next.x - curr.x, next.y - curr.y)
        const cr = Math.max(0, Math.min(r, inLen / 2, outLen / 2))
        const beforeX = curr.x - inDx * cr
        const beforeY = curr.y - inDy * cr
        const afterX = curr.x + outDx * cr
        const afterY = curr.y + outDy * cr
        d += ` L ${beforeX} ${beforeY}`
        d += ` Q ${curr.x} ${curr.y}, ${afterX} ${afterY}`
    }
    const last = points[points.length - 1]
    d += ` L ${last.x} ${last.y}`
    return d
}

export const EditableStepEdge = memo(function EditableStepEdge(props: EdgeProps) {
    const {
        id,
        sourceX, sourceY, targetX, targetY,
        data,
        style,
        selected,
        markerEnd, markerStart,
        interactionWidth = 24,
    } = props

    const { setEdges } = useReactFlow()
    const zoom = useStore((s: any) => s.transform[2])
    const snapEnabled = useStore((s: any) => Boolean(s.snapToGrid))
    const snapStepX = useStore((s: any) => s.snapGrid?.[0] ?? 0)
    const snapStepY = useStore((s: any) => s.snapGrid?.[1] ?? 0)
    const [hovered, setHovered] = useState(false)
    const [draggingSeg, setDraggingSeg] = useState<number | null>(null)

    const snapX = useCallback((v: number) => {
        if (!snapEnabled || !snapStepX) return v
        return Math.round(v / snapStepX) * snapStepX
    }, [snapEnabled, snapStepX])
    const snapY = useCallback((v: number) => {
        if (!snapEnabled || !snapStepY) return v
        return Math.round(v / snapStepY) * snapStepY
    }, [snapEnabled, snapStepY])

    const edgeData = (data ?? {}) as EditableStepEdgeData

    // No stored bends → default HVH that tracks endpoints. With stored bends, pin first/last bend Y
    // to current source/target Y at render time so entry/exit stay horizontal after node moves
    // without polluting the stored payload until the next deliberate drag.
    const bends: Bend[] = useMemo(() => {
        const stored = edgeData.bends
        if (!stored || stored.length === 0) {
            const cx = (sourceX + targetX) / 2
            return [{ x: cx, y: sourceY }, { x: cx, y: targetY }]
        }
        if (stored.length === 1) {
            return [{ ...stored[0], y: sourceY }]
        }
        const first = { ...stored[0], y: sourceY }
        const last = { ...stored[stored.length - 1], y: targetY }
        return [first, ...stored.slice(1, -1), last]
    }, [edgeData.bends, sourceX, sourceY, targetX, targetY])

    const points: Bend[] = useMemo(
        () => [{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }],
        [bends, sourceX, sourceY, targetX, targetY],
    )

    const path = useMemo(() => buildPath(points, CORNER_R), [points])

    // Horizontal if y-delta < 0.5px (covers float drift without a hard equality).
    const segments = useMemo(() => {
        const out: Array<{
            i: number
            horizontal: boolean
            midX: number
            midY: number
            length: number
        }> = []
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i]
            const b = points[i + 1]
            const horizontal = Math.abs(b.y - a.y) < 0.5
            const length = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y)
            out.push({
                i,
                horizontal,
                midX: (a.x + b.x) / 2,
                midY: (a.y + b.y) / 2,
                length,
            })
        }
        return out
    }, [points])

    // segIdx indexes into points; bend indices are segIdx-1 and segIdx (-1/N = source/target).
    // End segments are auto-split before drag so the dragged portion becomes "internal".
    const startDrag = useCallback((segIdx: number, horizontal: boolean) => (e: React.PointerEvent) => {
        e.stopPropagation()
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        setDraggingSeg(segIdx)

        const startClientX = e.clientX
        const startClientY = e.clientY
        const localZoom = zoom || 1

        const initialBends: Bend[] = bends.map(b => ({ ...b }))
        const N = initialBends.length

        let workingBends = initialBends.slice()
        let updateA = segIdx - 1
        let updateB = segIdx
        const isStartSeg = updateA < 0
        const isEndSeg = updateB >= N

        if (isStartSeg || isEndSeg) {
            // Source/target handles are on left/right so end segments are always horizontal.
            if (!horizontal) return

            if (isStartSeg) {
                const splitX = snapX((sourceX + initialBends[0].x) / 2)
                workingBends = [
                    { x: splitX, y: sourceY },
                    { x: splitX, y: sourceY },
                    ...initialBends,
                ]
                updateA = 1
                updateB = 2
            } else {
                const last = initialBends[N - 1]
                const splitX = snapX((last.x + targetX) / 2)
                workingBends = [
                    ...initialBends,
                    { x: splitX, y: targetY },
                    { x: splitX, y: targetY },
                ]
                updateA = N - 1
                updateB = N
            }
        }

        const startSnapshot = workingBends.map(b => ({ ...b }))

        // Persist the (possibly split) bends immediately so the polyline reflects new control structure.
        setEdges(eds => eds.map(ed =>
            ed.id === id
                ? { ...ed, data: { ...(ed.data ?? {}), bends: workingBends } }
                : ed,
        ))

        const onMove = (ev: PointerEvent) => {
            const dx = (ev.clientX - startClientX) / localZoom
            const dy = (ev.clientY - startClientY) / localZoom

            const next = startSnapshot.map(b => ({ ...b }))
            if (horizontal) {
                const ny = snapY(startSnapshot[updateA].y + dy)
                next[updateA] = { ...next[updateA], y: ny }
                next[updateB] = { ...next[updateB], y: ny }
            } else {
                const nx = snapX(startSnapshot[updateA].x + dx)
                next[updateA] = { ...next[updateA], x: nx }
                next[updateB] = { ...next[updateB], x: nx }
            }

            setEdges(eds => eds.map(ed =>
                ed.id === id
                    ? { ...ed, data: { ...(ed.data ?? {}), bends: next } }
                    : ed,
            ))
        }

        const onUp = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onUp)
            setDraggingSeg(null)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
    }, [bends, sourceX, sourceY, targetX, targetY, id, zoom, setEdges, snapX, snapY])

    // Right-click on midpoint handle deletes its bend pair (inverse of the auto-split on drag).
    const removeBendPair = useCallback((segIdx: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const N = bends.length
        const idxA = segIdx - 1
        const idxB = segIdx
        if (idxA < 0 || idxB >= N) return
        const next = bends.slice()
        next.splice(idxA, 2)
        setEdges(eds => eds.map(ed =>
            ed.id === id
                ? { ...ed, data: { ...(ed.data ?? {}), bends: next.length > 0 ? next : undefined } }
                : ed,
        ))
    }, [bends, id, setEdges])

    const stroke = (style as any)?.stroke ?? 'rgba(255,255,255,0.55)'

    return (
        <g
            className={`pn-edge-group ${hovered || selected ? 'hovered' : ''}`}
            style={{ color: stroke }}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
        >
            <path
                id={id}
                d={path}
                fill="none"
                className="react-flow__edge-path"
                style={style}
                markerEnd={markerEnd}
                markerStart={markerStart}
            />
            {interactionWidth > 0 && (
                <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={interactionWidth}
                    className="react-flow__edge-interaction"
                />
            )}
            <EdgeLabelRenderer>
                {segments.map(seg => {
                    if (seg.length < HANDLE_MIN_SEG_PX) return null
                    // Portaled DOM can't use a parent .hovered selector; drive visibility via prop.
                    const visible = hovered || selected || draggingSeg === seg.i
                    const dragging = draggingSeg === seg.i
                    return (
                        <div
                            key={seg.i}
                            className={[
                                'pn-edge-handle',
                                seg.horizontal ? 'h' : 'v',
                                visible ? 'visible' : '',
                                dragging ? 'dragging' : '',
                            ].filter(Boolean).join(' ')}
                            style={{
                                position: 'absolute',
                                left: seg.midX,
                                top: seg.midY,
                                color: stroke,
                            }}
                            onPointerDown={startDrag(seg.i, seg.horizontal)}
                            onPointerEnter={() => setHovered(true)}
                            onContextMenu={removeBendPair(seg.i)}
                        />
                    )
                })}
            </EdgeLabelRenderer>
        </g>
    )
})
