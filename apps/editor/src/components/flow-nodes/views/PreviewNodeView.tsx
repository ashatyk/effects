import { memo, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { previewDef } from '@effects/runtime/node-engine/processors/preview'
import { PreviewProcessor } from '@effects/runtime/node-engine/processors/preview'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: live image preview of the wired upstream texture. Save
 * button lives in `PreviewNodeSettings`.
 */
export const PreviewNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const subRef = useRef<(() => void) | null>(null)

    const draw = useCallback(() => {
        const proc = engine.getProcessor<PreviewProcessor>(id)
        const canvas = canvasRef.current
        if (!canvas || !proc?.imgCanvas) return
        const src = proc.imgCanvas
        if (src.width === 0 || src.height === 0) return

        const w = src.width
        const h = src.height
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(src, 0, 0, w, h)
    }, [engine, id])

    useEffect(() => {
        subRef.current?.()
        const unsub = engine.subscribeNode(id, draw)
        subRef.current = unsub
        return unsub
    }, [engine, id, draw])

    return (
        <BaseNodeShell
            title={previewDef.title}
            category={previewDef.category}
            inputs={previewDef.inputs}
            outputs={previewDef.outputs}
            minWidth={120}
            minHeight={60}
        >
            <canvas ref={canvasRef} className="pn-preview-canvas" />
        </BaseNodeShell>
    )
})
