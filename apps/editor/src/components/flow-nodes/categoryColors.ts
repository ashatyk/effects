// Drives every type cue (border, pin tint, edge colour). All accents have Y'601 < 0.5 so the
// unified light header title reads cleanly across every category. Animation chain runs a warm
// gradient (gold → orange → pink) so the eye reads the signal flow as one family.
export const CATEGORY_COLORS: Record<string, string> = {
    input:       '#22c55e', // hsl 142°  green       — data sources
    animTrigger: '#a16207', // hsl  41°  gold-700    — event / time generators
    animMod:     '#c2410c', // hsl  17°  orange-700  — signal modulators
    animCtrl:    '#ec4899', // hsl 330°  pink        — animation controllers
    imageOp:     '#3b82f6', // hsl 221°  blue        — image processing
    contour:     '#14b8a6', // hsl 173°  teal        — geometry / polygon ops
    output:      '#ef4444', // hsl   0°  red         — terminal sinks
    util:        '#475569', // hsl 215°  slate-600   — auxiliary

    // Legacy aliases — keep persisted scenes from going grey for retired processors.
    depth:    '#0ea5e9',
    ai:       '#a855f7',
    source:   '#22c55e',
    process:  '#3b82f6',
    marigold: '#a855f7',
    dnf:      '#a855f7',
}

export const FALLBACK_ACCENT = 'rgba(255, 255, 255, 0.45)'

export function categoryColor(category: string | undefined): string {
    if (!category) return FALLBACK_ACCENT
    return CATEGORY_COLORS[category] ?? FALLBACK_ACCENT
}
