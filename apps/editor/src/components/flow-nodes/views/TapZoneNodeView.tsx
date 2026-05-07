import { memo, useCallback, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Button from '@mui/material/Button'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { StatusLine } from '@effects/ui'
import { tapZoneDef, TapZoneProcessor } from '@effects/runtime/node-engine/processors/tap-zone'
import type { PipelineNodeData } from '../types'

/**
 * Graph card: supplier-facing identity, live event counter, contour
 * status, plus a manual EMIT button. Tier-3 runtime owns hit-testing
 * — the editor stand-in fires the same `emit()` from the canvas so
 * downstream chains can be tested without leaving the graph. Editable
 * id / label / hint live in `TapZoneNodeSettings`.
 */
export const TapZoneNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()

    const eventId = (data.params.id as string | undefined) ?? ''
    const label = (data.params.label as string | undefined) ?? 'Tap zone'

    const [count, setCount] = useState(0)
    const [contourConnected, setContourConnected] = useState(false)

    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<TapZoneProcessor>(id)
            if (!proc) return
            setCount(proc.state.count ?? 0)
            setContourConnected(proc.contour != null)
        }
        const t = setInterval(tick, 80)
        return () => clearInterval(t)
    }, [engine, id])

    const onEmit = useCallback(() => {
        const proc = engine.getProcessor<TapZoneProcessor>(id)
        proc?.emit()
        engine.markDirty(id)
    }, [engine, id])

    return (
        <BaseNodeShell
            title={tapZoneDef.title}
            category={tapZoneDef.category}
            inputs={tapZoneDef.inputs}
            outputs={tapZoneDef.outputs}
            minWidth={220}
        >
            <StatusLine tone={eventId ? 'muted' : 'error'}>
                id: {eventId || '(unset — edit in Settings)'}
            </StatusLine>
            <StatusLine tone="muted">label: {label}</StatusLine>
            <StatusLine tone="muted">events: {count}</StatusLine>
            <StatusLine tone={contourConnected ? 'muted' : 'error'}>
                contour: {contourConnected ? 'connected' : 'not connected — wire a CONTOUR input for runtime hit-test'}
            </StatusLine>
            <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={onEmit}
                className="nodrag"
                sx={{
                    mt: 0.5,
                    height: 44,
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: 2,
                    backgroundColor: 'var(--pn-text)',
                    color: 'var(--pn-bg-input)',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.30), inset 0 -1px 0 rgba(255, 255, 255, 0.10)',
                    '&:hover': {
                        backgroundColor: '#000',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.40), inset 0 -1px 0 rgba(255, 255, 255, 0.10)',
                    },
                    '&:active': {
                        backgroundColor: '#000',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.40)',
                    },
                }}
            >
                EMIT
            </Button>
        </BaseNodeShell>
    )
})
