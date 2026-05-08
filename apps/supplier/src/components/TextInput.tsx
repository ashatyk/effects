import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { TextFieldRow } from '@effects/ui'
import type { DataflowEngine, PublishedWholeNode } from '@effects/runtime'

interface Props {
    engine: DataflowEngine
    node: PublishedWholeNode
    // Undefined override falls through to the engine's authored default.
    value: string | undefined
    onChange: (value: string) => void
}

export function TextInput({ engine, node, value, onChange }: Props) {
    // Authored default is shown as placeholder only — never echoed as the value,
    // which would mask the override state.
    const [authoredDefault, setAuthoredDefault] = useState('')
    useEffect(() => {
        const params = engine.getNodeParams(node.nodeId)
        const v = typeof params?.value === 'string' ? params.value : ''
        setAuthoredDefault(v)
    }, [engine, node.nodeId])

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {node.label}
            </Typography>
            {node.hint && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {node.hint}
                </Typography>
            )}
            <TextFieldRow
                label=""
                value={value ?? authoredDefault}
                onChange={onChange}
                multiline
                rows={2}
                placeholder={authoredDefault || 'Enter text…'}
            />
        </Box>
    )
}
