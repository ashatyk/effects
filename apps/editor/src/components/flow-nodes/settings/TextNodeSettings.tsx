import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { TextFieldRow } from '@effects/ui'
import type { NodeSettingsProps } from './types'

export const TextNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? '') as string
    return (
        <TextFieldRow
            label="value"
            value={value}
            onChange={v => set('value', v)}
            multiline
            rows={4}
            placeholder="Multiline string fed into TextStrip"
        />
    )
})
