/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import {
    type DataflowEngine,
    type PublishedWholeNode,
    SegmentationProcessor,
} from '@effects/runtime'
import type { SamPoint } from '@effects/player'

const CANVAS_W = 360

const COL_INCLUDE = '#14b8a6'
const COL_EXCLUDE = '#f87171'

interface Props {
    engine: DataflowEngine
    node: PublishedWholeNode
    points: SamPoint[]
    // Saving `polygon` is critical: with it Tier-3 player skips SAM
    // entirely (~150 MB native memory saved); without it the runtime
    // must re-spawn SAM to recompute what's already known.
    onChange: (payload: { points: SamPoint[]; polygon?: number[] }) => void
}

// Polling (vs proc.onChange) — onChange callbacks collide if the
// editor-side view is also mounted; polling is robust for supplier.
export function SegmentationInput({ engine, node, points, onChange }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    const [status, setStatus] = useState('Waiting for image...')
    const [statusKind, setStatusKind] = useState<'idle' | 'busy' | 'ready' | 'error'>('idle')
    const [, forceTick] = useState(0)

    const proc = useCallback(() => engine.getProcessor<SegmentationProcessor>(node.nodeId), [engine, node.nodeId])

    // Polygon length acts as a cheap "has it changed" proxy so we
    // don't push the same payload to the parent every poll.
    const lastPolygonLenRef = useRef(-1)

    useEffect(() => {
        const t = setInterval(() => {
            const p = proc()
            if (!p) return
            setStatus(p.statusText)
            setStatusKind(
                p.status === 'error' ? 'error'
                    : p.status === 'loading-model' || p.status === 'encoding' || p.status === 'decoding' ? 'busy'
                        : p.embeddingsReady ? 'ready' : 'idle',
            )
            forceTick(n => n + 1)

            // Push fresh polygon so the exported config is self-contained.
            const len = p.polygon.length
            if (len !== lastPolygonLenRef.current && len >= 6) {
                lastPolygonLenRef.current = len
                onChange({ points, polygon: [...p.polygon] })
            } else if (len === 0 && lastPolygonLenRef.current > 0) {
                // SAM cleared (image change / reset) — drop stale polygon.
                lastPolygonLenRef.current = 0
                onChange({ points })
            }
        }, 120)
        return () => clearInterval(t)
    }, [proc, points, onChange])

    useEffect(() => {
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
                const r = 5
                ctx.lineWidth = 2
                ctx.strokeStyle = pt.label === 1 ? COL_INCLUDE : COL_EXCLUDE
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
    })

    const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.stopPropagation()
        const p = proc()
        if (!p?.embeddingsReady) return
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        const label: 0 | 1 = e.shiftKey ? 0 : 1
        const updated: SamPoint[] = [...points, { point: [nx, ny], label }]
        // Drop polygon — SAM will produce a new one; poll loop re-pushes it.
        onChange({ points: updated })
    }, [proc, points, onChange])

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        e.stopPropagation()
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        // 10-px radius hit-test; newest match wins so right-click "undoes" last add.
        const w = canvas.width || CANVAS_W
        const h = canvas.height || Math.round(CANVAS_W * 0.75)
        const r2 = (10 / w) * (10 / w) + (10 / h) * (10 / h)
        let removeIdx = -1
        let bestDist = Infinity
        for (let i = points.length - 1; i >= 0; i--) {
            const pt = points[i]
            const dx = pt.point[0] - nx
            const dy = pt.point[1] - ny
            const d = dx * dx + dy * dy
            if (d <= r2 && d < bestDist) { bestDist = d; removeIdx = i }
        }
        if (removeIdx >= 0) {
            const updated = points.filter((_, i) => i !== removeIdx)
            // Drop polygon — SAM re-decodes with the new point set.
            onChange({ points: updated })
        }
    }, [points, onChange])

    const statusColor =
        statusKind === 'error' ? COL_EXCLUDE
            : statusKind === 'ready' ? COL_INCLUDE
                : 'rgba(255,255,255,0.55)'

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {node.label}
                </Typography>
                {node.hint && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                        {node.hint}
                    </Typography>
                )}
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>
                    Click = add point. Shift+Click = exclude. Right-click on a marker = remove.
                </Typography>
            </Box>
            <Box
                sx={{
                    position: 'relative',
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: '#0a0a0a',
                    border: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <Box
                    component="canvas"
                    ref={canvasRef}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    sx={{
                        width: '100%',
                        display: 'block',
                        cursor: statusKind === 'ready' ? 'crosshair' : 'default',
                    }}
                />
            </Box>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    minHeight: 22,
                }}
            >
                {statusKind === 'busy' ? (
                    <CircularProgress size={10} thickness={6} sx={{ color: 'text.primary' }} />
                ) : (
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusColor }} />
                )}
                <Typography sx={{ fontSize: 11, lineHeight: 1.3, fontWeight: 600 }}>
                    {status}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
                    {points.length} point{points.length === 1 ? '' : 's'}
                </Typography>
            </Box>
        </Box>
    )
}
