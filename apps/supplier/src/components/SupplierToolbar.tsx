import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import IosShareIcon from '@mui/icons-material/IosShare'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import type { PublishedPipeline } from '@effects/runtime'

interface Props {
    pipeline: PublishedPipeline
    onBack: () => void
    onExport: () => void
    onExportBaked: () => void
    onImport: () => void
    onReset: () => void
}

export function SupplierToolbar({ pipeline, onBack, onExport, onExportBaked, onImport, onReset }: Props) {
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
            <Tooltip title="Pick a different manifest">
                <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    onClick={onBack}
                    startIcon={<ArrowBackIcon fontSize="small" />}
                >
                    Back
                </Button>
            </Tooltip>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {pipeline.name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                    {pipeline.id} · v{pipeline.version} · manifest {pipeline.manifestVersion}
                </Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" spacing={0.5}>
                <Tooltip title="Restore manifest defaults">
                    <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={onReset}
                        startIcon={<RestartAltIcon fontSize="small" />}
                    >
                        Reset
                    </Button>
                </Tooltip>
                <Tooltip title="Load a previously exported .config.json">
                    <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={onImport}
                        startIcon={<FileUploadIcon fontSize="small" />}
                    >
                        Import
                    </Button>
                </Tooltip>
                <Tooltip title="Download the current SupplierConfig as JSON (raw — keeps the full graph; needs the original .published.json to render)">
                    <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={onExport}
                        startIcon={<IosShareIcon fontSize="small" />}
                    >
                        Export config
                    </Button>
                </Tooltip>
                <Tooltip title="Bake static subgraphs and download a self-contained .baked.json — the AOT artifact for Tier-3 marketplace surfaces (no SAM, smaller graph, single file)">
                    <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        onClick={onExportBaked}
                        startIcon={<LocalFireDepartmentIcon fontSize="small" />}
                    >
                        Export baked
                    </Button>
                </Tooltip>
            </Stack>
        </Box>
    )
}
