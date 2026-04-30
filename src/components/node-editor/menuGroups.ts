import { PROCESSOR_CATALOG } from '../../node-engine/processors'

/**
 * Add-Node menu groups. `category` is the visual accent used by the picker
 * (left-border stripe on the section header and on each item) so the colour
 * the user sees when picking a node matches the colour the node will wear
 * on the canvas — see `components/flow-nodes/categoryColors.ts` for the
 * full palette and how it propagates to node borders + edge tints.
 */
export interface MenuGroup {
    title: string
    /** Category key that drives the group's accent colour. */
    category: string
    items: string[]
}

const RAW_GROUPS: MenuGroup[] = [
    {
        title: 'Inputs',
        category: 'input',
        items: ['image', 'polygon', 'segmentation', 'number', 'sdfTextAtlas', 'textStrip'],
    },
    {
        title: 'Animation · Triggers',
        category: 'animTrigger',
        items: ['tap', 'autoTimer'],
    },
    {
        title: 'Animation · Modulators',
        category: 'animMod',
        items: ['envelope', 'combineSignals'],
    },
    {
        title: 'Animation · Controllers',
        category: 'animCtrl',
        items: ['animationController'],
    },
    {
        title: 'Image Ops',
        category: 'imageOp',
        items: ['blur', 'remap', 'blend', 'denoise', 'sdfFromContour'],
    },
    {
        title: 'Contour',
        category: 'contour',
        items: ['contourResample'],
    },
    {
        title: 'Output',
        category: 'output',
        items: ['effect', 'preview', 'contourPreview'],
    },
    {
        title: 'Utilities',
        category: 'util',
        items: ['config', 'noiseVisualizer', 'log'],
    },
]

export function getMenuGroups(): MenuGroup[] {
    return RAW_GROUPS
        .map(g => ({
            ...g,
            items: g.items.filter(t => {
                const e = PROCESSOR_CATALOG[t]
                return e && !e.def.hidden
            }),
        }))
        .filter(g => g.items.length > 0)
}
