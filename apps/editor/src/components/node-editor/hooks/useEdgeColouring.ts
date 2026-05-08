import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { categoryColor, FALLBACK_ACCENT } from '../../flow-nodes/categoryColors'
import type { PipelineNodeData } from '../constants'
import type { PageState } from '../sceneResolver'

type PNode = Node<PipelineNodeData>

// Edge stroke = source-category accent + deterministic per-(sourceId, handle) HSL jitter.
// Clones inherit the original's category so cross-page references keep their navigational colour.
export function useEdgeColouring(
    nodes: PNode[],
    edges: Edge[],
    allPages: PageState[],
): Edge[] {
    return useMemo(() => {
        const categoryById = new Map<string, string | undefined>()
        for (const page of allPages) {
            for (const n of page.nodes) {
                if (n.data.cloneOf) continue
                categoryById.set(n.id, PROCESSOR_CATALOG[n.data.processor]?.def.category)
            }
        }
        const cloneOfById = new Map<string, string>()
        for (const n of nodes) {
            if (n.data.cloneOf) cloneOfById.set(n.id, n.data.cloneOf)
        }
        const colorByNode = new Map<string, string>()
        for (const n of nodes) {
            const target = cloneOfById.get(n.id) ?? n.id
            const cat = categoryById.get(target)
                ?? PROCESSOR_CATALOG[n.data?.processor]?.def.category
            colorByNode.set(n.id, categoryColor(cat))
        }
        return edges.map(e => {
            const base = colorByNode.get(e.source) ?? FALLBACK_ACCENT
            // Resolve to origin so cloning a node doesn't restyle its already-drawn edges.
            const tintSource = cloneOfById.get(e.source) ?? e.source
            const stroke = tintForSource(base, tintSource, e.sourceHandle ?? null)
            const existing = (e.style ?? {}) as React.CSSProperties
            return { ...e, style: { ...existing, stroke } }
        })
    }, [edges, nodes, allPages])
}

interface HslA { h: number; s: number; l: number; a: number }

// FNV-1a 32-bit; stable across engines and sessions.
function hashString(s: string): number {
    let h = 2166136261 >>> 0
    for (let i = 0; i < s.length; i++) {
        h = (h ^ s.charCodeAt(i)) >>> 0
        h = Math.imul(h, 16777619) >>> 0
    }
    return h
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v))
}

function rgbToHsl(r: number, g: number, b: number, a: number): HslA {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    let h = 0
    let s = 0
    const d = max - min
    if (d > 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
        else if (max === gn) h = (bn - rn) / d + 2
        else h = (rn - gn) / d + 4
        h *= 60
    }
    return { h, s: s * 100, l: l * 100, a }
}

function parseColorToHsl(color: string): HslA | null {
    const t = color.trim()
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(t)
    if (hex) {
        const v = hex[1]
        let r = 0, g = 0, b = 0, a = 1
        if (v.length === 3) {
            r = parseInt(v[0] + v[0], 16)
            g = parseInt(v[1] + v[1], 16)
            b = parseInt(v[2] + v[2], 16)
        } else {
            r = parseInt(v.slice(0, 2), 16)
            g = parseInt(v.slice(2, 4), 16)
            b = parseInt(v.slice(4, 6), 16)
            if (v.length === 8) a = parseInt(v.slice(6, 8), 16) / 255
        }
        return rgbToHsl(r, g, b, a)
    }
    const rgba = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[ ,]\s*(\d+(?:\.\d+)?)\s*[ ,]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d+(?:\.\d+)?)\s*)?\)$/i.exec(t)
    if (rgba) {
        return rgbToHsl(+rgba[1], +rgba[2], +rgba[3], rgba[4] != null ? +rgba[4] : 1)
    }
    return null
}

function hslToCss({ h, s, l, a }: HslA): string {
    const hh = h.toFixed(1)
    const ss = s.toFixed(1)
    const ll = l.toFixed(1)
    return a >= 1
        ? `hsl(${hh} ${ss}% ${ll}%)`
        : `hsl(${hh} ${ss}% ${ll}% / ${a.toFixed(3)})`
}

// Hue ±10° (smallest inter-category gap is 24°), sat ±8%, lightness ±10%. Three independent
// 10-bit slices of one FNV-1a hash keep the deltas uncorrelated.
function tintForSource(base: string, sourceId: string, sourceHandle: string | null): string {
    const hsl = parseColorToHsl(base)
    if (!hsl) return base
    const seed = hashString(`${sourceId}|${sourceHandle ?? ''}`)
    const r0 = (seed & 0x3ff) / 0x3ff
    const r1 = ((seed >>> 10) & 0x3ff) / 0x3ff
    const r2 = ((seed >>> 20) & 0x3ff) / 0x3ff
    const dh = (r0 * 2 - 1) * 10
    const ds = (r1 * 2 - 1) * 8
    const dl = (r2 * 2 - 1) * 10
    return hslToCss({
        h: ((hsl.h + dh) % 360 + 360) % 360,
        s: clamp(hsl.s + ds, 10, 95),
        l: clamp(hsl.l + dl, 25, 75),
        a: hsl.a,
    })
}
