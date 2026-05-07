import { memo, useCallback, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Button from '@mui/material/Button'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, StatusLine, TextFieldRow } from '@effects/ui'
import { eventEmitterDef, EventEmitterProcessor } from '@effects/runtime/node-engine/processors/event-emitter'
import type { PipelineNodeData } from '../types'

export const EventEmitterNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const throttleMs = (data.params.throttleMs ?? 0) as number
    const eventId = (data.params.id as string | undefined) ?? ''
    const label = (data.params.label as string | undefined) ?? 'Event'

    const [count, setCount] = useState(0)

    /* Poll the processor's event counter so the UI shows every emit. The
       Emit button updates `state.count` synchronously inside `emit()`, but
       downstream propagation only happens on the next engine tick — the
       poll keeps the badge in sync regardless of tick rate. */
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<EventEmitterProcessor>(id)
            if (proc) setCount(proc.state.count ?? 0)
        }
        const t = setInterval(tick, 80)
        return () => clearInterval(t)
    }, [engine, id])

    const onEmit = useCallback(() => {
        const proc = engine.getProcessor<EventEmitterProcessor>(id)
        proc?.emit()
        engine.markDirty(id)
    }, [engine, id])

    return (
        <BaseNodeShell title={eventEmitterDef.title} category={eventEmitterDef.category} inputs={eventEmitterDef.inputs} outputs={eventEmitterDef.outputs} minWidth={200}>
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
                    /* Explicit dark-on-light styling — the theme's primary
                       palette is white-ish (geist.gray900) which collapses
                       to invisible against the light card body. Keep the
                       button inverted regardless of theme. */
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
                placeholder="evt_button"
                monospace
            />
            <TextFieldRow
                label="label"
                value={label}
                onChange={v => set('label', v)}
                placeholder="Event"
            />
            <NumberField label="throttle (ms)" value={throttleMs} step={10} min={0} onChange={v => set('throttleMs', v)} />
            <StatusLine tone="muted">events: {count}</StatusLine>
        </BaseNodeShell>
    )
})
