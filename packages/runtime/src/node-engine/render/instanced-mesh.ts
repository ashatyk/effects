/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer, BufferUsage, Geometry, Mesh, Shader } from 'pixi.js'
import type { InstancedGeometryDef, PerInstanceAttr } from '../../pipeline/types'
import type { ContourSamples } from '../types'

/**
 * Per-instance attribute streams. Either resolved from a static contour
 * (default) or supplied directly by the caller (e.g. CPU-resampled scrolling
 * or ribbon segments).
 *
 * The `*Next` arrays are populated only by ribbon-mode resampling: each
 * instance i is a segment from sample i to sample i+1, so vertex shaders can
 * build a strip-quad per segment.
 */
export interface InstanceStreams {
    count: number
    positions: Float32Array
    tangents: Float32Array
    arcS: Float32Array
    positionsNext?: Float32Array
    tangentsNext?: Float32Array
    arcSNext?: Float32Array
}

interface BuildArgs {
    def: InstancedGeometryDef
    streams: InstanceStreams
    vertex: string
    fragment: string
    resources: Record<string, unknown>
}

/**
 * Build an instanced Pixi v8 Mesh from an InstancedGeometryDef + per-instance
 * streams. Caller owns destruction of the returned Mesh + its geometry buffers.
 *
 * Per-vertex attributes:
 *   - aLocal: vec2 (pulled from def.perVertex.aLocal)
 *
 * Per-instance attributes are mapped per def.perInstance.map:
 *   - aPosition: vec2 from streams.positions
 *   - aTangent:  vec2 from streams.tangents
 *   - aArcS:     float from streams.arcS
 *   - aIndex:    float, 0..streams.count-1, generated on the fly
 */
export function buildInstancedMesh(args: BuildArgs): Mesh<Geometry, Shader> {
    const { def, streams, vertex, fragment, resources } = args
    const N = streams.count

    /* per-vertex local geometry — flat Float32Array */
    const local = new Float32Array(def.perVertex.aLocal.length * 2)
    for (let i = 0; i < def.perVertex.aLocal.length; i++) {
        local[i * 2] = def.perVertex.aLocal[i][0]
        local[i * 2 + 1] = def.perVertex.aLocal[i][1]
    }

    const attributes: Record<string, any> = {
        aLocal: { buffer: local, format: 'float32x2' as const },
    }

    for (const m of def.perInstance.map) {
        attributes[m.name] = perInstanceAttribute(m, streams, N)
    }

    const geometry = new Geometry({
        attributes,
        indexBuffer: new Uint16Array(def.indexBuffer),
        topology: 'triangle-list',
        instanceCount: N,
    })

    const shader = Shader.from({
        gl: { vertex, fragment },
        resources: resources as any,
    })

    return new Mesh<Geometry, Shader>({ geometry, shader })
}

/** Convert a static ContourSamples into per-instance streams (1:1 mapping). */
export function streamsFromContour(contour: ContourSamples): InstanceStreams {
    return {
        count: contour.count,
        positions: contour.positions,
        tangents: contour.tangents,
        arcS: contour.arcS,
    }
}

/**
 * Resample a closed contour at equally-spaced arc-length intervals, with a
 * time-based offset so the whole strip "scrolls" along the curve. Used by
 * `glyph`-mode scrolling (one instance per glyph anchored on the curve).
 */
export function resampleContourScrolling(
    contour: ContourSamples,
    spacingPx: number,
    phasePx: number,
): InstanceStreams {
    const total = contour.totalLength
    const spacing = Math.max(1, spacingPx)
    const N = Math.max(1, Math.floor(total / spacing))

    const outPos = new Float32Array(N * 2)
    const outTan = new Float32Array(N * 2)
    const outArcS = new Float32Array(N)

    /* Wrap phase into [0, total). */
    let phase = phasePx % total
    if (phase < 0) phase += total

    for (let i = 0; i < N; i++) {
        const s = (i * spacing + phase) % total
        outArcS[i] = s
        const sample = sampleContourAt(contour, s)
        outPos[i * 2] = sample[0]
        outPos[i * 2 + 1] = sample[1]
        outTan[i * 2] = sample[2]
        outTan[i * 2 + 1] = sample[3]
    }

    return { count: N, positions: outPos, tangents: outTan, arcS: outArcS }
}

/**
 * Resample a closed contour into ribbon segments. Each instance is a short
 * arc with start/end position+tangent, so a vertex shader can build a tilted
 * quad strip following the curve.
 *
 * Segment **positions are anchored** to fixed points on the contour and do
 * NOT move with phase — the geometry stays put. `phasePx` is added only to
 * the per-vertex `arcS` (UV.x) so the text appears to scroll *through* the
 * static ribbon instead of the ribbon scrolling under static text. Without
 * this split the two motions cancel out and the text looks frozen.
 */
export function resampleContourRibbon(
    contour: ContourSamples,
    segmentSizePx: number,
    phasePx: number,
): InstanceStreams {
    const total = contour.totalLength
    const desired = Math.max(1, segmentSizePx)
    const N = Math.max(8, Math.round(total / desired))
    const segSize = total / N

    const pos0 = new Float32Array(N * 2)
    const pos1 = new Float32Array(N * 2)
    const tan0 = new Float32Array(N * 2)
    const tan1 = new Float32Array(N * 2)
    const arc0 = new Float32Array(N)
    const arc1 = new Float32Array(N)

    for (let i = 0; i < N; i++) {
        const s0 = i * segSize
        const s1 = (i + 1) * segSize
        arc0[i] = s0 + phasePx
        arc1[i] = s1 + phasePx
        const a = sampleContourAt(contour, s0)
        const b = sampleContourAt(contour, s1 % total)
        pos0[i * 2] = a[0]; pos0[i * 2 + 1] = a[1]
        tan0[i * 2] = a[2]; tan0[i * 2 + 1] = a[3]
        pos1[i * 2] = b[0]; pos1[i * 2 + 1] = b[1]
        tan1[i * 2] = b[2]; tan1[i * 2 + 1] = b[3]
    }

    return {
        count: N,
        positions: pos0,
        tangents: tan0,
        arcS: arc0,
        positionsNext: pos1,
        tangentsNext: tan1,
        arcSNext: arc1,
    }
}

/** Linearly interpolate position+tangent at a given arc-length on the contour. */
function sampleContourAt(contour: ContourSamples, s: number): [number, number, number, number] {
    const N = contour.count
    /* The contour was resampled with a uniform step `total / N`. */
    const step = contour.totalLength / N
    const t = s / step
    const i0 = Math.floor(t) % N
    const i1 = (i0 + 1) % N
    const f = t - Math.floor(t)
    const px = contour.positions[i0 * 2] + (contour.positions[i1 * 2] - contour.positions[i0 * 2]) * f
    const py = contour.positions[i0 * 2 + 1] + (contour.positions[i1 * 2 + 1] - contour.positions[i0 * 2 + 1]) * f
    let tx = contour.tangents[i0 * 2] + (contour.tangents[i1 * 2] - contour.tangents[i0 * 2]) * f
    let ty = contour.tangents[i0 * 2 + 1] + (contour.tangents[i1 * 2 + 1] - contour.tangents[i0 * 2 + 1]) * f
    const len = Math.hypot(tx, ty) || 1
    tx /= len; ty /= len
    return [px, py, tx, ty]
}

function perInstanceAttribute(m: PerInstanceAttr, streams: InstanceStreams, count: number): any {
    const vec2 = (data: Float32Array) => ({
        buffer: new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST }),
        format: 'float32x2',
        instance: true,
    })
    const float = (data: Float32Array) => ({
        buffer: new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST }),
        format: 'float32',
        instance: true,
    })

    switch (m.from) {
        case 'positions':     return vec2(streams.positions)
        case 'tangents':      return vec2(streams.tangents)
        case 'arcS':          return float(streams.arcS)
        case 'positionsNext': return vec2(streams.positionsNext ?? streams.positions)
        case 'tangentsNext':  return vec2(streams.tangentsNext ?? streams.tangents)
        case 'arcSNext':      return float(streams.arcSNext ?? streams.arcS)
        case 'index': {
            const idx = new Float32Array(count)
            for (let i = 0; i < count; i++) idx[i] = i
            return float(idx)
        }
    }
}
