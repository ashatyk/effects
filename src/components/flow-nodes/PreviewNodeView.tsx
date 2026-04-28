import { memo, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeResizer } from '@xyflow/react'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { useIsHeadlessNode } from './HeadlessNodeContext'
import { ActionButton } from './widgets'
import { previewDef } from '../../node-engine/processors/preview'
import { PreviewProcessor } from '../../node-engine/processors/preview'
import type { PipelineNodeData } from './types'

export const PreviewNodeView = memo(({ id, selected }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const headless = useIsHeadlessNode()
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

    const saveImage = useCallback(() => {
        const proc = engine.getProcessor<PreviewProcessor>(id)
        if (!proc?.imgCanvas) return
        const dataUrl = proc.imgCanvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `preview-${id}.png`
        a.click()
    }, [engine, id])

    return (
        <>
            {!headless && (
                <NodeResizer
                    minWidth={120}
                    minHeight={60}
                    isVisible={selected}
                    lineClassName="pn-resize-line"
                    handleClassName="pn-resize-handle"
                />
            )}
            <BaseNodeShell title="Preview" category={previewDef.category} inputs={previewDef.inputs} outputs={previewDef.outputs}>
                <canvas ref={canvasRef} className="pn-preview-canvas" />
                <ActionButton onClick={saveImage} variant="primary">Save image</ActionButton>
            </BaseNodeShell>
        </>
    )
})
