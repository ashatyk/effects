import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'

// Frame is a UI-only markup rectangle; the engine never sees it (see frame-constants.ts).
export type MenuItemSpec =
    | { kind: 'processor'; type: string }
    | { kind: 'frame' }

export interface MenuGroup {
    title: string
    category: string
    items: MenuItemSpec[]
}

// Each item's def.category MUST match its group.category so the picker accent and canvas accent line up.
const proc = (type: string): MenuItemSpec => ({ kind: 'processor', type })

const RAW_GROUPS: MenuGroup[] = [
    {
        title: 'Sources',
        category: 'input',
        items: [proc('image'), proc('number'), proc('constantSignal')],
    },
    {
        title: 'Text',
        category: 'input',
        items: [proc('text'), proc('textStyle'), proc('textStrip')],
    },
    {
        title: 'Image',
        category: 'imageOp',
        items: [proc('blur'), proc('denoise'), proc('remap'), proc('blend')],
    },
    {
        title: 'Geometry',
        category: 'contour',
        items: [proc('segmentation'), proc('contourResample'), proc('contourPivot'), proc('sdfFromContour')],
    },
    {
        title: 'Animation · Triggers',
        category: 'animTrigger',
        items: [proc('eventEmitter'), proc('tapZone'), proc('timer')],
    },
    {
        title: 'Animation · Modulators',
        category: 'animMod',
        items: [proc('envelope'), proc('interpolator'), proc('combineSignals'), proc('signalSwitch')],
    },
    {
        title: 'Animation · Controllers',
        category: 'animCtrl',
        items: [proc('animationController'), proc('animationSwitch')],
    },
    {
        title: 'Render',
        category: 'output',
        items: [proc('effect'), proc('preview'), proc('contourPreview')],
    },
    {
        title: 'Publish',
        category: 'output',
        items: [proc('publishRoot')],
    },
    {
        title: 'Layout',
        category: 'util',
        items: [{ kind: 'frame' }],
    },
    {
        title: 'Utilities',
        category: 'util',
        items: [proc('config'), proc('noiseVisualizer'), proc('log')],
    },
]

export function getMenuGroups(): MenuGroup[] {
    return RAW_GROUPS
        .map(g => ({
            ...g,
            items: g.items.filter(item => {
                if (item.kind === 'frame') return true
                const e = PROCESSOR_CATALOG[item.type]
                return e && !e.def.hidden
            }),
        }))
        .filter(g => g.items.length > 0)
}
