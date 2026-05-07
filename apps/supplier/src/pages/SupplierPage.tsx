import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import type { PublishedPipeline } from '@effects/runtime'

import { SupplierToolbar } from '../components/SupplierToolbar'
import { ImageSlotInput } from '../components/ImageSlotInput'
import { SegmentationInput } from '../components/SegmentationInput'
import { FieldInput } from '../components/FieldInput'
import { WholeNodeInput } from '../components/WholeNodeInput'
import { TextInput } from '../components/TextInput'
import { PreviewCanvas } from '../components/PreviewCanvas'
import { EventTriggerList } from '../components/EventTriggerList'
import { useSupplierRuntime } from '../runtime/useSupplierRuntime'
import {
    applyAllOverrides,
    applyOverride,
    bakePipeline,
    downloadBaked,
    downloadConfig,
    emptyConfig,
    parseConfig,
    pickConfigFile,
    type SamPoint,
    type SupplierConfig,
} from '@effects/player'

interface Props {
    pipeline: PublishedPipeline
    /** Called by the Back button — clears App-level pipeline state
     *  so the picker route opens fresh. */
    onClear: () => void
}

/**
 * Main supplier page. Two-column layout:
 *  left  → form (image slots → segmentation → fields → tap zones).
 *  right → live preview canvas, sticky.
 *
 * State model: every form interaction calls `applyOverride.*` to
 * patch the running engine immediately AND mutates a local
 * `SupplierConfig` so Export captures the latest state. There is no
 * "Apply" button — the live preview reacts on the next engine tick.
 */
export function SupplierPage({ pipeline, onClear }: Props) {
    const navigate = useNavigate()
    const { engine, ready } = useSupplierRuntime(pipeline)
    const [config, setConfig] = useState<SupplierConfig>(() => emptyConfig(pipeline))
    const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)
    /* Which image slot's bitmap is painted behind the preview canvas.
       Local UI state — NOT persisted into SupplierConfig (the runtime
       has no concept of "background", it's a supplier-side preview
       affordance for verifying outline-only / glow-only effects look
       right against a real photo). */
    const [backgroundSlotId, setBackgroundSlotId] = useState<string | null>(null)

    /* ── Form helpers (all close over engine + config setter) ─── */

    const setImage = useCallback((nodeId: string, dataUrl: string) => {
        if (!engine) return
        applyOverride.image(engine, nodeId, dataUrl)
        setConfig(c => ({
            ...c,
            imageSlots: { ...c.imageSlots, [nodeId]: { dataUrl } },
        }))
    }, [engine])

    const setSegmentation = useCallback((nodeId: string, payload: { points: SamPoint[]; polygon?: number[] }) => {
        if (!engine) return
        applyOverride.segmentation(engine, nodeId, payload)
        /* Persist BOTH the supplier-marked points (for re-edit in a
           later session) and the SAM-computed polygon (the actual
           Tier-3 payload — the player applies it directly without
           spawning SAM). */
        setConfig(c => ({
            ...c,
            segmentation: { ...c.segmentation, [nodeId]: payload },
        }))
    }, [engine])

    const setField = useCallback((nodeId: string, paramKey: string, value: number | number[]) => {
        if (!engine) return
        if (Array.isArray(value)) {
            applyOverride.vector(engine, nodeId, paramKey, value)
        } else {
            applyOverride.scalar(engine, nodeId, paramKey, value)
        }
        setConfig(c => ({
            ...c,
            fields: { ...c.fields, [`${nodeId}:${paramKey}`]: value },
        }))
    }, [engine])

    const setText = useCallback((nodeId: string, value: string) => {
        if (!engine) return
        applyOverride.text(engine, nodeId, value)
        setConfig(c => ({
            ...c,
            texts: { ...c.texts, [nodeId]: { value } },
        }))
    }, [engine])

    /* ── Toolbar actions ─────────────────────────────────────── */

    const onBack = useCallback(() => {
        onClear()
        navigate('/')
    }, [navigate, onClear])

    const onExport = useCallback(() => {
        downloadConfig(config)
        setToast({ tone: 'success', text: `Exported config for "${pipeline.name}".` })
    }, [config, pipeline])

    const onExportBaked = useCallback(async () => {
        if (!engine) return
        /* Re-apply the live config first so the engine's outputCache
           reflects exactly what the export should bake. The preview
           has already been ticking with these overrides applied, but
           defensive — a recent setText / setImage may have raced
           ahead of a tick. */
        applyAllOverrides(engine, pipeline, config)
        /* Give the engine one frame to flush any async loads (image
           uploads, text strip rasterisation). One rAF is usually
           enough for a steady-state scene; if a freshly-uploaded
           image hasn't decoded yet `bakePipeline` will surface a
           clear per-node error. */
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        const result = await bakePipeline(engine, pipeline, config)
        if (!result.ok) {
            setToast({ tone: 'error', text: `Bake failed: ${result.error}` })
            return
        }
        downloadBaked(result.baked)
        const r = result.baked.bakeReport
        const summary = r ? ` (${r.entries.length} subgraphs baked, ${r.nodesBefore}→${r.nodesAfter} nodes)` : ''
        setToast({ tone: 'success', text: `Baked "${pipeline.name}"${summary}.` })
    }, [engine, pipeline, config])

    const onImport = useCallback(async () => {
        const text = await pickConfigFile()
        if (text == null) return
        const parsed = parseConfig(text, pipeline)
        if (!parsed.ok) {
            setToast({ tone: 'error', text: parsed.error })
            return
        }
        setConfig(parsed.config)
        if (engine) applyAllOverrides(engine, pipeline, parsed.config)
        /* Same rationale as onReset — the imported config may not
           carry the slot we previously pointed at, so drop the
           selection rather than leave a stale toggle. */
        setBackgroundSlotId(null)
        setToast({ tone: 'success', text: 'Config imported.' })
    }, [engine, pipeline])

    const onReset = useCallback(() => {
        const fresh = emptyConfig(pipeline)
        setConfig(fresh)
        if (engine) applyAllOverrides(engine, pipeline, fresh)
        /* Reset clears every uploaded image; the background pointer
           would be dangling otherwise (resolves to undefined dataUrl
           but the toggle button would still read "active"). */
        setBackgroundSlotId(null)
        setToast({ tone: 'warning', text: 'Reset to manifest defaults.' })
    }, [engine, pipeline])

    /* On engine ready, apply whatever's already in `config` (e.g. if
       the user imported before the engine finished booting). */
    useEffect(() => {
        if (!ready || !engine) return
        applyAllOverrides(engine, pipeline, config)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, engine])

    const segmentationNodes = pipeline.surface.wholeNodes.filter(n => n.processor === 'segmentation')
    const textNodes = pipeline.surface.wholeNodes.filter(n => n.processor === 'text')
    const otherWholeNodes = pipeline.surface.wholeNodes.filter(n => (
        n.processor !== 'segmentation' && n.processor !== 'text'
    ))

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <SupplierToolbar
                pipeline={pipeline}
                onBack={onBack}
                onExport={onExport}
                onExportBaked={onExportBaked}
                onImport={onImport}
                onReset={onReset}
            />
            <Box
                sx={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 480px) 1fr' },
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
                <Box
                    sx={{
                        overflowY: 'auto',
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2.5,
                        bgcolor: 'background.default',
                        borderRight: { md: 1 },
                        borderColor: { md: 'divider' },
                    }}
                >
                    {/* Image slots */}
                    {pipeline.surface.imageSlots.length > 0 && (
                        <Section title="Images">
                            {pipeline.surface.imageSlots.map(slot => (
                                <ImageSlotInput
                                    key={slot.nodeId}
                                    slot={slot}
                                    dataUrl={config.imageSlots[slot.nodeId]?.dataUrl}
                                    onChange={dataUrl => setImage(slot.nodeId, dataUrl)}
                                    isBackground={backgroundSlotId === slot.nodeId}
                                    onToggleBackground={() => setBackgroundSlotId(
                                        prev => prev === slot.nodeId ? null : slot.nodeId,
                                    )}
                                />
                            ))}
                        </Section>
                    )}

                    {/* Segmentation */}
                    {segmentationNodes.length > 0 && engine && (
                        <Section title="Segmentation">
                            {segmentationNodes.map(node => (
                                <SegmentationInput
                                    key={node.nodeId}
                                    engine={engine}
                                    node={node}
                                    points={config.segmentation[node.nodeId]?.points ?? []}
                                    onChange={payload => setSegmentation(node.nodeId, payload)}
                                />
                            ))}
                        </Section>
                    )}

                    {/* Text inputs */}
                    {textNodes.length > 0 && engine && (
                        <Section title="Text">
                            {textNodes.map(node => (
                                <TextInput
                                    key={node.nodeId}
                                    engine={engine}
                                    node={node}
                                    value={config.texts[node.nodeId]?.value}
                                    onChange={v => setText(node.nodeId, v)}
                                />
                            ))}
                        </Section>
                    )}

                    {/* Other whole-node fallbacks */}
                    {otherWholeNodes.length > 0 && (
                        <Section title="Other">
                            {otherWholeNodes.map(node => (
                                <WholeNodeInput key={node.nodeId} node={node} />
                            ))}
                        </Section>
                    )}

                    {/* Fields */}
                    {pipeline.surface.fields.length > 0 && (
                        <Section title="Parameters">
                            {pipeline.surface.fields.map(f => (
                                <FieldInput
                                    key={`${f.nodeId}:${f.paramKey}`}
                                    field={f}
                                    value={config.fields[`${f.nodeId}:${f.paramKey}`]}
                                    defaultValue={f.field.default}
                                    onChange={v => setField(f.nodeId, f.paramKey, v)}
                                />
                            ))}
                        </Section>
                    )}

                    {/* Tap zones — interactive emit. Standin for the
                        Tier-3 hit-tested click; supplier needs to be able
                        to fire each event by hand to verify the
                        Envelope/SignalSwitch chains downstream actually
                        do what the author promised. */}
                    {pipeline.surface.tapZones.length > 0 && engine && (
                        <Section title="Events">
                            <EventTriggerList engine={engine} zones={pipeline.surface.tapZones} />
                        </Section>
                    )}

                    {/* Empty-surface hint — fires when the published manifest
                        has no exposable inputs at all. Lets the supplier
                        verify the file isn't empty by accident. */}
                    {pipeline.surface.imageSlots.length === 0
                        && pipeline.surface.fields.length === 0
                        && pipeline.surface.wholeNodes.length === 0
                        && pipeline.surface.tapZones.length === 0 && (
                        <Alert severity="info" sx={{ fontSize: 11 }}>
                            This manifest has no supplier-facing inputs. The author needs to mark some nodes as exposed in the editor.
                        </Alert>
                    )}
                </Box>

                <Box sx={{ p: 2, minHeight: 0, overflow: 'hidden' }}>
                    {engine
                        ? <PreviewCanvas
                            engine={engine}
                            pipeline={pipeline}
                            backgroundUrl={backgroundSlotId
                                ? config.imageSlots[backgroundSlotId]?.dataUrl ?? null
                                : null}
                          />
                        : <Box sx={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'text.disabled',
                          }}>Initializing GPU...</Box>}
                </Box>
            </Box>

            <Snackbar
                open={toast != null}
                autoHideDuration={toast?.tone === 'success' ? 3500 : 6000}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                {toast ? (
                    <Alert
                        severity={toast.tone}
                        variant="filled"
                        onClose={() => setToast(null)}
                        sx={{ fontSize: 12 }}
                    >
                        {toast.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Box>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Typography
                variant="caption"
                sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                }}
            >
                {title}
            </Typography>
            {children}
        </Box>
    )
}
