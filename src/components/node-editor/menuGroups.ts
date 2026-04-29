import { PROCESSOR_CATALOG } from '../../node-engine/processors'

export interface MenuGroup {
    title: string
    items: string[]
}

const RAW_GROUPS: MenuGroup[] = [
    {
        title: 'Inputs',
        items: ['image', 'polygon', 'segmentation', 'number', 'sdfTextAtlas', 'textStrip'],
    },
    {
        title: 'Animation · Triggers',
        items: ['tap', 'autoTimer'],
    },
    {
        title: 'Animation · Modulators',
        items: ['envelope', 'combineSignals'],
    },
    {
        title: 'Animation · Controllers',
        items: ['animationController'],
    },
    {
        title: 'Image Ops',
        items: ['blur', 'remap', 'blend', 'denoise', 'sdfFromContour'],
    },
    {
        title: 'Contour',
        items: ['contourResample'],
    },
    {
        title: 'Depth',
        items: ['depthEstimate', 'depthBlit'],
    },
    {
        title: 'AI / ML',
        items: ['materialEstimate', 'marigoldDepth', 'marigoldNormals'],
    },
    {
        title: 'Output',
        items: ['effect', 'preview', 'contourPreview'],
    },
    {
        title: 'Utilities',
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
