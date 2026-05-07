import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import {
    PUBLISH_MANIFEST_VERSION,
    type PublishedPipeline,
} from '@effects/runtime'

interface Props {
    onLoaded: (pipeline: PublishedPipeline) => void
}

/**
 * First-screen file picker for `<effectId>.published.json` (the
 * artifact `apps/editor` exports via its toolbar Publish button).
 *
 * Validates against the runtime's `PUBLISH_MANIFEST_VERSION` — any
 * mismatch fails closed (the supplier can't safely interpret a
 * future-shape pipeline). On success, the pipeline goes into
 * App-level state and we navigate to `/supplier`.
 *
 * Drop-zone + classic file input both wire to the same `onFile` path
 * so the UX works on browsers without DnD support.
 */
export function ManifestPickerPage({ onLoaded }: Props) {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)

    const onFile = useCallback(async (file: File) => {
        setError(null)
        try {
            const text = await file.text()
            const parsed = JSON.parse(text) as Partial<PublishedPipeline>
            const v = (parsed as { manifestVersion?: number }).manifestVersion
            if (typeof v !== 'number') {
                setError('Manifest is missing "manifestVersion" — not a valid PublishedPipeline JSON.')
                return
            }
            if (v !== PUBLISH_MANIFEST_VERSION) {
                setError(`Manifest version ${v} is incompatible with this supplier app (expects ${PUBLISH_MANIFEST_VERSION}). Re-publish from the editor.`)
                return
            }
            if (!parsed.id || !parsed.surface || !parsed.graph) {
                setError('Manifest is missing required fields (id / surface / graph).')
                return
            }
            onLoaded(parsed as PublishedPipeline)
            navigate('/supplier')
        } catch (e) {
            setError(`Failed to parse JSON: ${(e as Error).message}`)
        }
    }, [navigate, onLoaded])

    const onPickClick = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (file) onFile(file)
        }
        input.click()
    }, [onFile])

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
    }, [onFile])

    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
                bgcolor: 'background.default',
            }}
        >
            <Box
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                sx={{
                    width: 'min(640px, 100%)',
                    minHeight: 320,
                    border: '2px dashed',
                    borderColor: dragOver ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    bgcolor: dragOver ? 'action.hover' : 'background.paper',
                    transition: 'border-color 120ms, background-color 120ms',
                }}
            >
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
                    Effects · Supplier
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 480 }}>
                    Drop a <code>.published.json</code> file here, or use the picker.
                    The editor exports this from the toolbar Publish button after wiring a
                    <code> publishRoot</code> node.
                </Typography>
                <Button variant="contained" onClick={onPickClick}>
                    Choose manifest
                </Button>
                {error && (
                    <Alert severity="error" sx={{ width: '100%', fontSize: 12 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 2 }}>
                    Manifest schema version: {PUBLISH_MANIFEST_VERSION}
                </Typography>
            </Box>
        </Box>
    )
}
