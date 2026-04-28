import type { CoordsTexture, FieldDef, UniformEntries, UniformKind } from './types'

export function buildUniformEntries(
    fields: FieldDef[],
    canvasW: number,
    canvasH: number,
    staticUniforms?: Record<string, { value: number | number[]; type: UniformKind }>,
): UniformEntries {
    const entries: UniformEntries = {
        uResolution: { value: [canvasW, canvasH], type: 'vec2<f32>' },
        ...(staticUniforms ?? {}),
    }
    for (const field of fields) {
        const uniformName = field.uniformName ?? field.name
        entries[uniformName] = { value: field.default, type: field.kind }
    }
    return entries
}

export function applyCoordsUniforms(uniforms: UniformEntries, coordsRes: CoordsTexture | undefined) {
    if (!coordsRes) return
    uniforms.uPointTextureDim = { value: [coordsRes.w, coordsRes.h], type: 'vec2<f32>' }
    uniforms.uPointTexelCount = { value: coordsRes.count, type: 'i32' }
    uniforms.uPointAABB = {
        value: [coordsRes.minX, coordsRes.minY, coordsRes.maxX, coordsRes.maxY],
        type: 'vec4<f32>',
    }
}
