/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { ActionButton, StatusLine } from './widgets'
import { segmentationDef } from '../../node-engine/processors/segmentation'
import { SegmentationProcessor } from '../../node-engine/processors/segmentation'
import type { SamPoint } from '../../engine/sam/types'
import type { PipelineNodeData } from './types'

const CANVAS_W = 280
const HOVER_DEBOUNCE = 150

export const SegmentationNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [status, setStatus] = useState('Waiting for image...')
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
                for (let i = 0; i < mask.length; i++) {
                    if (mask[i] > 0) {
                        imgData.data[i * 4] = 0
                        imgData.data[i * 4 + 1] = 114
                        imgData.data[i * 4 + 2] = 189
                        imgData.data[i * 4 + 3] = 128
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
                const r = isHl ? 8 : 5
                ctx.lineWidth = 2
                if (pt.label === 1) {
                    ctx.strokeStyle = isHl ? '#0f0' : '#4f4'
                    ctx.beginPath()
                    ctx.moveTo(px - r, py); ctx.lineTo(px + r, py)
                    ctx.moveTo(px, py - r); ctx.lineTo(px, py + r)
                    ctx.stroke()
                } else {
                    ctx.strokeStyle = isHl ? '#f00' : '#f44'
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

    return (
        <BaseNodeShell title="Segmentation" category={segmentationDef.category} inputs={segmentationDef.inputs} outputs={segmentationDef.outputs}>
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
                    borderRadius: 1,
                    bgcolor: '#000',
                    cursor: ready ? 'crosshair' : 'default',
                }}
            />
            <StatusLine>{status}</StatusLine>

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
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--pn-text-secondary)',
                        borderColor: 'var(--pn-divider-strong)',
                    },
                    '& .MuiToggleButton-root.Mui-selected[value="1"]': {
                        backgroundColor: 'rgba(16,185,129,0.18)',
                        color: '#0e8a64',
                    },
                    '& .MuiToggleButton-root.Mui-selected[value="0"]': {
                        backgroundColor: 'rgba(229,72,77,0.18)',
                        color: '#c4201d',
                    },
                }}
            >
                <ToggleButton value={1}>+</ToggleButton>
                <ToggleButton value={0}>−</ToggleButton>
            </ToggleButtonGroup>

            {points.length > 0 && (
                <Stack>
                    {points.map((pt, i) => (
                        <Stack
                            key={i}
                            direction="row"
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            sx={{
                                px: 0.5,
                                py: 0.25,
                                borderRadius: 0.5,
                                fontSize: 10,
                                bgcolor: hoveredIdx === i ? 'rgba(0,0,0,0.05)' : 'transparent',
                            }}
                        >
                            <Typography
                                component="span"
                                sx={{
                                    width: 12,
                                    fontWeight: 700,
                                    color: pt.label === 1 ? '#0e8a64' : '#c4201d',
                                }}
                            >
                                {pt.label === 1 ? '+' : '−'}
                            </Typography>
                            <Typography
                                component="span"
                                sx={{
                                    flex: 1,
                                    fontFamily: 'ui-monospace, Menlo, monospace',
                                    color: 'var(--pn-text-secondary)',
                                    fontSize: 10,
                                }}
                            >
                                ({pt.point[0].toFixed(2)}, {pt.point[1].toFixed(2)})
                            </Typography>
                            <IconButton size="small" onClick={() => removePoint(i)} sx={{ p: 0.25 }}>
                                <CloseIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                        </Stack>
                    ))}
                    <ActionButton onClick={clearAll}>Clear all</ActionButton>
                </Stack>
            )}
        </BaseNodeShell>
    )
})
