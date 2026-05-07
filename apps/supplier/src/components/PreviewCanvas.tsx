import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { DataflowEngine, PublishedPipeline } from '@effects/runtime'
import { streamPublishRootToCanvas } from '@effects/player'

interface Props {
    engine: DataflowEngine
    pipeline: PublishedPipeline
    /** Optional dataUrl rendered behind the canvas. Used by the
     *  "Use as background" toggle on image slots so the supplier can
     *  preview an effect that produces transparent / outline-only
     *  output against the source photo (or any uploaded image). */
    backgroundUrl?: string | null
}

/**
 * Live preview of the publishRoot's output texture. Subscribes to
 * the engine and copies pixels into a Canvas2D — same throttled
 * extract pattern as the editor's PreviewProcessor.
 *
 * The canvas auto-sizes to the published frame; the wrapping Box
 * sets a max-height so a 1200-px-tall effect doesn't blow out the
 * viewport. Aspect ratio is preserved via `objectFit: contain`.
 */
export function PreviewCanvas({ engine, pipeline, backgroundUrl }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const root = pipeline.graph.nodes.find(n => n.data.processor === 'publishRoot')
        const canvas = canvasRef.current
        if (!root || !canvas) return
        return streamPublishRootToCanvas(engine, root.id, canvas)
    }, [engine, pipeline])

    /* Background is painted via CSS on the same <canvas> element, NOT
       a sibling <img>. Reason: the canvas autosizes to the published
       frame dimensions and uses `objectFit: contain` to fit the
       wrapper; piping the background through CSS guarantees the bitmap
       coordinates match the canvas pixel grid 1:1, regardless of the
       wrapper's aspect ratio. Transparent pixels in the engine output
       composite over the bg naturally — no z-index gymnastics. */
    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                bgcolor: '#0a0a0a',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                position: 'relative',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    imageRendering: 'auto',
                    /* 1px frame on the canvas itself so the user can see
                       the publishRoot frame boundary, not just the dark
                       wrapper around it. Outline (vs border) doesn't
                       enter the box-model and never shifts the canvas
                       inside its `objectFit: contain` slot. */
                    outline: '1px solid #2a2a2a',
                    outlineOffset: 0,
                    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                }}
            />
            <Typography
                variant="caption"
                sx={{
                    position: 'absolute',
                    bottom: 6,
                    right: 8,
                    color: 'text.disabled',
                    fontSize: 9,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                }}
            >
                live preview · {pipeline.id}
            </Typography>
        </Box>
    )
}
