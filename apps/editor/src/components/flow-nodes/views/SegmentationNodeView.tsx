import { memo, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Typography from '@mui/material/Typography'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { segmentationDef } from '@effects/runtime/node-engine/processors/segmentation'
import { SegmentationProcessor } from '@effects/runtime/node-engine/processors/segmentation'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: visual-only — shows the SAM processor's status and the
 * count of currently-set point hints. The interactive image canvas
 * (point picking + mask preview), Include/Exclude toggle, and points
 * list all live in `SegmentationNodeSettings`.
 */
export const SegmentationNodeView = memo(({ id }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const [status, setStatus] = useState('Waiting for image...')
    const [ready, setReady] = useState(false)
    const [pointCount, setPointCount] = useState(0)

    useEffect(() => {
        const p = engine.getProcessor<SegmentationProcessor>(id)
        if (!p) return
        const sync = () => {
            setStatus(p.statusText)
            setReady(p.embeddingsReady)
            setPointCount(p.points.length)
        }
        sync()
        const t = setInterval(sync, 200)
        return () => clearInterval(t)
    }, [engine, id])

    return (
        <BaseNodeShell
            title={segmentationDef.title}
            category={segmentationDef.category}
            inputs={segmentationDef.inputs}
            outputs={segmentationDef.outputs}
        >
            <Typography
                sx={{
                    fontSize: 11,
                    lineHeight: 1.3,
                    color: 'var(--pn-text)',
                    opacity: 0.85,
                }}
            >
                {pointCount > 0
                    ? `${pointCount} point${pointCount === 1 ? '' : 's'} · ${ready ? 'ready' : status}`
                    : ready
                        ? 'ready — edit in Settings'
                        : status}
            </Typography>
        </BaseNodeShell>
    )
})
