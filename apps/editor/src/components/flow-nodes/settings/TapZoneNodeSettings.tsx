import { memo } from 'react'
import Box from '@mui/material/Box'
import { useSetParam } from '../hooks/useSetParam'
import { TextFieldRow } from '@effects/ui'
import type { NodeSettingsProps } from './types'

/**
 * Settings pane: identity (`id`, `label`). The manual EMIT trigger
 * lives on the graph card itself (`TapZoneNodeView`) — same rationale
 * as `EventEmitterNodeSettings`: testing-friendly to keep the
 * dispatch button on the canvas.
 */
export const TapZoneNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const eventId = (data.params.id as string | undefined) ?? ''
    const label = (data.params.label as string | undefined) ?? 'Tap zone'

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <TextFieldRow
                label="event id"
                value={eventId}
                onChange={v => set('id', v)}
                placeholder="tap_button"
                monospace
            />
            <TextFieldRow
                label="label"
                value={label}
                onChange={v => set('label', v)}
                placeholder="Tap zone"
            />
        </Box>
    )
})
