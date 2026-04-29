import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import { PROCESSOR_CATALOG } from '../../node-engine/processors'
import type { MenuGroup } from './menuGroups'

interface Props {
    open: boolean
    anchorPosition: { top: number; left: number } | undefined
    onClose: () => void
    groups: MenuGroup[]
    onAdd: (processorType: string) => void
}

export function AddNodePopover({ open, anchorPosition, onClose, groups, onAdd }: Props) {
    return (
        <Popover
            open={open}
            anchorReference="anchorPosition"
            anchorPosition={anchorPosition}
            onClose={onClose}
            slotProps={{
                paper: {
                    sx: {
                        bgcolor: 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        maxHeight: '80vh',
                    },
                },
            }}
        >
            <Box
                sx={{
                    columnCount: 2,
                    columnGap: '12px',
                    p: 1,
                    width: 460,
                }}
            >
                {groups.map(group => (
                    <Box
                        key={group.title}
                        sx={{
                            breakInside: 'avoid',
                            pageBreakInside: 'avoid',
                            display: 'inline-block',
                            width: '100%',
                            mb: 1,
                        }}
                    >
                        <Typography
                            component="div"
                            sx={{
                                px: 1.5,
                                pt: 0.5,
                                pb: 0.5,
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'text.disabled',
                                textTransform: 'uppercase',
                                letterSpacing: 0.8,
                                borderBottom: 1,
                                borderColor: 'divider',
                                mb: 0.25,
                            }}
                        >
                            {group.title}
                        </Typography>
                        <MenuList dense disablePadding>
                            {group.items.map(t => (
                                <MenuItem
                                    key={t}
                                    onClick={() => onAdd(t)}
                                    sx={{ fontSize: 12, py: 0.5, pl: 1.5 }}
                                >
                                    {PROCESSOR_CATALOG[t].def.title}
                                </MenuItem>
                            ))}
                        </MenuList>
                    </Box>
                ))}
            </Box>
        </Popover>
    )
}
