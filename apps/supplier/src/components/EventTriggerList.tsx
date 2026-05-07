import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import type { DataflowEngine, PublishedTapZone } from '@effects/runtime'
import { applyOverride } from '@effects/player'

interface Props {
    engine: DataflowEngine
    zones: PublishedTapZone[]
}

/**
 * Row-per-zone list with an EMIT button. Both `eventEmitter` (kind:
 * 'event') and `tapZone` (kind: 'tap') sources are surfaced here — the
 * kind tag is shown for context but the API is identical (both
 * processors share the `emit()` method).
 *
 * For `tapZone` this is the supplier-app stand-in for what the Tier-3
 * runtime will eventually do via real hit-testing on the preview
 * canvas. For `eventEmitter` it's the same on-demand pulse the editor
 * exposes via the EMIT button on the node card.
 *
 * Maintains a per-zone bump counter so the button label briefly shows
 * the click count — fast visual feedback that the click landed
 * (downstream effects may take a few frames to reflect the event in
 * the preview canvas).
 */
export function EventTriggerList({ engine, zones }: Props) {
    const [counts, setCounts] = useState<Record<string, number>>({})

    if (zones.length === 0) return null

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {zones.map(z => {
                const c = counts[z.nodeId] ?? 0
                return (
                    <Box
                        key={z.nodeId}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            px: 1,
                            py: 0.75,
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {z.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                {z.eventId} · {z.kind}
                                {z.hint ? ` · ${z.hint}` : ''}
                            </Typography>
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            onClick={() => {
                                applyOverride.emit(engine, z.nodeId)
                                setCounts(prev => ({ ...prev, [z.nodeId]: c + 1 }))
                            }}
                            sx={{ minWidth: 72, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}
                        >
                            EMIT{c > 0 ? ` ·${c}` : ''}
                        </Button>
                    </Box>
                )
            })}
        </Box>
    )
}
