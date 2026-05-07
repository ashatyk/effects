import { Link } from 'react-router-dom'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import IosShareIcon from '@mui/icons-material/IosShare'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import PushPinIcon from '@mui/icons-material/PushPin'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import SpeedIcon from '@mui/icons-material/Speed'

/** Allowed cap values. `0` means "uncapped" (rAF native rate). */
export const FPS_OPTIONS = [0, 5, 10, 15, 30, 60] as const
export type FpsOption = typeof FPS_OPTIONS[number]

interface Props {
    sidebarOpen: boolean
    onToggleSidebar: () => void
    outlineOpen: boolean
    onToggleOutline: () => void
    inspectorOpen: boolean
    onToggleInspector: () => void
    onUndo: () => void
    onRedo: () => void
    onExport: () => void
    onImport: () => void
    onClear: () => void
    onPublish: () => void
    fps: FpsOption
    onFpsChange: (fps: FpsOption) => void
}

export function NodeEditorToolbar({
    sidebarOpen, onToggleSidebar,
    outlineOpen, onToggleOutline,
    inspectorOpen, onToggleInspector,
    onUndo, onRedo,
    onExport, onImport, onClear, onPublish,
    fps, onFpsChange,
}: Props) {
    return (
        <Box
            component="header"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
            }}
        >
            <Button
                component={Link}
                to="/"
                size="small"
                variant="text"
                color="inherit"
                startIcon={<ArrowBackIcon fontSize="small" />}
            >
                Back
            </Button>
            <Divider orientation="vertical" flexItem />
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Node Pipeline
            </Typography>
            <Box sx={{ flex: 1 }} />
            {/* Paper paper styling is intentionally NOT pinned to
                `pn-menu-paper` (which is a light surface used by in-graph
                node selects). The toolbar is dark, so we let the global
                MUI dark theme render the dropdown. */}
            <TextField
                select
                size="small"
                value={String(fps)}
                onChange={e => onFpsChange(Number(e.target.value) as FpsOption)}
                slotProps={{
                    input: {
                        startAdornment: (
                            <SpeedIcon fontSize="small" sx={{ color: 'text.secondary', mr: 0.75 }} />
                        ),
                    },
                }}
                sx={{
                    width: 150,
                    '& .MuiInputBase-root': { fontSize: 12, height: 30 },
                    '& .MuiInputBase-input': { py: 0.5 },
                }}
            >
                {FPS_OPTIONS.map(v => (
                    <MenuItem key={v} value={String(v)}>
                        {v === 0 ? 'max fps' : `${v} fps`}
                    </MenuItem>
                ))}
            </TextField>
            <Tooltip title={outlineOpen ? 'Hide scene outline' : 'Show scene outline'}>
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={onToggleOutline}
                    startIcon={outlineOpen
                        ? <AccountTreeIcon fontSize="small" />
                        : <AccountTreeOutlinedIcon fontSize="small" />}
                >
                    Outline
                </Button>
            </Tooltip>
            <Tooltip title={inspectorOpen ? 'Hide publish inspector' : 'Show publish inspector'}>
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={onToggleInspector}
                    startIcon={inspectorOpen
                        ? <VisibilityIcon fontSize="small" />
                        : <VisibilityOutlinedIcon fontSize="small" />}
                >
                    Inspect
                </Button>
            </Tooltip>
            <Tooltip title={sidebarOpen ? 'Hide pin terminal' : 'Show pin terminal'}>
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={onToggleSidebar}
                    startIcon={sidebarOpen
                        ? <PushPinIcon fontSize="small" />
                        : <PushPinOutlinedIcon fontSize="small" />}
                >
                    Pins
                </Button>
            </Tooltip>
            <Stack direction="row" spacing={0.5}>
                <Tooltip title="Undo (⌘Z)">
                    <Button size="small" variant="text" color="inherit" onClick={onUndo} startIcon={<UndoIcon fontSize="small" />}>
                        Undo
                    </Button>
                </Tooltip>
                <Tooltip title="Redo (⌘⇧Z)">
                    <Button size="small" variant="text" color="inherit" onClick={onRedo} startIcon={<RedoIcon fontSize="small" />}>
                        Redo
                    </Button>
                </Tooltip>
            </Stack>
            <Divider orientation="vertical" flexItem />
            <Stack direction="row" spacing={0.5}>
                <Tooltip title="Derive supplier-facing pipeline + download JSON">
                    <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={onPublish}
                        startIcon={<RocketLaunchIcon fontSize="small" />}
                    >
                        Publish
                    </Button>
                </Tooltip>
                <Button size="small" variant="text" color="inherit" onClick={onExport} startIcon={<IosShareIcon fontSize="small" />}>
                    Export
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={onImport} startIcon={<FileUploadIcon fontSize="small" />}>
                    Import
                </Button>
                <Button size="small" variant="text" color="error" onClick={onClear} startIcon={<DeleteSweepIcon fontSize="small" />}>
                    Clear
                </Button>
            </Stack>
        </Box>
    )
}
