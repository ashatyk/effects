import type { FieldDef, UniformEntries, UniformKind } from './types'

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
