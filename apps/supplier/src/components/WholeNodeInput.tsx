import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import type { PublishedWholeNode } from '@effects/runtime'

interface Props {
    node: PublishedWholeNode
}

// Fallback for surface.wholeNodes processors without a dedicated widget.
export function WholeNodeInput({ node }: Props) {
    return (
        <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {node.label}
            </Typography>
            {node.hint && (
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.5 }}>
                    {node.hint}
                </Typography>
            )}
            <Alert severity="warning" sx={{ fontSize: 11 }}>
                No supplier widget for processor type "<code>{node.processor}</code>" yet.
                The graph still uses the author's defaults.
            </Alert>
        </Box>
    )
}
