import { memo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Stack from '@mui/material/Stack'
import { Field, TextFieldRow } from '@effects/ui'
import { useScene } from '../../node-editor/SceneContext'
import { useSetNodeLabel } from '../hooks/useSetNodeLabel'
import { FRAME_DEFAULT_COLOR, FRAME_PRESETS, hexToRgba } from '../frame-constants'
import type { NodeSettingsProps } from './types'

/* Frames bypass the engine entirely (no PROCESSOR_CATALOG entry, no addNode).
   Param mutations go through `SceneContext.updateNodeData` directly — `useSetParam`
   would also push to the engine and pollute its `nodeParams` map. */
export const FrameNodeSettings = memo(function FrameNodeSettings(
    { id, data }: NodeSettingsProps,
) {
    const { updateNodeData } = useScene()
    const setLabel = useSetNodeLabel(id)
    const params = data.params as { color?: string }
    const color = (params.color ?? FRAME_DEFAULT_COLOR).toString()

    const setColor = useCallback((next: string) => {
        updateNodeData(id, { params: { ...data.params, color: next } })
    }, [id, data.params, updateNodeData])

    const label = (data.label ?? '').toString()

    return (
        <Stack spacing={1}>
            <TextFieldRow
                label="Label"
                value={label}
                onChange={v => setLabel(v)}
                placeholder="Section name"
            />
            <Field label="Color" column>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 0.75,
                        mt: 0.5,
                    }}
                >
                    {FRAME_PRESETS.map(p => {
                        const active = p.hex.toLowerCase() === color.toLowerCase()
                        return (
                            <Tooltip key={p.id} title={p.name} placement="top">
                                <Box
                                    role="button"
                                    aria-label={`Set color to ${p.name}`}
                                    onClick={() => setColor(p.hex)}
                                    sx={{
                                        height: 28,
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        background: hexToRgba(p.hex, 0.55),
                                        border: '1px solid',
                                        borderColor: active
                                            ? hexToRgba(p.hex, 0.95)
                                            : 'rgba(255, 255, 255, 0.12)',
                                        outline: active
                                            ? '2px solid rgba(255, 255, 255, 0.55)'
                                            : 'none',
                                        outlineOffset: '1px',
                                        transition: 'border-color 0.12s, outline 0.12s',
                                        '&:hover': {
                                            borderColor: hexToRgba(p.hex, 0.95),
                                        },
                                    }}
                                />
                            </Tooltip>
                        )
                    })}
                </Box>
            </Field>
        </Stack>
    )
})
