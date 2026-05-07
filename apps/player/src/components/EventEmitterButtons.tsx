import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import type { PublishedTapZone } from '@effects/runtime'
import type { EffectPlayer } from '@effects/player'

interface Props {
    /** All `tapZones[]` entries with `kind === 'event'` — the
     *  parent already filters out `kind: 'tap'` (those are dispatched
     *  via canvas hit-test, not buttons). */
    zones: PublishedTapZone[]
    player: EffectPlayer | null
}

/**
 * Sidebar list of EMIT buttons for `eventEmitter` nodes exposed in
 * the published surface.
 *
 * Why it's separate from the `tapZone` hit-test path:
 *  - `eventEmitter` has no contour input, so there's nothing to
 *    hit-test against. The Tier-3 contract is "fire on demand from
 *    UI / hotkey / external signal" — a button matches that 1:1.
 *  - `tapZone` is "fire when the user taps the contour region" —
 *    the player owns the hit-test (see `useTapZoneHitTest`) and
 *    forwards (x, y) into `EventSignal.lastX/lastY`.
 *
 * The same button wiring exists in the supplier app's
 * `EventTriggerList`; both go through `EffectPlayer.emit(eventId)`
 * (or `applyOverride.emit` directly) so behaviour is identical.
 *
 * Per-button click counter (`EMIT ·3`) for fast visual confirmation
 * the click landed even when the downstream effect's onset is
 * delayed (e.g. a long-attack envelope). Counter is local UI state —
 * not surfaced to the engine, not persisted.
 */
export function EventEmitterButtons({ zones, player }: Props) {
    const [counts, setCounts] = useState<Record<string, number>>({})

    if (zones.length === 0) return null

    return (
        <Box sx={{
            width: 240,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflowY: 'auto',
        }}>
            <Box sx={{
                px: 1.5, py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
            }}>
                <Typography variant="caption" sx={{
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                }}>
                    Events
                </Typography>
            </Box>
            <Stack spacing={1} sx={{ p: 1.5 }}>
                {zones.map(z => {
                    const c = counts[z.eventId] ?? 0
                    return (
                        <Box key={z.nodeId} sx={{
                            p: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            bgcolor: 'background.default',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.75,
                        }}>
                            <Typography variant="body2" sx={{
                                fontWeight: 700,
                                lineHeight: 1.2,
                            }}>
                                {z.label}
                            </Typography>
                            <Typography variant="caption" sx={{
                                color: 'text.disabled',
                                fontFamily: 'monospace',
                                fontSize: 10,
                            }}>
                                {z.eventId}
                            </Typography>
                            {z.hint && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                                    {z.hint}
                                </Typography>
                            )}
                            <Button
                                size="small"
                                variant="contained"
                                disabled={!player}
                                onClick={() => {
                                    if (!player) return
                                    player.emit(z.eventId)
                                    setCounts(prev => ({ ...prev, [z.eventId]: c + 1 }))
                                }}
                                sx={{
                                    minWidth: 72,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    letterSpacing: 0.4,
                                    mt: 0.25,
                                }}
                            >
                                EMIT{c > 0 ? ` ·${c}` : ''}
                            </Button>
                        </Box>
                    )
                })}
            </Stack>
        </Box>
    )
}
