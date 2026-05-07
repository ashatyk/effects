import { memo, useCallback, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Button from '@mui/material/Button'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { useSetParam } from '../hooks/useSetParam'
import { TextFieldRow, StatusLine } from '@effects/ui'
import { tapZoneDef, TapZoneProcessor } from '@effects/runtime/node-engine/processors/tap-zone'
import type { PipelineNodeData } from '../types'

/**
 * Tap-zone node view. Same EMIT-button affordance as `eventEmitter`
 * for editor-time chain testing (Envelope/SignalSwitch responding to
 * synthetic taps), plus the supplier-facing `id`/`label` params and a
 * status line that surfaces whether the contour input is currently
 * wired (the contour is a hard dependency for the Tier-3 hit-test).
 */
export const TapZoneNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)

    const eventId = (data.params.id as string | undefined) ?? ''
    const label = (data.params.label as string | undefined) ?? 'Tap zone'

    const [count, setCount] = useState(0)
    const [contourConnected, setContourConnected] = useState(false)

    /* Poll the processor for live event count + contour-connection
       state. Sub-frame resolution isn't needed — 80 ms keeps the
       badge feeling responsive without burning the main thread. */
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
            minWidth={240}
        >
            <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={onEmit}
                className="nodrag"
                sx={{
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
            <TextFieldRow
                label="event id"
                value={eventId}
                onChange={v => set('id', v)}
                placeholder="tap_button"
                monospace
            />
            <TextFieldRow
                label="label"
                value={label}
                onChange={v => set('label', v)}
                placeholder="Tap zone"
            />
            <StatusLine tone="muted">events: {count}</StatusLine>
            <StatusLine tone={contourConnected ? 'muted' : 'error'}>
                contour: {contourConnected ? 'connected' : 'not connected — wire a CONTOUR input for runtime hit-test'}
            </StatusLine>
        </BaseNodeShell>
    )
})
