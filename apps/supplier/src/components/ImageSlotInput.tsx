import { useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import type { PublishedImageSlot } from '@effects/runtime'

interface Props {
    slot: PublishedImageSlot
    dataUrl: string | undefined
    onChange: (dataUrl: string) => void
    // Mutually exclusive across all slots; parent owns the radio.
    isBackground: boolean
    onToggleBackground: () => void
}

// Uses base64 dataUrls (not object URLs/blobs) so the whole SupplierConfig
// serialises to a single self-contained JSON for Tier-3 handoff.
// Trade-off: ~4/3 size inflation per image — fine for single-photo
// product effects (<5MB typical).
export function ImageSlotInput({ slot, dataUrl, onChange, isBackground, onToggleBackground }: Props) {
    const inputRef = useRef<HTMLInputElement>(null)

    const onPick = useCallback(() => inputRef.current?.click(), [])
    const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onChange(String(reader.result ?? ''))
        reader.readAsDataURL(file)
        // Reset so picking the same file twice still fires onChange (browsers dedupe by filename).
        e.target.value = ''
    }, [onChange])

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {slot.label}
                </Typography>
                {slot.hint && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                        {slot.hint}
                    </Typography>
                )}
            </Box>
            {dataUrl && (
                <Box
                    sx={{
                        width: '100%',
                        maxHeight: 180,
                        overflow: 'hidden',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: '#0a0a0a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <img
                        src={dataUrl}
                        alt={slot.label}
                        style={{ maxWidth: '100%', maxHeight: 180, display: 'block' }}
                    />
                </Box>
            )}
            <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" onClick={onPick} sx={{ flex: 1 }}>
                    {dataUrl ? 'Replace image' : 'Choose image'}
                </Button>
                <Button
                    variant={isBackground ? 'contained' : 'outlined'}
                    color={isBackground ? 'success' : 'inherit'}
                    size="small"
                    onClick={onToggleBackground}
                    disabled={!dataUrl}
                    sx={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}
                >
                    {isBackground ? 'Background ✓' : 'Use as background'}
                </Button>
            </Stack>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onFile}
            />
        </Box>
    )
}
