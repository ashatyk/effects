import { memo } from 'react'
import Box from '@mui/material/Box'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, TextFieldRow } from '@effects/ui'
import type { NodeSettingsProps } from './types'

export const EventEmitterNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const throttleMs = (data.params.throttleMs ?? 0) as number
    const eventId = (data.params.id as string | undefined) ?? ''
    const label = (data.params.label as string | undefined) ?? 'Event'

    return (
        <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <TextFieldRow
                    label="event id"
                    value={eventId}
                    onChange={v => set('id', v)}
                    placeholder="evt_button"
                    monospace
                />
                <TextFieldRow
                    label="label"
                    value={label}
                    onChange={v => set('label', v)}
                    placeholder="Event"
                />
            </Box>
            <NumberField label="throttle (ms)" value={throttleMs} step={10} min={0} onChange={v => set('throttleMs', v)} />
        </>
    )
})
