export function toNum(v: unknown): number | undefined {
    if (v === '' || v == null) return undefined
    return parseFloat(String(v))
}

export function buildInitialValues(fields: { name: string; default: number | number[] }[]) {
    const values: Record<string, number | number[]> = {}
    for (const f of fields) {
        values[f.name] = f.default
    }
    return values
}
