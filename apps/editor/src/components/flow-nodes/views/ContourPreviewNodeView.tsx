import { memo, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { contourPreviewDef, ContourPreviewProcessor } from '@effects/runtime/node-engine/processors/contour-preview'
import type { PipelineNodeData } from '../types'

const TANGENT_LEN = 12
const POINT_RADIUS = 1.5

export const ContourPreviewNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const subRef = useRef<(() => void) | null>(null)

    const draw = useCallback(() => {
        const proc = engine.getProcessor<ContourPreviewProcessor>(id)
        const canvas = canvasRef.current
        if (!canvas || !proc?.contour) return
        const c = proc.contour
        if (c.count === 0) return

        const [minX, minY, maxX, maxY] = c.aabb
        const w = Math.max(1, Math.ceil(maxX - minX) + TANGENT_LEN * 2)
        const h = Math.max(1, Math.ceil(maxY - minY) + TANGENT_LEN * 2)
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, w, h)

        const ox = -minX + TANGENT_LEN
        const oy = -minY + TANGENT_LEN

        ctx.strokeStyle = '#3a8a3a'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 0; i < c.count; i++) {
            const x = c.positions[i * 2] + ox
            const y = c.positions[i * 2 + 1] + oy
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        if (c.closed) ctx.closePath()
        ctx.stroke()

        ctx.strokeStyle = '#7aa2ff'
        ctx.lineWidth = 1
        for (let i = 0; i < c.count; i++) {
            const x = c.positions[i * 2] + ox
            const y = c.positions[i * 2 + 1] + oy
            const tx = c.tangents[i * 2]
            const ty = c.tangents[i * 2 + 1]
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(x + tx * TANGENT_LEN, y + ty * TANGENT_LEN)
            ctx.stroke()
        }

        ctx.fillStyle = '#f0f0f0'
        for (let i = 0; i < c.count; i++) {
            const x = c.positions[i * 2] + ox
            const y = c.positions[i * 2 + 1] + oy
            ctx.beginPath()
            ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2)
            ctx.fill()
        }
    }, [engine, id])

    useEffect(() => {
        subRef.current?.()
        const unsub = engine.subscribeNode(id, draw)
        subRef.current = unsub
        return unsub
    }, [engine, id, draw])

    return (
        <BaseNodeShell
            title={contourPreviewDef.title}
            category={contourPreviewDef.category}
            inputs={contourPreviewDef.inputs}
            outputs={contourPreviewDef.outputs}
            minWidth={140}
            minHeight={80}
        >
            <canvas ref={canvasRef} className="pn-preview-canvas" />
        </BaseNodeShell>
    )
})
