/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CloseIcon from '@mui/icons-material/Close'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { segmentationDef } from '@effects/runtime/node-engine/processors/segmentation'
import { SegmentationProcessor } from '@effects/runtime/node-engine/processors/segmentation'
import type { SamPoint } from '@effects/runtime/sam/types'
import type { PipelineNodeData } from '../types'

const CANVAS_W = 280
const HOVER_DEBOUNCE = 150

const COL_INCLUDE = '#14b8a6'
const COL_INCLUDE_HL = '#2dd4bf'
const COL_EXCLUDE = '#f87171'
const COL_EXCLUDE_HL = '#fb7185'
/** Same hue as `COL_EXCLUDE` but at low alpha — used as the wash under
 *  destructive icon-button hovers (Clear all, remove-point) so the
 *  affordance reads "this will delete" without painting a hard, opaque
 *  red disc against the pale node body. */
const COL_EXCLUDE_HOVER_BG = 'rgba(248, 113, 113, 0.16)'
const COL_EXCLUDE_ACTIVE_BG = 'rgba(248, 113, 113, 0.26)'

export const SegmentationNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [status, setStatus] = useState('Waiting for image...')
    const [statusKind, setStatusKind] = useState<'idle' | 'busy' | 'ready' | 'error'>('idle')
    const [points, setPoints] = useState<SamPoint[]>([])
    const [activeLabel, setActiveLabel] = useState<0 | 1>(1)
    const [ready, setReady] = useState(false)
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
    const [, forceUpdate] = useState(0)

    const proc = useCallback(
        () => engine.getProcessor<SegmentationProcessor>(id),
        [engine, id],
    )

    useEffect(() => {
        const p = proc()
        if (!p) return
        if (p.points.length > 0 && points.length === 0) {
            setPoints([...p.points])
        }
        p.onChange = () => {
            setStatus(p.statusText)
            setStatusKind(
                p.status === 'error' ? 'error'
                    : p.status === 'loading-model' || p.status === 'encoding' || p.status === 'decoding' ? 'busy'
                        : p.embeddingsReady ? 'ready' : 'idle',
            )
            setReady(p.embeddingsReady)
            forceUpdate(n => n + 1)
        }
        return () => { if (p) p.onChange = null }
    }, [proc])

    const redraw = useCallback((highlightIdx?: number | null) => {
        const canvas = canvasRef.current
        const p = proc()
        if (!canvas || !p) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const url = p.imageDataUrl

        if (!url) {
            if (canvas.width !== CANVAS_W) {
                canvas.width = CANVAS_W
                canvas.height = Math.round(CANVAS_W * 0.75)
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            return
        }

        const drawAll = (img: HTMLImageElement) => {
            const aspect = img.naturalHeight / img.naturalWidth
            const ph = Math.round(CANVAS_W * aspect)
            if (canvas.width !== CANVAS_W || canvas.height !== ph) {
                canvas.width = CANVAS_W
                canvas.height = ph
            }
            const cw = canvas.width
            const ch = canvas.height
            ctx.clearRect(0, 0, cw, ch)
            ctx.drawImage(img, 0, 0, cw, ch)

            if (p.maskData) {
                const { mask, width: mw, height: mh } = p.maskData
                const off = document.createElement('canvas')
                off.width = mw
                off.height = mh
                const octx = off.getContext('2d')!
                const imgData = octx.createImageData(mw, mh)
                /* RGBA matching `COL_INCLUDE` (#14b8a6 = teal-500) so the
                   mask tint reads as the same hue as the include points and
                   the node accent (category 'contour'). */
                for (let i = 0; i < mask.length; i++) {
                    if (mask[i] > 0) {
                        imgData.data[i * 4] = 20
                        imgData.data[i * 4 + 1] = 184
                        imgData.data[i * 4 + 2] = 166
                        imgData.data[i * 4 + 3] = 110
                    }
                }
                octx.putImageData(imgData, 0, 0)
                ctx.drawImage(off, 0, 0, cw, ch)
            }

            for (let i = 0; i < points.length; i++) {
                const pt = points[i]
                const px = pt.point[0] * cw
                const py = pt.point[1] * ch
                const isHl = highlightIdx === i
                const r = isHl ? 7 : 5
                ctx.lineWidth = isHl ? 3 : 2
                ctx.strokeStyle = pt.label === 1
                    ? (isHl ? COL_INCLUDE_HL : COL_INCLUDE)
                    : (isHl ? COL_EXCLUDE_HL : COL_EXCLUDE)
                ctx.fillStyle = 'rgba(0,0,0,0.55)'
                ctx.beginPath()
                ctx.arc(px, py, r + 1.5, 0, Math.PI * 2)
                ctx.fill()
                if (pt.label === 1) {
                    ctx.beginPath()
                    ctx.moveTo(px - r, py); ctx.lineTo(px + r, py)
                    ctx.moveTo(px, py - r); ctx.lineTo(px, py + r)
                    ctx.stroke()
                } else {
                    ctx.beginPath()
                    ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r)
                    ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r)
                    ctx.stroke()
                }
            }
        }

        if (imgRef.current && imgRef.current.src === url) {
            drawAll(imgRef.current)
        } else {
            const img = new Image()
            img.onload = () => { imgRef.current = img; drawAll(img) }
            img.src = url
        }
    }, [proc, points])

    useEffect(() => {
        const p = proc()
        if (p) p.points = points
    }, [points, proc])

    useEffect(() => { redraw(hoveredIdx) }, [redraw, hoveredIdx, status])

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.stopPropagation()
        const p = proc()
        if (!p?.embeddingsReady) return
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        const label = e.button === 2 ? 0 : activeLabel
        const newPt: SamPoint = { point: [nx, ny], label }
        const updated = [...points, newPt]
        setPoints(updated)
        p.decode(updated)
    }, [proc, points, activeLabel])

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        e.stopPropagation()
        handleClick(e)
    }, [handleClick])

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const p = proc()
        if (!p?.embeddingsReady) return
        const canvas = canvasRef.current
        if (!canvas) return
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        const rect = canvas.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        hoverTimer.current = setTimeout(() => {
            if (p.status === 'decoding') return
            const hoverPt: SamPoint = { point: [nx, ny], label: activeLabel }
            p.decode([...points, hoverPt])
        }, HOVER_DEBOUNCE)
    }, [proc, points, activeLabel])

    const handleMouseLeave = useCallback(() => {
        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
        const p = proc()
        if (!p) return
        if (points.length > 0) { p.decode([...points]) }
        else { p.maskData = null; p.onChange?.() }
    }, [proc, points])

    const removePoint = useCallback((idx: number) => {
        const p = proc()
        const updated = points.filter((_, i) => i !== idx)
        setPoints(updated)
        if (updated.length > 0) { p?.decode(updated) }
        else { if (p) { p.maskData = null; p.polygon = []; p.onChange?.() }; engine.markDirty(id) }
    }, [proc, points, engine, id])

    const clearAll = useCallback(() => {
        const p = proc()
        setPoints([])
        if (p) { p.maskData = null; p.polygon = []; p.onChange?.() }
        engine.markDirty(id)
    }, [proc, engine, id])

    const statusColor =
        statusKind === 'error' ? COL_EXCLUDE
            : statusKind === 'ready' ? COL_INCLUDE
                : 'var(--pn-text-secondary)'

    return (
        <BaseNodeShell
            title={segmentationDef.title}
            category={segmentationDef.category}
            inputs={segmentationDef.inputs}
            outputs={segmentationDef.outputs}
        >
            {/* Image canvas. The dark backdrop frames the photo and makes
                point markers + the teal mask overlay readable. A 1 px
                inset ring matches other dark surfaces in the editor. */}
            <Box
                sx={{
                    position: 'relative',
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: '#0a0a0a',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                }}
            >
                <Box
                    component="canvas"
                    ref={canvasRef}
                    className="nodrag nopan"
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    sx={{
                        width: '100%',
                        display: 'block',
                        cursor: ready ? 'crosshair' : 'default',
                    }}
                />
            </Box>

            {/* Status row — white input surface with mono text, mirrors the
                contrast language of the rest of the editor (input fields
                + the black Load-image button). The leading dot/spinner
                still carries the colour signal. */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: 'var(--pn-bg-input)',
                    border: '1px solid var(--pn-divider-strong)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                    minHeight: 22,
                    boxSizing: 'border-box',
                }}
            >
                {statusKind === 'busy' ? (
                    <CircularProgress
                        size={10}
                        thickness={6}
                        sx={{ color: 'var(--pn-text)', flexShrink: 0 }}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor: statusColor,
                        }}
                    />
                )}
                <Typography
                    sx={{
                        fontSize: 11,
                        lineHeight: 1.3,
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 600,
                        color: 'var(--pn-text)',
                        wordBreak: 'break-word',
                    }}
                >
                    {status}
                </Typography>
            </Box>

            {/* Mode toggle — same visual language as the black "primary"
                ActionButton: the active segment fills with `--pn-text`
                (near-black) and prints white, the inactive segment stays
                on the input surface with an outlined dark border. The
                colour-coded icon keeps the +/− legend without sacrificing
                the high-contrast button look. */}
            <ToggleButtonGroup
                value={activeLabel}
                exclusive
                onChange={(_, v) => { if (v != null) setActiveLabel(v as 0 | 1) }}
                fullWidth
                size="small"
                className="nodrag"
                sx={{
                    '& .MuiToggleButton-root': {
                        py: 0.5,
                        gap: 0.5,
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'none',
                        bgcolor: 'var(--pn-bg-input)',
                        color: 'var(--pn-text)',
                        borderColor: 'var(--pn-divider-strong)',
                        transition: 'background-color 0.12s, color 0.12s',
                    },
                    '& .MuiToggleButton-root:hover': {
                        bgcolor: 'rgba(0, 0, 0, 0.06)',
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                        bgcolor: 'var(--pn-text)',
                        color: 'var(--pn-bg-input)',
                        borderColor: 'var(--pn-text)',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.20)',
                    },
                    '& .MuiToggleButton-root.Mui-selected:hover': {
                        bgcolor: '#000',
                    },
                    '& .MuiToggleButton-root.Mui-selected[value="1"] .seg-icon': {
                        color: COL_INCLUDE,
                    },
                    '& .MuiToggleButton-root.Mui-selected[value="0"] .seg-icon': {
                        color: COL_EXCLUDE,
                    },
                }}
            >
                <ToggleButton value={1}>
                    <AddIcon className="seg-icon" sx={{ fontSize: 16, color: COL_INCLUDE }} />
                    Include
                </ToggleButton>
                <ToggleButton value={0}>
                    <RemoveIcon className="seg-icon" sx={{ fontSize: 16, color: COL_EXCLUDE }} />
                    Exclude
                </ToggleButton>
            </ToggleButtonGroup>

            {/* Points list — uppercase section header with count + a
                pill-shaped trash button on the right. Each row sits on
                a white input surface to maximise contrast against the
                gray card surface; the colour chip on the left keeps the
                include/exclude legend without diluting the row. */}
            {points.length > 0 && (
                <Box>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            px: 0.5,
                            mb: 0.5,
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                                color: 'var(--pn-text)',
                            }}
                        >
                            Points ({points.length})
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={clearAll}
                            className="nodrag"
                            title="Clear all"
                            sx={{
                                /* Destructive-action affordance: muted in
                                   rest state, tints to the same red the
                                   Exclude button uses (`COL_EXCLUDE`) on
                                   hover with a very light wash so the
                                   icon doesn't sit inside a heavy black
                                   square against the pale node body. */
                                p: 0.25,
                                color: 'var(--pn-text-muted)',
                                borderRadius: 0.75,
                                transition: 'color 120ms, background-color 120ms',
                                '&:hover': {
                                    color: COL_EXCLUDE,
                                    bgcolor: COL_EXCLUDE_HOVER_BG,
                                },
                                '&:active': {
                                    bgcolor: COL_EXCLUDE_ACTIVE_BG,
                                },
                            }}
                        >
                            <DeleteSweepIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                        }}
                    >
                        {points.map((pt, i) => {
                            const isInclude = pt.label === 1
                            const tint = isInclude ? COL_INCLUDE : COL_EXCLUDE
                            return (
                                <Box
                                    key={i}
                                    onMouseEnter={() => setHoveredIdx(i)}
                                    onMouseLeave={() => setHoveredIdx(null)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.75,
                                        px: 0.75,
                                        py: 0.375,
                                        borderRadius: 1,
                                        minHeight: 22,
                                        boxSizing: 'border-box',
                                        bgcolor: 'var(--pn-bg-input)',
                                        border: '1px solid var(--pn-divider-strong)',
                                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
                                        transition: 'border-color 0.12s',
                                        '&:hover': { borderColor: 'var(--pn-text)' },
                                        '& .point-delete': {
                                            opacity: hoveredIdx === i ? 1 : 0,
                                            transition: 'opacity 0.1s',
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 14,
                                            height: 14,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            bgcolor: tint,
                                            color: '#fff',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {isInclude
                                            ? <AddIcon sx={{ fontSize: 11 }} />
                                            : <RemoveIcon sx={{ fontSize: 11 }} />}
                                    </Box>
                                    <Typography
                                        component="span"
                                        sx={{
                                            flex: 1,
                                            fontFamily: 'ui-monospace, Menlo, monospace',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: 'var(--pn-text)',
                                        }}
                                    >
                                        {pt.point[0].toFixed(2)}, {pt.point[1].toFixed(2)}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        className="nodrag point-delete"
                                        onClick={() => removePoint(i)}
                                        sx={{
                                            /* Same destructive-affordance
                                               pattern as Clear all — tints
                                               red on hover with a light
                                               wash, never paints a solid
                                               opaque disc. */
                                            p: 0.125,
                                            color: 'var(--pn-text-muted)',
                                            transition: 'color 120ms, background-color 120ms',
                                            '&:hover': {
                                                color: COL_EXCLUDE,
                                                bgcolor: COL_EXCLUDE_HOVER_BG,
                                            },
                                            '&:active': {
                                                bgcolor: COL_EXCLUDE_ACTIVE_BG,
                                            },
                                        }}
                                    >
                                        <CloseIcon sx={{ fontSize: 13 }} />
                                    </IconButton>
                                </Box>
                            )
                        })}
                    </Box>
                </Box>
            )}
        </BaseNodeShell>
    )
})
