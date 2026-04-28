import { memo, useCallback, useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Button from '@mui/material/Button'
import { BaseNodeShell } from './BaseNodeShell'
import { useEngine } from './EngineContext'
import { useSetParam } from './useSetParam'
import { NumberField, StatusLine } from './widgets'
import { tapDef, TapProcessor } from '../../node-engine/processors/tap'
import type { PipelineNodeData } from './types'

export const TapNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const engine = useEngine()
    const set = useSetParam(id)
    const throttleMs = (data.params.throttleMs ?? 50) as number

    const [count, setCount] = useState(0)

    /* Poll the processor's pulse counter so the UI reflects every tap (live
       click on canvas, dev "Fire" button, or programmatic dispatch). */
    useEffect(() => {
        const tick = () => {
            const proc = engine.getProcessor<TapProcessor>(id)
            if (proc) {
                const c = (proc as unknown as { state?: { count: number } }).state?.count ?? 0
                setCount(c)
            }
        }
        const t = setInterval(tick, 80)
        return () => clearInterval(t)
    }, [engine, id])

    const fire = useCallback(() => {
        const proc = engine.getProcessor<TapProcessor>(id)
        proc?.fireSynthetic()
        engine.markDirty(id)
    }, [engine, id])

    return (
        <BaseNodeShell title="Tap" category={tapDef.category} inputs={tapDef.inputs} outputs={tapDef.outputs} minWidth={200}>
            <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={fire}
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
                TAP
            </Button>
            <NumberField label="throttle (ms)" value={throttleMs} step={10} min={0} onChange={v => set('throttleMs', v)} />
            <StatusLine tone="muted">pulses: {count}</StatusLine>
        </BaseNodeShell>
    )
})
