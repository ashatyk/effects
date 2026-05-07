import { memo } from 'react'
import Box from '@mui/material/Box'
import { useSetParam } from '../hooks/useSetParam'
import { TextFieldRow } from '@effects/ui'
import type { NodeSettingsProps } from './types'

function slugify(v: string): string {
    return v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
}

export const PublishRootNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const name = (data.params.name as string | undefined) ?? 'Untitled'
    const version = (data.params.version as string | undefined) ?? 'v1'
    const effectId = (data.params.effectId as string | undefined) ?? ''

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <TextFieldRow
                label="name"
                value={name}
                onChange={v => set('name', v)}
                placeholder="Untitled"
            />
            <TextFieldRow
                label="version"
                value={version}
                onChange={v => set('version', v)}
                placeholder="v1"
            />
            <TextFieldRow
                label="id (slug)"
                value={effectId}
                onChange={v => set('effectId', slugify(v))}
                placeholder="my-effect"
                monospace
            />
        </Box>
    )
})
