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
    onClear: () => void
}

// Every form interaction calls applyOverride.* on the engine AND mutates
// a local SupplierConfig — no "Apply" button; preview reacts next tick.
export function SupplierPage({ pipeline, onClear }: Props) {
    const navigate = useNavigate()
    const { engine, ready } = useSupplierRuntime(pipeline)
    const [config, setConfig] = useState<SupplierConfig>(() => emptyConfig(pipeline))
    const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)
    // Local UI only — not persisted to SupplierConfig; runtime has no
    // notion of "background", this is a preview affordance.
    const [backgroundSlotId, setBackgroundSlotId] = useState<string | null>(null)

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
        // Persist both points (re-edit) and polygon (Tier-3 payload — player
        // applies it directly without spawning SAM).
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
        // Defensive re-apply: a recent setText/setImage may have raced
        // ahead of a tick, so make outputCache reflect what we'll bake.
        applyAllOverrides(engine, pipeline, config)
        // Give the engine one frame to flush async loads (image decode,
        // text rasterisation); bakePipeline surfaces per-node errors otherwise.
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
        // Imported config may lack the slot we pointed at — drop selection.
        setBackgroundSlotId(null)
        setToast({ tone: 'success', text: 'Config imported.' })
    }, [engine, pipeline])

    const onReset = useCallback(() => {
        const fresh = emptyConfig(pipeline)
        setConfig(fresh)
        if (engine) applyAllOverrides(engine, pipeline, fresh)
        // Reset clears every uploaded image, so the background pointer would dangle.
        setBackgroundSlotId(null)
        setToast({ tone: 'warning', text: 'Reset to manifest defaults.' })
    }, [engine, pipeline])

    // Apply config once the engine is ready (handles import-before-boot).
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

                    {otherWholeNodes.length > 0 && (
                        <Section title="Other">
                            {otherWholeNodes.map(node => (
                                <WholeNodeInput key={node.nodeId} node={node} />
                            ))}
                        </Section>
                    )}

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

                    {/* Tap zones — manual fire stands in for Tier-3 hit-tested
                        clicks so supplier can verify downstream Envelope/
                        SignalSwitch chains. */}
                    {pipeline.surface.tapZones.length > 0 && engine && (
                        <Section title="Events">
                            <EventTriggerList engine={engine} zones={pipeline.surface.tapZones} />
                        </Section>
                    )}

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
