import { useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import type { PublishedImageSlot } from '@effects/runtime'

interface Props {
    slot: PublishedImageSlot
    /** Currently bound dataUrl, if any. Drives the thumbnail. */
    dataUrl: string | undefined
    onChange: (dataUrl: string) => void
    /** True when this slot's image is currently used as the preview
     *  canvas background. Mutually exclusive across all slots — the
     *  parent radios on `onToggleBackground`. */
    isBackground: boolean
    /** Toggle this slot as the preview background. The parent flips
     *  `backgroundSlotId`; clicking the active slot's button again
     *  clears it. No-op when `dataUrl` is unset (button is disabled). */
    onToggleBackground: () => void
}

/**
 * One supplier-facing image upload slot. The supplier picks a file,
 * we convert it to a base64 dataUrl, and the parent applies the
 * override + persists into SupplierConfig.
 *
 * The dataUrl pattern (vs object URLs / blobs) lets the entire
 * SupplierConfig serialize to a single self-contained JSON for
 * Tier-3 handoff. Trade-off is ~4/3 size inflation per image; for
 * single-photo product effects that's well within JSON's comfort
 * zone (<5MB typical).
 */
export function ImageSlotInput({ slot, dataUrl, onChange, isBackground, onToggleBackground }: Props) {
    const inputRef = useRef<HTMLInputElement>(null)

    const onPick = useCallback(() => inputRef.current?.click(), [])
    const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onChange(String(reader.result ?? ''))
        reader.readAsDataURL(file)
        /* Reset the input so picking the same file twice still
           triggers onChange (browsers dedupe by filename otherwise). */
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
