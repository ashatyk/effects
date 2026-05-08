import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { categoryColor } from '../flow-nodes/categoryColors'
import type { MenuGroup, MenuItemSpec } from './menuGroups'

// Popover emits processor/frame; clone is created via outline drag-and-drop but kept in the union
// so NodeEditor.onAddFromPopover doesn't need a special-case shape for restored/programmatic callers.
export type AddNodeAction =
    | { kind: 'processor'; type: string }
    | { kind: 'clone'; originId: string }
    | { kind: 'frame' }

interface Props {
    open: boolean
    anchorPosition: { top: number; left: number } | undefined
    onClose: () => void
    groups: MenuGroup[]
    onAdd: (action: AddNodeAction) => void
}

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
                                {group.items.map(item => {
                                    const view = describeItem(item)
                                    return (
                                        <MenuItem
                                            key={view.key}
                                            onClick={() => onAdd(view.action)}
                                            sx={{
                                                fontSize: 12,
                                                py: 0.5,
                                                pl: 1.25,
                                                borderLeft: '3px solid',
                                                borderLeftColor: view.accent,
                                                transition: 'none',
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                },
                                            }}
                                        >
                                            {view.title}
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

interface ItemView {
    key: string
    title: string
    accent: string
    action: AddNodeAction
}

function describeItem(item: MenuItemSpec): ItemView {
    if (item.kind === 'frame') {
        return {
            key: 'frame',
            title: 'Frame',
            accent: categoryColor('util'),
            action: { kind: 'frame' },
        }
    }
    const def = PROCESSOR_CATALOG[item.type].def
    return {
        key: item.type,
        title: def.title,
        accent: categoryColor(def.category),
        action: { kind: 'processor', type: item.type },
    }
}
