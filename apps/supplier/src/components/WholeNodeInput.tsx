import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import type { PublishedWholeNode } from '@effects/runtime'

interface Props {
    node: PublishedWholeNode
}

/**
 * Generic fallback for `surface.wholeNodes` entries that aren't
 * Image (handled by ImageSlotInput) and aren't Segmentation (handled
 * by SegmentationInput). In v1 this should rarely render — the
 * editor's exposable processors today are Image / Segmentation /
 * tap zones. Future processors with `mode='whole'` exposure get a
 * loud "wire me up" message until a dedicated widget exists.
 */
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
