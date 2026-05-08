import { memo, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { constantContourDef } from '@effects/runtime/node-engine/processors/constant-contour'
import type { PipelineNodeData } from '../types'

const TANGENT_LEN = 12
const POINT_RADIUS = 1.5

/* Bake-target mirror of `ContourPreviewNodeView`. Hidden from the Add Node
   picker (def.hidden); only instantiated by `BakedPreview` for `.baked.json`. */
export const ConstantContourNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const count = Number(data.params.count) | 0
    const positions = Array.isArray(data.params.positions) ? data.params.positions as number[] : []
    const tangents = Array.isArray(data.params.tangents) ? data.params.tangents as number[] : []
    const aabb = (Array.isArray(data.params.aabb) && data.params.aabb.length === 4
        ? data.params.aabb.map(Number)
        : [0, 0, 0, 0]) as [number, number, number, number]
    const closed = data.params.closed !== false
    const totalLength = Number(data.params.totalLength) || 0

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        if (count < 2) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
                if (canvas.width !== 1 || canvas.height !== 1) { canvas.width = 1; canvas.height = 1 }
                ctx.clearRect(0, 0, 1, 1)
            }
            return
        }
        const [minX, minY, maxX, maxY] = aabb
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
        for (let i = 0; i < count; i++) {
            const x = positions[i * 2] + ox
            const y = positions[i * 2 + 1] + oy
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        if (closed) ctx.closePath()
        ctx.stroke()

        if (tangents.length >= count * 2) {
            ctx.strokeStyle = '#7aa2ff'
            ctx.lineWidth = 1
            for (let i = 0; i < count; i++) {
                const x = positions[i * 2] + ox
                const y = positions[i * 2 + 1] + oy
                const tx = tangents[i * 2]
                const ty = tangents[i * 2 + 1]
                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x + tx * TANGENT_LEN, y + ty * TANGENT_LEN)
                ctx.stroke()
            }
        }

        ctx.fillStyle = '#f0f0f0'
        for (let i = 0; i < count; i++) {
            const x = positions[i * 2] + ox
            const y = positions[i * 2 + 1] + oy
            ctx.beginPath()
            ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2)
            ctx.fill()
        }
    }, [count, closed, positions, tangents, aabb])

    return (
        <BaseNodeShell
            title={constantContourDef.title}
            category={constantContourDef.category}
            inputs={constantContourDef.inputs}
            outputs={constantContourDef.outputs}
            minWidth={160}
            minHeight={120}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
                padding: 4,
                width: '100%',
            }}>
                <canvas ref={canvasRef} className="pn-preview-canvas" />
                <div style={{
                    fontSize: 9,
                    color: 'var(--pn-text-muted, #888)',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    letterSpacing: 0.3,
                }}>
                    {count} pts · {Math.round(totalLength)}px {closed ? '· closed' : '· open'}
                </div>
            </div>
        </BaseNodeShell>
    )
})
