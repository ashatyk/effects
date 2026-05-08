import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import IosShareIcon from '@mui/icons-material/IosShare'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import SpeedIcon from '@mui/icons-material/Speed'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VisibilityIcon from '@mui/icons-material/Visibility'

// 0 = uncapped (rAF native rate).
export const FPS_OPTIONS = [0, 5, 10, 15, 30, 60] as const
export type FpsOption = typeof FPS_OPTIONS[number]

interface Props {
    onExport: () => void
    onImport: () => void
    onPublish: () => void
    fps: FpsOption
    onFpsChange: (fps: FpsOption) => void
}

// Undo/Redo and Clear are keyboard-only (see useNodeEditorShortcuts); Clear is intentionally
// not in the toolbar to avoid an irreversible-wipe footgun.
export function NodeEditorToolbar({
    onExport, onImport, onPublish,
    fps, onFpsChange,
}: Props) {
    const fileBtnRef = useRef<HTMLButtonElement | null>(null)
    const [fileOpen, setFileOpen] = useState(false)
    const closeFileMenu = useCallback(() => setFileOpen(false), [])
    const runFileAction = useCallback((action: () => void) => () => {
        setFileOpen(false)
        action()
    }, [])

    const fpsBtnRef = useRef<HTMLButtonElement | null>(null)
    const [fpsOpen, setFpsOpen] = useState(false)
    const closeFpsMenu = useCallback(() => setFpsOpen(false), [])
    const runFpsAction = useCallback((v: FpsOption) => () => {
        setFpsOpen(false)
        onFpsChange(v)
    }, [onFpsChange])

    const navigate = useNavigate()
    const onOpenBakedPreview = useCallback(() => navigate('/baked'), [navigate])

    return (
        <Box
            component="header"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 0,
                height: 56,
                minHeight: 56,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
            }}
        >
            <Typography
                component="span"
                sx={{
                    color: 'text.primary',
                    fontFamily: '"Anybody Variable", "Anybody", sans-serif',
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    fontSize: 20,
                    lineHeight: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                }}
            >
                Shadyberry Studio
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5 }}>
                <Button
                    ref={fpsBtnRef}
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => setFpsOpen(o => !o)}
                    startIcon={<SpeedIcon fontSize="small" />}
                    endIcon={<ExpandMoreIcon fontSize="small" />}
                >
                    {fps === 0 ? 'max fps' : `${fps} fps`}
                </Button>
                <Menu
                    anchorEl={fpsBtnRef.current}
                    open={fpsOpen}
                    onClose={closeFpsMenu}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{ paper: { sx: COMPACT_MENU_PAPER_SX } }}
                >
                    {FPS_OPTIONS.map(v => (
                        <MenuItem key={v} selected={v === fps} onClick={runFpsAction(v)}>
                            <ListItemText primary={v === 0 ? 'max fps' : `${v} fps`} />
                        </MenuItem>
                    ))}
                </Menu>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
                <Button
                    ref={fileBtnRef}
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={() => setFileOpen(o => !o)}
                    endIcon={<ExpandMoreIcon fontSize="small" />}
                >
                    File
                </Button>
                <Menu
                    anchorEl={fileBtnRef.current}
                    open={fileOpen}
                    onClose={closeFileMenu}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{ paper: { sx: COMPACT_MENU_PAPER_SX } }}
                >
                    <MenuItem onClick={runFileAction(onPublish)}>
                        <ListItemIcon><RocketLaunchIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="Publish" />
                    </MenuItem>
                    <MenuItem onClick={runFileAction(onExport)}>
                        <ListItemIcon><IosShareIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="Export" />
                    </MenuItem>
                    <MenuItem onClick={runFileAction(onImport)}>
                        <ListItemIcon><FileUploadIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="Import" />
                    </MenuItem>
                    <Divider />
                    <MenuItem onClick={runFileAction(onOpenBakedPreview)}>
                        <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary="View baked" />
                    </MenuItem>
                </Menu>
            </Box>
        </Box>
    )
}

const COMPACT_MENU_PAPER_SX = {
    minWidth: 180,
    '& .MuiMenuItem-root': {
        fontSize: 13,
        minHeight: 32,
        py: 0.75,
    },
    '& .MuiListItemIcon-root': {
        minWidth: 28,
        color: 'text.secondary',
    },
    '& .MuiListItemText-primary': {
        fontSize: 13,
        fontWeight: 500,
    },
} as const
