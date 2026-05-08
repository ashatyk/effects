import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import {
    BAKE_MANIFEST_VERSION,
    PUBLISH_MANIFEST_VERSION,
    type BakedPipeline,
    type PublishedPipeline,
} from '@effects/runtime'
import {
    parseBaked,
    parseConfig,
    type SupplierConfig,
} from '@effects/player'

interface Props {
    onLoadedPipeline: (pipeline: PublishedPipeline, config: SupplierConfig | null) => void
    onLoadedBaked: (baked: BakedPipeline) => void
}

interface PickedPipeline { name: string; pipeline: PublishedPipeline }
interface PickedConfig { name: string; config: SupplierConfig }
interface PickedBaked { name: string; baked: BakedPipeline }

// Auto-detects three file shapes:
//   .baked.json (bakeManifestVersion) → baked mode (mutually exclusive).
//   .published.json (manifestVersion) → pipeline slot.
//   .config.json (pipelineId)         → config slot, requires pipeline.
export function ManifestPickerPage({ onLoadedPipeline, onLoadedBaked }: Props) {
    const navigate = useNavigate()
    const [pickedBaked, setPickedBaked] = useState<PickedBaked | null>(null)
    const [pickedPipeline, setPickedPipeline] = useState<PickedPipeline | null>(null)
    const [pickedConfig, setPickedConfig] = useState<PickedConfig | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)

    const ingest = useCallback(async (file: File) => {
        setError(null)
        const text = await file.text()
        let parsed: unknown
        try { parsed = JSON.parse(text) } catch (e) {
            setError(`Failed to parse JSON: ${(e as Error).message}`)
            return
        }
        if (!parsed || typeof parsed !== 'object') {
            setError('Top-level value must be an object.')
            return
        }
        const j = parsed as Record<string, unknown>

        // Detection priority (most specific first):
        //   bakeManifestVersion → baked
        //   surface + graph + manifestVersion → pipeline
        //   pipelineId → config (requires a pipeline already loaded)
        if (typeof j.bakeManifestVersion === 'number') {
            const result = parseBaked(text)
            if (!result.ok) { setError(result.error); return }
            // Baked mode is mutually exclusive with pipeline+config.
            setPickedPipeline(null)
            setPickedConfig(null)
            setPickedBaked({ name: file.name, baked: result.baked })
            return
        }

        if (typeof j.manifestVersion === 'number' && j.surface && j.graph) {
            if (j.manifestVersion !== PUBLISH_MANIFEST_VERSION) {
                setError(`Manifest version ${j.manifestVersion} is incompatible with this player (expects ${PUBLISH_MANIFEST_VERSION}).`)
                return
            }
            if (!j.id) { setError('Manifest is missing required "id" field.'); return }
            setPickedBaked(null)
            const next = { name: file.name, pipeline: j as unknown as PublishedPipeline }
            setPickedPipeline(next)
            // Drop any pre-picked config that doesn't match the new pipeline.
            if (pickedConfig && pickedConfig.config.pipelineId !== next.pipeline.id) {
                setPickedConfig(null)
            }
            return
        }

        if (typeof j.pipelineId === 'string') {
            if (!pickedPipeline) {
                setError('Load a pipeline manifest first — the config is validated against it.')
                return
            }
            const result = parseConfig(text, pickedPipeline.pipeline)
            if (!result.ok) { setError(result.error); return }
            setPickedConfig({ name: file.name, config: result.config })
            return
        }

        setError('Could not detect the file type — expected .baked.json, .published.json, or .config.json.')
    }, [pickedConfig, pickedPipeline])

    const filePicker = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (file) void ingest(file)
        }
        input.click()
    }, [ingest])

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void ingest(file)
    }, [ingest])

    const onRender = useCallback(() => {
        if (pickedBaked) {
            onLoadedBaked(pickedBaked.baked)
            navigate('/player')
            return
        }
        if (pickedPipeline) {
            onLoadedPipeline(pickedPipeline.pipeline, pickedConfig?.config ?? null)
            navigate('/player')
            return
        }
    }, [pickedBaked, pickedPipeline, pickedConfig, onLoadedBaked, onLoadedPipeline, navigate])

    const renderEnabled = !!pickedBaked || !!pickedPipeline
    const renderLabel = pickedBaked
        ? 'Render baked'
        : pickedConfig
            ? 'Render with config'
            : 'Render with defaults'

    return (
        <Box sx={{
            height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            p: 4, bgcolor: 'background.default',
        }}>
            <Box
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                sx={{
                    width: 'min(640px, 100%)',
                    minHeight: 380,
                    border: '2px dashed',
                    borderColor: dragOver ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 4,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 2,
                    bgcolor: dragOver ? 'action.hover' : 'background.paper',
                    transition: 'border-color 120ms, background-color 120ms',
                }}
            >
                <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
                    Effects · Player
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 480 }}>
                    Drop a <code>.baked.json</code> (production AOT artifact) — or a
                    <code> .published.json</code> plus optional <code>.config.json</code>
                    {' '}for a supplier-style live preview. The picker auto-detects.
                </Typography>

                <Stack direction="column" spacing={1.5} sx={{ width: '100%', mt: 1 }}>
                    <SlotRow
                        label="Baked artifact (production)"
                        filename={pickedBaked?.name}
                        accent="warning"
                        onChoose={filePicker}
                        onClear={pickedBaked ? () => setPickedBaked(null) : undefined}
                    />
                    <Box sx={{ textAlign: 'center', color: 'text.disabled', fontSize: 11, py: 0.5 }}>
                        — or —
                    </Box>
                    <SlotRow
                        label="Pipeline manifest"
                        filename={pickedPipeline?.name}
                        accent="primary"
                        disabled={!!pickedBaked}
                        onChoose={filePicker}
                        onClear={pickedPipeline ? () => { setPickedPipeline(null); setPickedConfig(null) } : undefined}
                    />
                    <SlotRow
                        label="Supplier config (optional)"
                        filename={pickedConfig?.name}
                        accent="primary"
                        disabled={!pickedPipeline || !!pickedBaked}
                        onChoose={filePicker}
                        onClear={pickedConfig ? () => setPickedConfig(null) : undefined}
                    />
                </Stack>

                <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    disabled={!renderEnabled}
                    onClick={onRender}
                    sx={{ mt: 1, fontWeight: 700, letterSpacing: 0.5 }}
                >
                    {renderLabel}
                </Button>

                {error && (
                    <Alert severity="error" sx={{ width: '100%', fontSize: 12 }} onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 2 }}>
                    Manifest schema {PUBLISH_MANIFEST_VERSION} · Bake schema {BAKE_MANIFEST_VERSION}
                </Typography>
            </Box>
        </Box>
    )
}

interface SlotRowProps {
    label: string
    filename?: string
    accent: 'primary' | 'warning'
    disabled?: boolean
    onChoose: () => void
    onClear?: () => void
}

function SlotRow({ label, filename, accent, disabled, onChoose, onClear }: SlotRowProps) {
    const accentColor = accent === 'warning' ? 'warning.main' : 'success.main'
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.25,
            border: '1px solid',
            borderColor: filename ? accentColor : 'divider',
            borderRadius: 1,
            bgcolor: 'background.default',
            opacity: disabled ? 0.5 : 1,
        }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {label}
                </Typography>
                <Typography variant="caption" sx={{
                    color: filename ? accentColor : 'text.disabled',
                    fontFamily: 'monospace',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {filename ?? 'no file'}
                </Typography>
            </Box>
            {onClear && (
                <Button size="small" variant="text" onClick={onClear} sx={{ minWidth: 56 }}>
                    Clear
                </Button>
            )}
            <Button
                size="small"
                variant="outlined"
                disabled={disabled}
                onClick={onChoose}
                sx={{ minWidth: 88 }}
            >
                {filename ? 'Replace' : 'Choose'}
            </Button>
        </Box>
    )
}
