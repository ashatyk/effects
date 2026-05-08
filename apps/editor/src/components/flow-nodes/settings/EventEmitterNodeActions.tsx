import { memo, useCallback, useEffect, useState } from 'react'
import { useEngine } from '../context/EngineContext'
import { ActionButton, StatusLine } from '@effects/ui'
import { EventEmitterProcessor } from '@effects/runtime/node-engine/processors/event-emitter'
import type { NodeSettingsProps } from './types'

export const EventEmitterNodeActions = memo(({ id }: NodeSettingsProps) => {
    const engine = useEngine()

    const [count, setCount] = useState(0)

    /* 80 ms matches the canvas card's poll, so panel reflects fires from
       anywhere (canvas EMIT, programmatic triggers, restored snapshots). */
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<EventEmitterProcessor>(id)
            if (proc) setCount(proc.state.count ?? 0)
        }
        tick()
        const t = setInterval(tick, 80)
        return () => clearInterval(t)
    }, [engine, id])

    const onEmit = useCallback(() => {
        const proc = engine.getProcessor<EventEmitterProcessor>(id)
        proc?.emit()
        engine.markDirty(id)
    }, [engine, id])

    return (
        <>
            <ActionButton onClick={onEmit} variant="primary">EMIT</ActionButton>
            <StatusLine tone="muted">events fired: {count}</StatusLine>
        </>
    )
})
