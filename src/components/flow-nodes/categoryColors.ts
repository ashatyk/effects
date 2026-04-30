/**
 * Category accents — drive every visible "type" cue: node border, header
 * pin tint, focus ring on inputs, and the *outgoing* edge colour. The
 * palette is hand-picked to read distinctly against the dark canvas
 * (#141414) and against the light node cards (#ededed).
 *
 * The keys match the menu groups in NodeEditor's `menuGroups`, so a
 * node's tint mirrors the section it was picked from. Legacy keys
 * (source/process/marigold/dnf) remain mapped for backward compatibility
 * with scenes saved before the re-categorisation — old snapshots load
 * with sensible colours instead of the grey fallback.
 *
 * Hue progression for the animation chain (yellow → orange → pink) is
 * intentional: triggers feed modulators feed controllers, and the warm
 * gradient hints at that signal flow at a glance.
 */
export const CATEGORY_COLORS: Record<string, string> = {
    /* Hand-picked for maximum hue separation around the colour wheel.
     * All accents sit on the dark side of the perceived-luminance line
     * (Y'601 < 0.5) so the unified light header title (#f5f5f5 +
     * text-shadow in `styles/node-card.css`) reads cleanly across every
     * category — no per-colour text-color overrides needed. The animation
     * chain still runs a warm gradient (gold → orange → pink) so the eye
     * reads the signal flow as one continuous family. */
    input:       '#22c55e', // hsl 142°  green       — data sources
    animTrigger: '#a16207', // hsl  41°  gold-700    — pulse generators
    animMod:     '#c2410c', // hsl  17°  orange-700  — signal modulators
    animCtrl:    '#ec4899', // hsl 330°  pink        — animation controllers
    imageOp:     '#3b82f6', // hsl 221°  blue        — image processing
    contour:     '#14b8a6', // hsl 173°  teal        — geometry / polygon ops
    output:      '#ef4444', // hsl   0°  red         — terminal sinks
    util:        '#475569', // hsl 215°  slate-600   — auxiliary

    /* Legacy aliases — keep persisted scenes from going grey. The depth /
       AI / marigold processors no longer ship in the catalog, but old
       snapshots may still encode them; map their accents so historic
       scenes don't lose colour cues. */
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
