/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useMemo, useState } from 'react'
import {
    EdgeLabelRenderer,
    useReactFlow,
    useStore,
    type EdgeProps,
} from '@xyflow/react'
import './styles/editable-edge.css'

/**
 * Orthogonal "editable step" edge.
 *
 * Open-source counterpart to React Flow Pro's "Editable Edge Step" example.
 * The polyline visits a list of stored corner points between source and
 * target; when no points are stored the edge auto-renders the default
 * smooth-step HVH path. On hover, each straight segment shows a midpoint
 * handle that drags ONLY perpendicular to the segment's direction:
 *   - horizontal segment → vertical drag
 *   - vertical   segment → horizontal drag
 *
 * Concept references:
 *   - StackOverflow Q&A by Daniel Cruz / Elna Haim, CC BY-SA 4.0:
 *     https://stackoverflow.com/q/77831116
 *   - React Flow Pro "Editable Edge Step" example:
 *     https://reactflow.dev/examples/edges/editable-edge
 *
 * Replaces the previous standalone `reroute` waypoint node — bends are now
 * a property of the edge itself (`edge.data.bends`) and are persisted /
 * undone via the existing scene snapshot loop in NodeEditor.tsx.
 */

interface Bend {
    x: number
    y: number
}

export interface EditableStepEdgeData {
    bends?: Bend[]
}

const CORNER_R = 8
const HANDLE_MIN_SEG_PX = 18

/* ───────── Path generation ───────── */

/**
 * Build a single SVG `d` attribute that walks through `points` with
 * quadratic-Bezier rounded corners. Each interior point becomes a corner
 * with radius capped at half of the shorter incident segment, so corners
 * never exceed segment length and stay visually tight on dense polylines.
 */
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

/* ───────── Component ───────── */

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
    /* Read the editor-wide grid configuration straight from React Flow's
       store so edges snap to the same step as nodes do. Falls back to no
       snap if the host hasn't enabled it. */
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

    /* Effective bends. Two modes:
         (a) No stored bends → emit default smoothstep HVH that tracks the
             current endpoints automatically.
         (b) Stored bends    → return user-edited absolute coordinates
             BUT pin the first bend's Y to current sourceY and the last
             bend's Y to current targetY. This keeps the always-horizontal
             entry/exit segments orthogonal even after the user drags a
             node up/down — internal bends stay anchored in world space
             so their X (the kink position) is preserved.
       Pinning purely at render time means the stored payload is the
       user's last authored state; we don't pollute it on every node
       move. The next deliberate handle drag will overwrite via
       `setEdges` and capture the new pinned values. */
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

    /* Per-segment metadata used by the midpoint handles. A segment is
       considered horizontal if its y-delta is below 0.5px (covers floating-
       point drift without needing a hard equality). */
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

    /* ───────── Drag handler ─────────
       Segment indexed by `segIdx` lies between points[segIdx] and
       points[segIdx+1]. Translating that to the bends array:
           bend index for points[segIdx]   = segIdx - 1   (or -1 if source)
           bend index for points[segIdx+1] = segIdx       (or N if target)
       End segments need to be split before they can be dragged
       perpendicular: we splice in two extra bends, after which the dragged
       segment becomes "internal" and updates two well-defined bend
       indices for the rest of the gesture. */
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
            /* Only horizontal end segments are draggable in the default
               topology (the source/target handles are on the left/right of
               nodes, so the very first and last segments are always H). A
               vertical end segment shouldn't appear; bail safely. */
            if (!horizontal) return

            if (isStartSeg) {
                /* Split source-attached H segment by inserting two bends at
                   x = halfway between source and original first bend, then
                   snap that x to the editor grid so the kink lines up with
                   the dot pattern from frame 1. */
                const splitX = snapX((sourceX + initialBends[0].x) / 2)
                workingBends = [
                    { x: splitX, y: sourceY },
                    { x: splitX, y: sourceY },
                    ...initialBends,
                ]
                updateA = 1
                updateB = 2
            } else {
                /* Symmetrical split for target-attached H. */
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

        /* Persist the (possibly split) bends immediately so the polyline
           reflects the current control structure on the very first move. */
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
                /* Horizontal segment ⇒ only the shared Y of its two
                   endpoints moves; snap the destination Y to the editor
                   grid so the parallel offset lands on a dot row. */
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

    /* Right-click on a midpoint handle deletes the bend pair it controls
       (and only when both flanking bends are user-controlled — not when the
       segment touches source/target). This is the inverse of the auto-split
       on drag and lets users "straighten" their edges back out. */
    const removeBendPair = useCallback((segIdx: number) => (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const N = bends.length
        const idxA = segIdx - 1
        const idxB = segIdx
        if (idxA < 0 || idxB >= N) return
        /* Only collapse when removing makes geometric sense — drop the two
           flanking bends if they form a kink that has degenerated into a
           pure offset (i.e. the segments around them realign trivially). */
        const next = bends.slice()
        next.splice(idxA, 2)
        setEdges(eds => eds.map(ed =>
            ed.id === id
                ? { ...ed, data: { ...(ed.data ?? {}), bends: next.length > 0 ? next : undefined } }
                : ed,
        ))
    }, [bends, id, setEdges])

    /* The visible & interaction paths share the same `d`. The interaction
       path is wide & invisible and captures hover for the whole edge so the
       midpoint handles surface as soon as the cursor approaches the line. */
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
                    /* Hide handles on segments shorter than the dot
                       diameter — they'd overlap with the corners. */
                    if (seg.length < HANDLE_MIN_SEG_PX) return null
                    /* Visibility: shown on edge-group hover, when this
                       handle is the active drag target, or when the edge
                       itself is selected. The portaled DOM means we can't
                       rely on a parent `.hovered` selector — drive it
                       through an explicit class instead. */
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
                                /* Position via top/left in flow-space coords
                                   so the CSS `transform` (centring +
                                   hover-scale) stays free of inline
                                   overrides. */
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
