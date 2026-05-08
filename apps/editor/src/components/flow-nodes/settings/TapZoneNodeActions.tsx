import { memo, useCallback, useEffect, useState } from 'react'
import { useEngine } from '../context/EngineContext'
import { ActionButton, StatusLine } from '@effects/ui'
import { TapZoneProcessor } from '@effects/runtime/node-engine/processors/tap-zone'
import type { NodeSettingsProps } from './types'

/* Editor stand-in for Tier-3's hit-test EMIT. Surfaces contour-wired status
   because Tier-3 has nothing to hit-test against without one. */
export const TapZoneNodeActions = memo(({ id }: NodeSettingsProps) => {
    const engine = useEngine()

    const [count, setCount] = useState(0)
    const [contourConnected, setContourConnected] = useState(false)

    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<TapZoneProcessor>(id)
            if (!proc) return
            setCount(proc.state.count ?? 0)
            setContourConnected(proc.contour != null)
        }
        tick()
        const t = setInterval(tick, 80)
        return () => clearInterval(t)
    }, [engine, id])

    const onEmit = useCallback(() => {
        const proc = engine.getProcessor<TapZoneProcessor>(id)
        proc?.emit()
        engine.markDirty(id)
    }, [engine, id])

    return (
        <>
            <ActionButton onClick={onEmit} variant="primary">EMIT</ActionButton>
            <StatusLine tone="muted">events fired: {count}</StatusLine>
            <StatusLine tone={contourConnected ? 'muted' : 'error'}>
                contour: {contourConnected ? 'connected' : 'not connected — wire a CONTOUR input for runtime hit-test'}
            </StatusLine>
        </>
    )
})
