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

/* Group ordering and membership are deliberately driven by what each node
 * *does*, not by the slot type it produces. Three concrete consequences:
 *
 *   1. Pure "constant / loaded" sources (Image, Number, Constant Signal)
 *      sit alone in `Sources`. Anything that *processes* something to make
 *      its output (Segmentation chews a TEXTURE, Text Strip rasterises
 *      Text + Style) lives in its own pipeline group.
 *   2. Geometry is one cohesive section spanning the whole CONTOUR
 *      pipeline — Segmentation produces a contour, Contour Resample
 *      smooths/redistributes it, SDF From Contour bakes it into a SDF
 *      texture. Used to be split between Inputs / Image Ops / Contour.
 *   3. The text-composition triad (Text + Text Style → Text Strip) gets
 *      its own section so the user can wire the chain top-to-bottom
 *      without scanning the rest of Inputs.
 *
 * Every item's `def.category` matches its group's `category` so the
 * picker accent stripe and the canvas card accent are identical — no
 * visual mismatch between "picked from this colour" and "now this
 * colour". The two recent re-categorisations (segmentation and
 * sdfFromContour to `contour`) close the previous mismatches.
 */
const RAW_GROUPS: MenuGroup[] = [
    {
        title: 'Sources',
        category: 'input',
        items: ['image', 'number', 'constantSignal'],
    },
    {
        title: 'Text',
        category: 'input',
        items: ['text', 'textStyle', 'textStrip'],
    },
    {
        title: 'Image',
        category: 'imageOp',
        items: ['blur', 'denoise', 'remap', 'blend'],
    },
    {
        title: 'Geometry',
        category: 'contour',
        items: ['segmentation', 'contourResample', 'sdfFromContour'],
    },
    {
        title: 'Animation · Triggers',
        category: 'animTrigger',
        items: ['eventEmitter', 'timer'],
    },
    {
        title: 'Animation · Modulators',
        category: 'animMod',
        items: ['envelope', 'interpolator', 'combineSignals', 'signalSwitch'],
    },
    {
        title: 'Animation · Controllers',
        category: 'animCtrl',
        items: ['animationController', 'animationSwitch'],
    },
    {
        title: 'Render',
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
