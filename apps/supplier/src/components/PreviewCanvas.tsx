import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { DataflowEngine, PublishedPipeline } from '@effects/runtime'
import { streamPublishRootToCanvas } from '@effects/player'

interface Props {
    engine: DataflowEngine
    pipeline: PublishedPipeline
    // Painted behind the canvas via CSS so transparent/outline-only
    // effects can be previewed against the source photo.
    backgroundUrl?: string | null
}

export function PreviewCanvas({ engine, pipeline, backgroundUrl }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const root = pipeline.graph.nodes.find(n => n.data.processor === 'publishRoot')
        const canvas = canvasRef.current
        if (!root || !canvas) return
        return streamPublishRootToCanvas(engine, root.id, canvas)
    }, [engine, pipeline])

    // Background is painted via CSS on the canvas itself (not a sibling
    // <img>): guarantees the bitmap coordinates match the canvas pixel
    // grid 1:1 regardless of wrapper aspect ratio, and transparent
    // engine pixels composite over it naturally.
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
                    // Outline (vs border) doesn't enter the box-model so it
                    // never shifts the canvas inside its objectFit slot.
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
