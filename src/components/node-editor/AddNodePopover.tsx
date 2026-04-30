import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import { PROCESSOR_CATALOG } from '../../node-engine/processors'
import { categoryColor } from '../flow-nodes/categoryColors'
import type { MenuGroup } from './menuGroups'

interface Props {
    open: boolean
    anchorPosition: { top: number; left: number } | undefined
    onClose: () => void
    groups: MenuGroup[]
    onAdd: (processorType: string) => void
}

/**
 * Add-Node picker. Displayed at the cursor when the user double-clicks the
 * canvas. Each menu group carries the same category accent the node will
 * wear once placed (header tint, edge colour) — colouring the section
 * header and each item with that accent makes navigation in a long flat
 * list noticeably faster.
 *
 * The MUI Grow transition is disabled (`transitionDuration={0}`); the
 * popover snaps in/out instead of fading, which feels closer to a native
 * context menu and avoids the brief blank frame that bothers
 * keyboard-driven workflows.
 */
export function AddNodePopover({ open, anchorPosition, onClose, groups, onAdd }: Props) {
    return (
        <Popover
            open={open}
            anchorReference="anchorPosition"
            anchorPosition={anchorPosition}
            onClose={onClose}
            transitionDuration={0}
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
                {groups.map(group => {
                    const accent = categoryColor(group.category)
                    return (
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
                                    px: 1.25,
                                    pt: 0.5,
                                    pb: 0.5,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: 'text.disabled',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.8,
                                    borderLeft: '3px solid',
                                    borderLeftColor: accent,
                                    borderBottom: 1,
                                    borderBottomColor: 'divider',
                                    mb: 0.25,
                                }}
                            >
                                {group.title}
                            </Typography>
                            <MenuList dense disablePadding>
                                {group.items.map(t => {
                                    const def = PROCESSOR_CATALOG[t].def
                                    const itemAccent = categoryColor(def.category)
                                    return (
                                        <MenuItem
                                            key={t}
                                            onClick={() => onAdd(t)}
                                            sx={{
                                                fontSize: 12,
                                                py: 0.5,
                                                pl: 1.25,
                                                borderLeft: '3px solid',
                                                borderLeftColor: itemAccent,
                                                transition: 'none',
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                },
                                            }}
                                        >
                                            {def.title}
                                        </MenuItem>
                                    )
                                })}
                            </MenuList>
                        </Box>
                    )
                })}
            </Box>
        </Popover>
    )
}
