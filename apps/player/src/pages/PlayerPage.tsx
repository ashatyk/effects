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

/**
 * The mount payload — picked exclusively by the picker.
 *
 * - `kind: 'baked'` — single self-contained AOT artifact. Player
 *   uses `EffectPlayer.fromBaked` (no config merge, no SAM, no
 *   live overrides on baked nodes — what got baked is frozen).
 * - `kind: 'pipeline'` — original published pipeline + optional
 *   supplier config. Player uses `EffectPlayer.create` (replays
 *   the supplier-style flow live; spawns SAM if the pipeline has
 *   segmentation; supports config swap via "Load config" button).
 *
 * The two modes share rendering / event-dispatch / tap-zone
 * hit-test — the page only branches on which constructor to call
 * and which surface metadata to display.
 */
export type PlayerMount =
    | { kind: 'baked'; baked: BakedPipeline }
    | { kind: 'pipeline'; pipeline: PublishedPipeline; initialConfig: SupplierConfig | null }

interface Props {
    mount: PlayerMount
    /** Called by Back — clears App-level state so the picker opens fresh. */
    onClear: () => void
}

/**
 * The Tier-3 player demo page.
 *
 * Owns one `EffectPlayer` instance bound to a single visible
 * `<canvas>`. The page is intentionally minimal — header, canvas,
 * footer, optional events sidebar. No form, no exposed parameters,
 * no segmentation widget.
 *
 * Two event-dispatch surfaces (the Tier-3 contract for tier-2
 * triggers):
 *  - **`tapZone` nodes** (`kind: 'tap'`) — hit-tested against the
 *    live `ContourSamples` on every canvas click via
 *    `useTapZoneHitTest`. Cursor goes to `pointer` when at least
 *    one tap zone is present, signalling clickability.
 *  - **`eventEmitter` nodes** (`kind: 'event'`) — surface as EMIT
 *    buttons in the right sidebar via `EventEmitterButtons`. No
 *    contour to hit-test; on-demand only.
 *
 * Both paths route through `EffectPlayer.emit(eventId, x?, y?)` so
 * downstream `Envelope` / `SignalSwitch` / `AnimationSwitch` chains
 * see the fresh `event.count` on the next tick — same code path as
 * the supplier's EventTriggerList button. The player demo is the
 * **integration acceptance test** for `@effects/player`: any
 * partner integration that mounts `EffectPlayer.create({ pipeline,
 * config, canvas })` + wires its own click handler / trigger UI
 * gets the same behaviour.
 */
export function PlayerPage({ mount, onClear }: Props) {
    const navigate = useNavigate()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const playerRef = useRef<EffectPlayer | null>(null)
    /* Mirror of playerRef for child-component reactivity (sidebar,
       hit-test hook). Refs alone don't trigger re-render after the
       async create resolves; this state push does. */
    const [player, setPlayer] = useState<EffectPlayer | null>(null)
    const [activeConfig, setActiveConfig] = useState<SupplierConfig | null>(
        mount.kind === 'pipeline' ? mount.initialConfig : null,
    )
    const [ready, setReady] = useState(false)
    const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)

    /* Surface metadata reads from whichever object carries it for
       the active mount. PublishedPipeline and BakedPipeline have
       structurally identical `id`/`name`/`surface` shapes — the
       latter is just trimmed to dynamic-only entries. */
    const surface = mount.kind === 'baked' ? mount.baked.surface : mount.pipeline.surface
    const headerId = mount.kind === 'baked' ? mount.baked.id : mount.pipeline.id
    const headerName = mount.kind === 'baked' ? mount.baked.name : mount.pipeline.name
    const headerVersion = mount.kind === 'baked' ? mount.baked.pipelineVersion : mount.pipeline.version

    /* Split surface.tapZones[] into the two dispatch UX paths.
       `event` = sidebar EMIT buttons; `tap` = canvas hit-test.
       Same code path for baked + pipeline modes — surface shape
       is identical. */
    const eventZones = useMemo(
        () => surface.tapZones.filter(z => z.kind === 'event'),
        [surface],
    )
    const tapZones = useMemo(
        () => surface.tapZones.filter(z => z.kind === 'tap'),
        [surface],
    )

    /* Mount the player once per `mount` payload. The config is
       reapplied below in a separate effect so swapping configs at
       runtime (Load config button) doesn't tear down the GPU
       context. Baked mounts ignore live config overrides — what
       got baked is frozen. */
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
        /* The mount object identity is the structural input. Live
           config changes flow through the toolbar buttons (Load
           config / Reset), NOT through a remount. */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mount])

    /* Wire native canvas clicks → tap-zone hit-test → player.emit().
       The hook is a no-op when `tapZones` is empty, so layouts with
       only event-emitters (or no events at all) pay nothing.
       Hit-test reads the live `proc.contour` off the engine — works
       identically against baked `constantContour` nodes (their
       output is a real ContourSamples reference) and original
       segmentation/contourResample chains. */
    useTapZoneHitTest(canvasRef.current, player?.engine ?? null, player, surface)

    /* ── Toolbar actions ─────────────────────────────────────── */

    const onBack = useCallback(() => {
        onClear()
        navigate('/')
    }, [navigate, onClear])

    const onLoadConfig = useCallback(async () => {
        /* Only meaningful in pipeline mount — baked mounts have no
           SupplierConfig at runtime; everything that wasn't exposed
           in the surface is frozen. The button is hidden in baked
           mode so this guard is mostly defensive. */
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
        /* setConfig with an empty config makes the player fall back
           to manifest defaults — same path as omitting `config` on
           initial create. */
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
            {/* Header */}
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

            {/* Middle row — canvas (always) + events sidebar (only if kind='event' present) */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: eventZones.length > 0 ? '1fr auto' : '1fr',
                minHeight: 0,
                overflow: 'hidden',
            }}>
                {/* Canvas */}
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
                                /* 1px frame around the canvas itself (NOT the
                                   wrapper) so the user can see exactly where
                                   the publishRoot frame ends — important for
                                   tap-zone hit-testing and for verifying the
                                   effect's authored canvas dimensions match
                                   what was published. */
                                outline: '1px solid #2a2a2a',
                                outlineOffset: 0,
                                /* Visual affordance: when there are tap-zones,
                                   the canvas is interactive — show the standard
                                   "you can click me" cursor. Misses (clicks in
                                   the letterbox or outside any zone) are
                                   silently ignored, the cursor stays
                                   honest about clickability of the canvas
                                   area, not per-zone. */
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

                {/* Events sidebar (event-emitters → buttons) */}
                <EventEmitterButtons zones={eventZones} player={player} />
            </Box>

            {/* Footer */}
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
