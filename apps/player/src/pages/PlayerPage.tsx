import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import type { BakedPipeline, PublishedPipeline } from '@effects/runtime'
import {
    EffectPlayer,
    parseConfig,
    pickConfigFile,
    type SupplierConfig,
} from '@effects/player'
import { EventEmitterButtons } from '../components/EventEmitterButtons'
import { useTapZoneHitTest } from '../hooks/useTapZoneHitTest'

// Two mount modes share rendering / event-dispatch / hit-test:
//   baked   → EffectPlayer.fromBaked (no SAM, no config merge, frozen)
//   pipeline → EffectPlayer.create (live; supports config swap at runtime)
export type PlayerMount =
    | { kind: 'baked'; baked: BakedPipeline }
    | { kind: 'pipeline'; pipeline: PublishedPipeline; initialConfig: SupplierConfig | null }

interface Props {
    mount: PlayerMount
    onClear: () => void
}

export function PlayerPage({ mount, onClear }: Props) {
    const navigate = useNavigate()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const playerRef = useRef<EffectPlayer | null>(null)
    // State mirror of playerRef so children re-render after the async create resolves.
    const [player, setPlayer] = useState<EffectPlayer | null>(null)
    const [activeConfig, setActiveConfig] = useState<SupplierConfig | null>(
        mount.kind === 'pipeline' ? mount.initialConfig : null,
    )
    const [ready, setReady] = useState(false)
    const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)

    // PublishedPipeline and BakedPipeline share id/name/surface shape;
    // baked surface is trimmed to dynamic-only entries.
    const surface = mount.kind === 'baked' ? mount.baked.surface : mount.pipeline.surface
    const headerId = mount.kind === 'baked' ? mount.baked.id : mount.pipeline.id
    const headerName = mount.kind === 'baked' ? mount.baked.name : mount.pipeline.name
    const headerVersion = mount.kind === 'baked' ? mount.baked.pipelineVersion : mount.pipeline.version

    // Split tapZones into the two dispatch UX paths:
    //   'event' → sidebar EMIT buttons; 'tap' → canvas hit-test.
    const eventZones = useMemo(
        () => surface.tapZones.filter(z => z.kind === 'event'),
        [surface],
    )
    const tapZones = useMemo(
        () => surface.tapZones.filter(z => z.kind === 'tap'),
        [surface],
    )

    // Mount once per `mount` payload. Config swaps go through a separate
    // path so they don't tear down the GPU context. Baked mounts ignore
    // live config overrides — what got baked is frozen.
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        let destroyed = false
        ;(async () => {
            try {
                const created = mount.kind === 'baked'
                    ? await EffectPlayer.fromBaked({ baked: mount.baked, canvas })
                    : await EffectPlayer.create({
                        pipeline: mount.pipeline,
                        config: mount.initialConfig ?? undefined,
                        canvas,
                    })
                if (destroyed) { created.destroy(); return }
                playerRef.current = created
                setPlayer(created)
                setReady(true)
            } catch (e) {
                setToast({ tone: 'error', text: `Player init failed: ${(e as Error).message}` })
            }
        })()
        return () => {
            destroyed = true
            playerRef.current?.destroy()
            playerRef.current = null
            setPlayer(null)
            setReady(false)
        }
        // Mount identity is the structural input; config changes go via
        // toolbar buttons (Load config / Reset), NOT a remount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mount])

    // Hit-test reads live proc.contour from the engine — works equally
    // against baked constantContour nodes and original segmentation chains.
    useTapZoneHitTest(canvasRef.current, player?.engine ?? null, player, surface)

    const onBack = useCallback(() => {
        onClear()
        navigate('/')
    }, [navigate, onClear])

    const onLoadConfig = useCallback(async () => {
        // Defensive: button is hidden in baked mode (no live SupplierConfig).
        if (mount.kind !== 'pipeline') return
        const text = await pickConfigFile()
        if (text == null) return
        const parsed = parseConfig(text, mount.pipeline)
        if (!parsed.ok) {
            setToast({ tone: 'error', text: parsed.error })
            return
        }
        playerRef.current?.setConfig(parsed.config)
        setActiveConfig(parsed.config)
        setToast({ tone: 'success', text: 'Config applied.' })
    }, [mount])

    const onResetDefaults = useCallback(() => {
        // setConfig with empty maps falls back to manifest defaults —
        // same path as omitting `config` on initial create.
        if (!playerRef.current) return
        const empty = playerRef.current.getConfig()
        const cleared = {
            ...empty,
            imageSlots: {},
            segmentation: {},
            fields: {},
            texts: {},
        }
        playerRef.current.setConfig(cleared)
        setActiveConfig(null)
        setToast({ tone: 'warning', text: 'Reset to manifest defaults.' })
    }, [])

    return (
        <Box sx={{
            height: '100%',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
            bgcolor: 'background.default',
        }}>
            <Box sx={{
                px: 2, py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'background.paper',
            }}>
                <Typography variant="body2" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
                    Effects · Player
                </Typography>
                <Typography variant="caption" sx={{
                    color: 'text.disabled',
                    fontFamily: 'monospace',
                }}>
                    {headerName} · {headerId}@{headerVersion}
                    {mount.kind === 'baked' ? ' · baked' : ''}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Stack direction="row" spacing={1}>
                    {mount.kind === 'pipeline' && (
                        <>
                            <Button size="small" variant="outlined" onClick={onLoadConfig}>
                                Load config
                            </Button>
                            <Button size="small" variant="outlined" onClick={onResetDefaults} disabled={!activeConfig}>
                                Reset
                            </Button>
                        </>
                    )}
                    <Button size="small" variant="text" onClick={onBack}>
                        Back
                    </Button>
                </Stack>
            </Box>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: eventZones.length > 0 ? '1fr auto' : '1fr',
                minHeight: 0,
                overflow: 'hidden',
            }}>
                <Box sx={{
                    p: 2, minHeight: 0, overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}>
                    <Box sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 2,
                        bgcolor: '#0a0a0a',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        position: 'relative',
                    }}>
                        <canvas
                            ref={canvasRef}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                display: 'block',
                                imageRendering: 'auto',
                                // Outline (vs border) doesn't enter box-model so it
                                // never shifts the canvas; lets the user see the
                                // publishRoot frame boundary for hit-test verification.
                                outline: '1px solid #2a2a2a',
                                outlineOffset: 0,
                                // Pointer cursor signals canvas-level clickability
                                // when any tap-zone is present (not per-zone).
                                cursor: tapZones.length > 0 ? 'pointer' : 'default',
                            }}
                        />
                        {!ready && (
                            <Box sx={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'text.disabled',
                                fontFamily: 'monospace',
                                letterSpacing: 0.5,
                            }}>
                                Initializing GPU…
                            </Box>
                        )}
                        <Typography
                            variant="caption"
                            sx={{
                                position: 'absolute',
                                bottom: 6,
                                right: 8,
                                color: 'text.disabled',
                                fontSize: 9,
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                            }}
                        >
                            {activeConfig ? 'config-driven' : 'authored defaults'}
                        </Typography>
                    </Box>
                </Box>

                <EventEmitterButtons zones={eventZones} player={player} />
            </Box>

            <Box sx={{
                px: 2, py: 1,
                borderTop: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                gap: 2,
                alignItems: 'center',
            }}>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    fields: {surface.fields.length} ·
                    {' '}imageSlots: {surface.imageSlots.length} ·
                    {' '}tapZones: {tapZones.length} ·
                    {' '}eventEmitters: {eventZones.length} ·
                    {' '}wholeNodes: {surface.wholeNodes.length}
                    {mount.kind === 'baked' && mount.baked.bakeReport && (
                        ` · baked: ${mount.baked.bakeReport.entries.length} subgraphs (${mount.baked.bakeReport.nodesBefore}→${mount.baked.bakeReport.nodesAfter})`
                    )}
                </Typography>
            </Box>

            <Snackbar
                open={!!toast}
                autoHideDuration={3000}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {toast ? (
                    <Alert severity={toast.tone} variant="filled" sx={{ fontSize: 12 }}>
                        {toast.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Box>
    )
}
