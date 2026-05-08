import { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import { BaseNodeShell } from '../BaseNodeShell'
import { useEngine } from '../context/EngineContext'
import { SectionTitle } from '@effects/ui'
import { COL_SECONDARY, COL_DIVIDER } from '@effects/ui/widgets/constants'
import { logDef, LogProcessor } from '@effects/runtime/node-engine/processors/log'
import type { EffectMetrics } from '@effects/runtime/node-engine/types'
import type { PipelineNodeData } from '../types'

/* Throttle React commits — a 60fps Effect would otherwise rerender the timing
   widget 60×/s with barely-changing smoothed numbers. */
const RENDER_INTERVAL_MS = 100

function fmtMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—'
    if (ms < 1) return `${ms.toFixed(2)} ms`
    if (ms < 10) return `${ms.toFixed(2)} ms`
    return `${ms.toFixed(1)} ms`
}

export const LogNodeView = memo(function LogNodeView(
    { id }: NodeProps & { data: PipelineNodeData },
) {
    const engine = useEngine()
    const [snapshot, setSnapshot] = useState<EffectMetrics | null>(null)
    /* Mirror snapshot in a ref so the throttled `pull` can compare without
       `snapshot` in the effect deps (would tear down the subscription per commit). */
    const snapshotRef = useRef<EffectMetrics | null>(null)
    snapshotRef.current = snapshot

    useEffect(() => {
        let lastRender = 0
        const pull = () => {
            const proc = engine.getProcessor<LogProcessor>(id)
            const m = proc?.lastSmoothed ?? null
            const prev = snapshotRef.current
            /* Cheap exits to keep React out of the hot path: nothing to show, or
               within the throttle window. */
            if (!m && !prev) return
            const now = performance.now()
            if (now - lastRender < RENDER_INTERVAL_MS && m && prev
                && m.effectName === prev.effectName) {
                return
            }
            lastRender = now
            setSnapshot(m)
        }
        pull()
        return engine.subscribeNode(id, pull)
    }, [engine, id])

    const fpsBudget = snapshot ? 1000 / Math.max(snapshot.totalMs, 0.001) : 0
    const cap = snapshot
        ? Math.max(2, ...snapshot.passes.map(p => p.cpuMs), snapshot.totalMs)
        : 1

    return (
        <BaseNodeShell
            title={logDef.title}
            category={logDef.category}
            inputs={logDef.inputs}
            outputs={logDef.outputs}
            minWidth={300}
        >
            {snapshot && (
                <Stack spacing={0.75}>
                    <SectionTitle>{snapshot.effectName}</SectionTitle>
                    <SummaryRow label="total" value={fmtMs(snapshot.totalMs)} />
                    <SummaryRow label="cpu (build)" value={fmtMs(snapshot.cpuMs)} />
                    <SummaryRow label="gpu dispatch" value={fmtMs(snapshot.gpuDispatchMs)} />
                    <SummaryRow
                        label="budget"
                        value={`${fpsBudget.toFixed(0)} fps cap`}
                        muted
                    />

                    <Box sx={{ borderTop: '1px solid', borderColor: COL_DIVIDER, mt: 0.5, pt: 0.75 }}>
                        <SectionTitle>passes (cpu build)</SectionTitle>
                        <Stack spacing={0.4} sx={{ mt: 0.5 }}>
                            {snapshot.passes.map(p => (
                                <PassRow
                                    key={p.id}
                                    label={p.id}
                                    kind={p.kind}
                                    ms={p.cpuMs}
                                    skipped={p.skipped}
                                    cap={cap}
                                />
                            ))}
                        </Stack>
                    </Box>
                </Stack>
            )}
        </BaseNodeShell>
    )
})

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return (
        <Stack
            direction="row"
            sx={{
                fontSize: 11,
                fontFamily: 'ui-monospace, Menlo, monospace',
                color: muted ? COL_SECONDARY : 'inherit',
                lineHeight: 1.5,
            }}
        >
            <Box sx={{ flex: 1, color: COL_SECONDARY }}>{label}</Box>
            <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Box>
        </Stack>
    )
}

function PassRow({ label, kind, ms, skipped, cap }: {
    label: string
    kind: 'fullscreen' | 'instanced'
    ms: number
    skipped: boolean
    cap: number
}) {
    const pct = skipped ? 0 : Math.min(1, ms / Math.max(cap, 0.001)) * 100
    return (
        <Box>
            <Stack direction="row" sx={{ fontSize: 10.5, lineHeight: 1.4 }}>
                <Box sx={{ flex: 1, color: COL_SECONDARY, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {label}
                    <Box component="span" sx={{ ml: 0.5, opacity: 0.6, fontSize: 9.5 }}>
                        {kind === 'instanced' ? '· inst' : '· full'}
                    </Box>
                </Box>
                <Box sx={{
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    fontVariantNumeric: 'tabular-nums',
                    color: skipped ? COL_SECONDARY : 'inherit',
                }}>
                    {skipped ? 'skipped' : fmtMs(ms)}
                </Box>
            </Stack>
            {!skipped && (
                <Box
                    sx={{
                        mt: 0.25,
                        height: 3,
                        borderRadius: 999,
                        bgcolor: 'rgba(0, 0, 0, 0.08)',
                        overflow: 'hidden',
                    }}
                >
                    <Box
                        sx={{
                            width: `${pct}%`,
                            height: '100%',
                            bgcolor: kind === 'instanced' ? '#ec4899' : '#3b82f6',
                            transition: 'width 120ms linear',
                        }}
                    />
                </Box>
            )}
        </Box>
    )
}
