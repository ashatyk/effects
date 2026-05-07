/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

/**
 * Pure CPU node that turns a `ContourSamples` ring into a single 2D
 * "pivot" point in the same pixel space as the contour. Output is a
 * length-2 number array `[x, y]` typed as `VEC`, ready to wire into the
 * Effect node's `pivot` input (which binds it as `uPivot: vec2<f32>`).
 *
 * Modes (six pure functions of the geometry plus a constant offset):
 *   - `aabb`        : centre of axis-aligned bounding box (cheap, robust on
 *                     non-convex shapes; matches Effect's default fallback).
 *   - `vertexMean`  : arithmetic mean of vertex positions. Sensitive to
 *                     local sample density — biases toward dense regions.
 *   - `area`        : true polygon centroid (centre of mass for a uniform-
 *                     density planar lamina). Computed via the standard
 *                     signed-area formula — robust to vertex distribution,
 *                     this is what most people mean by "centre of gravity".
 *                     Falls back to `vertexMean` when the polygon is
 *                     degenerate (signed area ≈ 0).
 *   - `arc`         : centre of mass treating the perimeter as a closed
 *                     wire (each edge contributes its midpoint weighted by
 *                     length). Useful for ribbon-style anchoring where you
 *                     want a "balance point" that ignores interior area.
 *   - `min`         : bottom-left of AABB (`(minX, minY)` in screen coords —
 *                     i.e. small X and Y).
 *   - `max`         : top-right of AABB (`(maxX, maxY)`).
 *
 * `offsetX` / `offsetY` add a constant pixel-space shift to whichever
 * point the mode produced.
 *
 * Cached by `(contourRef, mode, offsetX, offsetY)` reference equality so
 * an unchanged upstream contour costs nothing per frame.
 */
export const contourPivotDef: ProcessorDef = {
    pure: true,
    type: 'contourPivot',
    title: 'Contour Pivot',
    category: 'contour',
    inputs: [{ name: 'contour', type: SLOT.CONTOUR }],
    outputs: [{ name: 'pivot', type: SLOT.VEC }],
    defaultParams: {
        mode: 'area',
        offsetX: 0,
        offsetY: 0,
    },
}

export type PivotMode = 'aabb' | 'vertexMean' | 'area' | 'arc' | 'min' | 'max'

export const PIVOT_MODES: PivotMode[] = ['aabb', 'vertexMean', 'area', 'arc', 'min', 'max']

interface CacheKey {
    contourRef: ContourSamples
    mode: PivotMode
    offsetX: number
    offsetY: number
}

export class ContourPivotProcessor extends BaseProcessor {
    readonly def = contourPivotDef

    /** Last computed pivot — surfaced to the node view's status line so
     *  the user can see the live value without wiring a Log node. */
    lastPivot: [number, number] | null = null
    /** Last input contour — exposed for views that want to draw the pivot
     *  on top of an outline preview. */
    lastContour: ContourSamples | null = null

    private cachedKey: CacheKey | null = null
    private cachedPivot: [number, number] | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const contour = (inputs.contour as ContourSamples | null) ?? null
        this.lastContour = contour
        if (!contour || contour.count < 1) {
            this.lastPivot = null
            this.cachedKey = null
            this.cachedPivot = null
            return { pivot: null }
        }

        const mode = normaliseMode(params.mode)
        const offsetX = numberParam(params.offsetX, 0)
        const offsetY = numberParam(params.offsetY, 0)

        const key: CacheKey = { contourRef: contour, mode, offsetX, offsetY }
        if (this.cachedKey && sameKey(this.cachedKey, key) && this.cachedPivot) {
            this.lastPivot = this.cachedPivot
            return { pivot: this.cachedPivot }
        }

        const base = computePivot(contour, mode)
        const pivot: [number, number] = [base[0] + offsetX, base[1] + offsetY]
        this.cachedKey = key
        this.cachedPivot = pivot
        this.lastPivot = pivot
        return { pivot }
    }
}

/* ───────── helpers ───────── */

function normaliseMode(v: unknown): PivotMode {
    return (PIVOT_MODES as string[]).includes(v as string) ? (v as PivotMode) : 'area'
}

function numberParam(v: unknown, fallback: number): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

function sameKey(a: CacheKey, b: CacheKey): boolean {
    return a.contourRef === b.contourRef
        && a.mode === b.mode
        && a.offsetX === b.offsetX
        && a.offsetY === b.offsetY
}

/* ───────── pivot math ───────── */

function computePivot(c: ContourSamples, mode: PivotMode): [number, number] {
    switch (mode) {
        case 'aabb':       return aabbCentre(c)
        case 'vertexMean': return vertexMean(c)
        case 'area':       return areaCentroid(c)
        case 'arc':        return arcCentroid(c)
        case 'min':        return [c.aabb[0], c.aabb[1]]
        case 'max':        return [c.aabb[2], c.aabb[3]]
    }
}

function aabbCentre(c: ContourSamples): [number, number] {
    const [minX, minY, maxX, maxY] = c.aabb
    return [(minX + maxX) * 0.5, (minY + maxY) * 0.5]
}

function vertexMean(c: ContourSamples): [number, number] {
    const N = c.count
    let sx = 0, sy = 0
    for (let i = 0; i < N; i++) {
        sx += c.positions[i * 2]
        sy += c.positions[i * 2 + 1]
    }
    return [sx / N, sy / N]
}

/**
 * Standard polygon centroid (centre of mass for a uniform-density planar
 * lamina) for a closed ring. Implements
 *   Cx = (1 / 6A) Σ (x_i + x_{i+1}) (x_i y_{i+1} − x_{i+1} y_i)
 *   Cy = (1 / 6A) Σ (y_i + y_{i+1}) (x_i y_{i+1} − x_{i+1} y_i)
 * with the closing edge included (i.e. the (N-1, 0) wrap). Works for any
 * orientation since A and the numerator carry the same sign.
 *
 * Falls back to the vertex mean when |A| is too small to be numerically
 * meaningful (degenerate / collinear input).
 */
function areaCentroid(c: ContourSamples): [number, number] {
    const N = c.count
    let area2 = 0
    let cx = 0
    let cy = 0
    for (let i = 0; i < N; i++) {
        const j = (i + 1) % N
        const xi = c.positions[i * 2]
        const yi = c.positions[i * 2 + 1]
        const xj = c.positions[j * 2]
        const yj = c.positions[j * 2 + 1]
        const cross = xi * yj - xj * yi
        area2 += cross
        cx += (xi + xj) * cross
        cy += (yi + yj) * cross
    }
    const area = area2 * 0.5
    if (Math.abs(area) < 1e-6) return vertexMean(c)
    const k = 1 / (6 * area)
    return [cx * k, cy * k]
}

/**
 * Centre of mass treating the perimeter as a closed wire of uniform
 * density: each edge contributes its midpoint weighted by edge length.
 * Distinct from `areaCentroid` — for example, a thin elongated bulge
 * shifts an arc centroid further along the curve than an area centroid,
 * because the bulge contributes lots of perimeter but little extra area.
 */
function arcCentroid(c: ContourSamples): [number, number] {
    const N = c.count
    let totalLen = 0
    let cx = 0
    let cy = 0
    for (let i = 0; i < N; i++) {
        const j = (i + 1) % N
        const xi = c.positions[i * 2]
        const yi = c.positions[i * 2 + 1]
        const xj = c.positions[j * 2]
        const yj = c.positions[j * 2 + 1]
        const dx = xj - xi
        const dy = yj - yi
        const len = Math.hypot(dx, dy)
        if (len <= 1e-9) continue
        const mx = (xi + xj) * 0.5
        const my = (yi + yj) * 0.5
        cx += mx * len
        cy += my * len
        totalLen += len
    }
    if (totalLen <= 1e-6) return vertexMean(c)
    return [cx / totalLen, cy / totalLen]
}
