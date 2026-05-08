/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

// Cached by (contourRef, mode, offsetX, offsetY) reference equality so an
// unchanged upstream contour costs nothing per frame.
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

    lastPivot: [number, number] | null = null
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

// Polygon centroid via signed-area; orientation-agnostic. Falls back to
// vertex mean for degenerate (|A| ≈ 0) input.
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

// Length-weighted edge-midpoint centroid; distinct from areaCentroid: thin bulges
// drag this further along the curve than the area centre.
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
