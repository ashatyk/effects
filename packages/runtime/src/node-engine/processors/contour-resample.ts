/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type ContourSamples } from '../types'

export const contourResampleDef: ProcessorDef = {
    pure: true,
    type: 'contourResample',
    title: 'Contour Resample',
    category: 'contour',
    inputs: [{ name: 'contour', type: SLOT.CONTOUR }],
    outputs: [
        { name: 'contour', type: SLOT.CONTOUR },
    ],
    defaultParams: {
        smoothMethod: 'chaikin+laplacian',
        chaikinIters: 2,
        laplacianIters: 4,
        laplacianLambda: 0.5,
        sampleCount: 256,
        offsetPx: 0,
        forceOrientation: 'auto',
        adaptive: false,
        adaptiveStrength: 0.5,
    },
}

type SmoothMethod = 'none' | 'chaikin' | 'laplacian' | 'chaikin+laplacian'
type Orientation = 'auto' | 'cw' | 'ccw'

interface CacheKey {
    contourRef: ContourSamples
    smoothMethod: SmoothMethod
    chaikinIters: number
    laplacianIters: number
    laplacianLambda: number
    sampleCount: number
    offsetPx: number
    forceOrientation: Orientation
    adaptive: boolean
    adaptiveStrength: number
}

export class ContourResampleProcessor extends BaseProcessor {
    readonly def = contourResampleDef

    private cachedKey: CacheKey | null = null
    private cachedContour: ContourSamples | null = null

    execute(inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const inContour = inputs.contour as ContourSamples | null
        if (!inContour || inContour.count < 3) {
            return { contour: null }
        }

        const key: CacheKey = {
            contourRef: inContour,
            smoothMethod: (params.smoothMethod ?? 'chaikin+laplacian') as SmoothMethod,
            chaikinIters: clamp(intParam(params.chaikinIters, 2), 0, 4),
            laplacianIters: clamp(intParam(params.laplacianIters, 4), 0, 16),
            laplacianLambda: clamp(numberParam(params.laplacianLambda, 0.5), 0, 1),
            sampleCount: clamp(intParam(params.sampleCount, 256), 8, 2048),
            offsetPx: numberParam(params.offsetPx, 0),
            forceOrientation: (params.forceOrientation ?? 'auto') as Orientation,
            adaptive: Boolean(params.adaptive ?? false),
            adaptiveStrength: clamp(numberParam(params.adaptiveStrength, 0.5), 0, 1),
        }

        if (!this.cachedKey || !sameKey(this.cachedKey, key)) {
            this.cachedContour = buildContour(inContour, key)
            this.cachedKey = key
        }

        return { contour: this.cachedContour }
    }
}

function intParam(v: unknown, fallback: number): number {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n) : fallback
}

function numberParam(v: unknown, fallback: number): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v))
}

function sameKey(a: CacheKey, b: CacheKey): boolean {
    return a.contourRef === b.contourRef
        && a.smoothMethod === b.smoothMethod
        && a.chaikinIters === b.chaikinIters
        && a.laplacianIters === b.laplacianIters
        && a.laplacianLambda === b.laplacianLambda
        && a.sampleCount === b.sampleCount
        && a.offsetPx === b.offsetPx
        && a.forceOrientation === b.forceOrientation
        && a.adaptive === b.adaptive
        && a.adaptiveStrength === b.adaptiveStrength
}

function buildContour(input: ContourSamples, key: CacheKey): ContourSamples | null {
    let pts = contourToPairs(input)
    pts = ensureOrientation(pts, key.forceOrientation)

    if (key.smoothMethod === 'chaikin' || key.smoothMethod === 'chaikin+laplacian') {
        for (let i = 0; i < key.chaikinIters; i++) pts = chaikin(pts)
    }
    if (key.smoothMethod === 'laplacian' || key.smoothMethod === 'chaikin+laplacian') {
        for (let i = 0; i < key.laplacianIters; i++) pts = laplacian(pts, key.laplacianLambda)
    }

    if (pts.length < 3) return null

    const lengths = edgeLengths(pts)
    const totalLength = lengths.reduce((a, b) => a + b, 0)
    if (totalLength <= 1e-3) return null

    const N = key.sampleCount
    const ds = totalLength / N

    const positions = new Float32Array(N * 2)
    const tangents = new Float32Array(N * 2)
    const arcS = new Float32Array(N)

    let edgeIdx = 0
    let edgeAcc = 0
    for (let i = 0; i < N; i++) {
        const target = i * ds
        while (edgeIdx < lengths.length - 1 && edgeAcc + lengths[edgeIdx] < target) {
            edgeAcc += lengths[edgeIdx]
            edgeIdx++
        }
        const segT = lengths[edgeIdx] > 1e-9 ? (target - edgeAcc) / lengths[edgeIdx] : 0
        const a = pts[edgeIdx]
        const b = pts[(edgeIdx + 1) % pts.length]
        const px = a[0] + (b[0] - a[0]) * segT
        const py = a[1] + (b[1] - a[1]) * segT
        positions[i * 2] = px
        positions[i * 2 + 1] = py
        arcS[i] = target
    }

    for (let i = 0; i < N; i++) {
        const ip = (i - 1 + N) % N
        const inext = (i + 1) % N
        let tx = positions[inext * 2] - positions[ip * 2]
        let ty = positions[inext * 2 + 1] - positions[ip * 2 + 1]
        const len = Math.hypot(tx, ty) || 1
        tx /= len; ty /= len
        tangents[i * 2] = tx
        tangents[i * 2 + 1] = ty
    }

    // Offsetting + self-intersection cleanup + re-resample so ribbon consumers
    // receive an evenly-distributed loop-free curve even through concave bends.
    let finalPositions: Float32Array<ArrayBuffer> = positions
    let finalTangents: Float32Array<ArrayBuffer> = tangents
    let finalTotalLength = totalLength
    let finalArcS: Float32Array<ArrayBuffer> = arcS

    if (key.offsetPx !== 0) {
        const shifted = new Float32Array(N * 2)
        for (let i = 0; i < N; i++) {
            const tx = tangents[i * 2]
            const ty = tangents[i * 2 + 1]
            const nx = -ty
            const ny = tx
            shifted[i * 2] = positions[i * 2] + nx * key.offsetPx
            shifted[i * 2 + 1] = positions[i * 2 + 1] + ny * key.offsetPx
        }
        const cleaned = removeSelfIntersections(shifted)
        if (cleaned.length < 8) {
            return null
        }
        const reSampled = resampleClosedRing(cleaned, N)
        finalPositions = reSampled.positions
        finalTangents = reSampled.tangents
        finalTotalLength = reSampled.totalLength
        finalArcS = reSampled.arcS
    }

    // Curvature-adaptive redistribution: same N samples but denser on bends.
    // arcS stays in physical arc length so UV-mapped text flows uniformly.
    if (key.adaptive && key.adaptiveStrength > 0) {
        const adapted = curvatureAdaptiveResample(finalPositions, N, key.adaptiveStrength)
        finalPositions = adapted.positions
        finalTangents = adapted.tangents
        finalArcS = adapted.arcS
        finalTotalLength = adapted.totalLength
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < N; i++) {
        const x = finalPositions[i * 2]
        const y = finalPositions[i * 2 + 1]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
    }

    return {
        version: 1,
        closed: true,
        count: N,
        totalLength: finalTotalLength,
        aabb: [minX, minY, maxX, maxY],
        positions: finalPositions,
        tangents: finalTangents,
        arcS: finalArcS,
    }
}

// Resample closed polyline (any M ≥ 3) onto exactly N arc-length-uniform points.
function resampleClosedRing(positions: Float32Array<ArrayBuffer>, N: number): {
    positions: Float32Array<ArrayBuffer>
    tangents: Float32Array<ArrayBuffer>
    arcS: Float32Array<ArrayBuffer>
    totalLength: number
} {
    const M = positions.length / 2
    const lengths = new Float32Array(M)
    for (let i = 0; i < M; i++) {
        const j = (i + 1) % M
        const dx = positions[j * 2] - positions[i * 2]
        const dy = positions[j * 2 + 1] - positions[i * 2 + 1]
        lengths[i] = Math.hypot(dx, dy)
    }
    let totalLength = 0
    for (let i = 0; i < M; i++) totalLength += lengths[i]
    if (totalLength <= 1e-3 || M < 3) {
        const copy = new Float32Array(N * 2)
        for (let i = 0; i < N; i++) {
            const k = (i % Math.max(M, 1)) * 2
            copy[i * 2] = positions[k] ?? 0
            copy[i * 2 + 1] = positions[k + 1] ?? 0
        }
        return {
            positions: copy,
            tangents: new Float32Array(N * 2),
            arcS: new Float32Array(N),
            totalLength,
        }
    }
    const ds = totalLength / N

    const outPos = new Float32Array(N * 2)
    const outArcS = new Float32Array(N)
    let edgeIdx = 0
    let edgeAcc = 0
    for (let i = 0; i < N; i++) {
        const target = i * ds
        while (edgeIdx < M - 1 && edgeAcc + lengths[edgeIdx] < target) {
            edgeAcc += lengths[edgeIdx]
            edgeIdx++
        }
        const segLen = lengths[edgeIdx]
        const segT = segLen > 1e-9 ? (target - edgeAcc) / segLen : 0
        const a = edgeIdx
        const b = (edgeIdx + 1) % M
        outPos[i * 2] = positions[a * 2] + (positions[b * 2] - positions[a * 2]) * segT
        outPos[i * 2 + 1] = positions[a * 2 + 1] + (positions[b * 2 + 1] - positions[a * 2 + 1]) * segT
        outArcS[i] = target
    }

    const outTan = new Float32Array(N * 2)
    for (let i = 0; i < N; i++) {
        const ip = (i - 1 + N) % N
        const inext = (i + 1) % N
        let tx = outPos[inext * 2] - outPos[ip * 2]
        let ty = outPos[inext * 2 + 1] - outPos[ip * 2 + 1]
        const len = Math.hypot(tx, ty) || 1
        tx /= len; ty /= len
        outTan[i * 2] = tx
        outTan[i * 2 + 1] = ty
    }

    return { positions: outPos, tangents: outTan, arcS: outArcS, totalLength }
}

// FastSmoothSAM (arXiv 2507.15008) weighted-arc-length sampling: edges weighted
// by (1 + boost·κ̂); strength ∈ [0,1] mixes uniform/full. Emitted arcS is the
// physical (not weighted) length so UV-mapped consumers stay uniform. boost=8
// is empirically the sweet spot for polygon-quantised silhouettes.
function curvatureAdaptiveResample(
    positions: Float32Array<ArrayBuffer>,
    N: number,
    strength: number,
): {
    positions: Float32Array<ArrayBuffer>
    tangents: Float32Array<ArrayBuffer>
    arcS: Float32Array<ArrayBuffer>
    totalLength: number
} {
    const M = positions.length / 2
    if (M < 3) return resampleClosedRing(positions, N)

    // Discrete Menger curvature: κ_i = 2|cross| / (|v1|·|v2|·|chord|); 0 on collinear runs.
    const curv = new Float32Array(M)
    for (let i = 0; i < M; i++) {
        const ip = (i - 1 + M) % M
        const inext = (i + 1) % M
        const v1x = positions[i * 2] - positions[ip * 2]
        const v1y = positions[i * 2 + 1] - positions[ip * 2 + 1]
        const v2x = positions[inext * 2] - positions[i * 2]
        const v2y = positions[inext * 2 + 1] - positions[i * 2 + 1]
        const cx = positions[inext * 2] - positions[ip * 2]
        const cy = positions[inext * 2 + 1] - positions[ip * 2 + 1]
        const a = Math.hypot(v1x, v1y)
        const b = Math.hypot(v2x, v2y)
        const c = Math.hypot(cx, cy)
        const cross = Math.abs(v1x * v2y - v1y * v2x)
        const denom = a * b * c
        curv[i] = denom > 1e-9 ? (2 * cross) / denom : 0
    }

    // 3-tap smooth: suppresses single-sample κ spikes that would cluster vertices.
    const curvSm = new Float32Array(M)
    for (let i = 0; i < M; i++) {
        const ip = (i - 1 + M) % M
        const inext = (i + 1) % M
        curvSm[i] = (curv[ip] + curv[i] + curv[inext]) / 3
    }

    let maxK = 0
    for (let i = 0; i < M; i++) if (curvSm[i] > maxK) maxK = curvSm[i]
    const norm = maxK > 1e-9 ? 1 / maxK : 0

    const boost = 8
    const density = new Float32Array(M)
    for (let i = 0; i < M; i++) {
        const raw = 1 + boost * curvSm[i] * norm
        density[i] = 1 + strength * (raw - 1)
    }

    const edgeLen = new Float32Array(M)
    const edgeWLen = new Float32Array(M)
    for (let i = 0; i < M; i++) {
        const j = (i + 1) % M
        const dx = positions[j * 2] - positions[i * 2]
        const dy = positions[j * 2 + 1] - positions[i * 2 + 1]
        const L = Math.hypot(dx, dy)
        edgeLen[i] = L
        const w = (density[i] + density[j]) * 0.5
        edgeWLen[i] = L * w
    }

    let weightedTotal = 0
    let physicalTotal = 0
    for (let i = 0; i < M; i++) {
        weightedTotal += edgeWLen[i]
        physicalTotal += edgeLen[i]
    }
    if (weightedTotal <= 1e-3 || physicalTotal <= 1e-3) {
        return resampleClosedRing(positions, N)
    }

    const dsW = weightedTotal / N
    const outPos = new Float32Array(N * 2)
    const outArcS = new Float32Array(N)

    let edgeIdx = 0
    let edgeAccW = 0
    let edgeAccPhys = 0
    for (let i = 0; i < N; i++) {
        const targetW = i * dsW
        while (edgeIdx < M - 1 && edgeAccW + edgeWLen[edgeIdx] < targetW) {
            edgeAccW += edgeWLen[edgeIdx]
            edgeAccPhys += edgeLen[edgeIdx]
            edgeIdx++
        }
        const segWLen = edgeWLen[edgeIdx]
        const segT = segWLen > 1e-9 ? (targetW - edgeAccW) / segWLen : 0
        const a = edgeIdx
        const b = (edgeIdx + 1) % M
        outPos[i * 2] = positions[a * 2] + (positions[b * 2] - positions[a * 2]) * segT
        outPos[i * 2 + 1] = positions[a * 2 + 1] + (positions[b * 2 + 1] - positions[a * 2 + 1]) * segT
        outArcS[i] = edgeAccPhys + segT * edgeLen[edgeIdx]
    }

    const outTan = new Float32Array(N * 2)
    for (let i = 0; i < N; i++) {
        const ip = (i - 1 + N) % N
        const inext = (i + 1) % N
        let tx = outPos[inext * 2] - outPos[ip * 2]
        let ty = outPos[inext * 2 + 1] - outPos[ip * 2 + 1]
        const len = Math.hypot(tx, ty) || 1
        tx /= len; ty /= len
        outTan[i * 2] = tx
        outTan[i * 2 + 1] = ty
    }

    return { positions: outPos, tangents: outTan, arcS: outArcS, totalLength: physicalTotal }
}

// Iteratively clip cusp loops introduced by normal-offset through high-curvature
// concave regions: find crossing edge pairs and drop the shorter arc.
// O(M²) per pass × few passes; fine for the M ≤ 256 sampled rings the editor uses.
function removeSelfIntersections(positions: Float32Array): Float32Array<ArrayBuffer> {
    let pts: Array<[number, number]> = []
    const N0 = positions.length / 2
    for (let i = 0; i < N0; i++) {
        pts.push([positions[i * 2], positions[i * 2 + 1]])
    }

    let safety = 64
    while (safety-- > 0 && pts.length >= 4) {
        let found: { i: number; j: number; X: [number, number] } | null = null
        const M = pts.length

        outer:
        for (let i = 0; i < M; i++) {
            const a1 = pts[i]
            const a2 = pts[(i + 1) % M]
            // Skip neighbour (k=1) and wrap-around neighbour (k=M-1).
            for (let k = 2; k < M - 1; k++) {
                const j = (i + k) % M
                const b1 = pts[j]
                const b2 = pts[(j + 1) % M]
                const X = segIntersect(a1, a2, b1, b2)
                if (X) {
                    found = { i, j, X }
                    break outer
                }
            }
        }
        if (!found) break

        // arcA = pts[i+1..j], arcB = pts[j+1..i]; drop the shorter arc and stitch with X.
        const M0 = pts.length
        const arcA = ((found.j - found.i) + M0) % M0
        const arcB = M0 - arcA

        const newPts: Array<[number, number]> = []
        if (arcA <= arcB) {
            for (let k = 0; k < arcB; k++) {
                newPts.push(pts[(found.j + 1 + k) % M0])
            }
            newPts.push(found.X)
        } else {
            for (let k = 0; k < arcA; k++) {
                newPts.push(pts[(found.i + 1 + k) % M0])
            }
            newPts.push(found.X)
        }
        pts = newPts
    }

    if (pts.length < 4) {
        const fallback = new Float32Array(positions.length)
        fallback.set(positions)
        return fallback
    }

    const out = new Float32Array(pts.length * 2)
    for (let i = 0; i < pts.length; i++) {
        out[i * 2] = pts[i][0]
        out[i * 2 + 1] = pts[i][1]
    }
    return out
}

// Returns the intersection only when t,u ∈ (0,1) strictly — endpoint touches don't count.
function segIntersect(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    p4: [number, number],
): [number, number] | null {
    const x1 = p1[0], y1 = p1[1]
    const x2 = p2[0], y2 = p2[1]
    const x3 = p3[0], y3 = p3[1]
    const x4 = p4[0], y4 = p4[1]
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(den) < 1e-9) return null
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    const eps = 1e-6
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

function contourToPairs(c: ContourSamples): [number, number][] {
    const M = c.count
    const out: [number, number][] = new Array(M)
    for (let i = 0; i < M; i++) {
        out[i] = [c.positions[i * 2], c.positions[i * 2 + 1]]
    }
    return out
}

function signedArea(pts: [number, number][]): number {
    let a = 0
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length
        a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    }
    return a * 0.5
}

function ensureOrientation(pts: [number, number][], force: Orientation): [number, number][] {
    const a = signedArea(pts)
    // Convention: positive signed area = CCW; `auto` normalises to CCW.
    let isCcw = a > 0
    let want = isCcw
    if (force === 'cw') want = false
    else if (force === 'ccw') want = true
    else want = true
    if (want === isCcw) return pts
    const out = pts.slice().reverse()
    return out
}

function chaikin(pts: [number, number][]): [number, number][] {
    const n = pts.length
    if (n < 3) return pts
    const out: [number, number][] = new Array(n * 2)
    for (let i = 0; i < n; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % n]
        out[i * 2] = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]
        out[i * 2 + 1] = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]
    }
    return out
}

function laplacian(pts: [number, number][], lambda: number): [number, number][] {
    const n = pts.length
    if (n < 3) return pts
    const out: [number, number][] = new Array(n)
    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n]
        const cur = pts[i]
        const next = pts[(i + 1) % n]
        const mx = (prev[0] + next[0]) * 0.5
        const my = (prev[1] + next[1]) * 0.5
        out[i] = [
            cur[0] * (1 - lambda) + mx * lambda,
            cur[1] * (1 - lambda) + my * lambda,
        ]
    }
    return out
}

function edgeLengths(pts: [number, number][]): number[] {
    const n = pts.length
    const out = new Array<number>(n)
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        out[i] = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
    }
    return out
}
