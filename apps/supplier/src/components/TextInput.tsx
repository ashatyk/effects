import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { TextFieldRow } from '@effects/ui'
import type { DataflowEngine, PublishedWholeNode } from '@effects/runtime'

interface Props {
    engine: DataflowEngine
    node: PublishedWholeNode
    /** Persisted override (if any). When undefined we fall through to
     *  the engine's authored default — the supplier sees the original
     *  copy until they edit. */
    value: string | undefined
    onChange: (value: string) => void
}

/**
 * Whole-node widget for `text` processor. Reads the authored default
 * out of the running engine on mount (so the textarea seeds with what
 * the preview is actually showing), then becomes a controlled input
 * driven by the supplier's override.
 *
 * Multiline because text-strip handles arbitrary copy lengths and the
 * canonical use-case is short marketing strings — but designers may
 * paste multi-word phrases and we don't want to truncate visually.
 */
export function TextInput({ engine, node, value, onChange }: Props) {
    /* Pull the authored default once for the placeholder. We don't
       echo it as the actual value — that would mask the override
       state. The placeholder makes it obvious what the supplier is
       overriding without forcing them to retype the default. */
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
