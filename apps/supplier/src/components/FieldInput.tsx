import { useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ColorField, Field, SliderField } from '@effects/ui'
import type { PublishedField, FieldDef } from '@effects/runtime'

interface Props {
    field: PublishedField
    /** Current scalar / vector value as stored in SupplierConfig. */
    value: number | number[] | undefined
    /** Default value computed from the manifest (FieldDef.default).
     *  Used when no override is set yet so widgets still have a
     *  starting position equal to the authored default. */
    defaultValue: number | number[]
    onChange: (v: number | number[]) => void
}

/**
 * Render one supplier-facing parameter as the appropriate widget.
 *
 * Scalar (`f32` / `i32`) → SliderField.
 * Vector with `color: true` → ColorField (+ alpha slider for vec4).
 * Other vectors → stack of SliderFields (one per component).
 *
 * Mirrors the editor's `ConfigNodeView` rendering, kept in lockstep
 * so what supplier sees corresponds 1:1 to what the author tunes.
 */
export function FieldInput({ field, value, defaultValue, onChange }: Props) {
    const def: FieldDef = field.field
    const isScalar = def.kind === 'f32' || def.kind === 'i32'

    if (isScalar) {
        const v = (typeof value === 'number' ? value : (defaultValue as number))
        return (
            <Box>
                <Header label={field.label} hint={field.hint} />
                <SliderField
                    label={(def.uniformName ?? def.name)}
                    value={v}
                    min={def.slider?.min ?? 0}
                    max={def.slider?.max ?? 1}
                    step={def.slider?.step ?? (def.kind === 'i32' ? 1 : 0.01)}
                    fixed={def.kind === 'i32' ? 0 : 2}
                    onChange={onChange}
                />
            </Box>
        )
    }

    return (
        <Box>
            <Header label={field.label} hint={field.hint} />
            <VecInput field={def} value={value} defaultValue={defaultValue as number[]} onChange={onChange} />
        </Box>
    )
}

function Header({ label, hint }: { label: string; hint: string | undefined }) {
    return (
        <Box sx={{ mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
            {hint && (
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                    {hint}
                </Typography>
            )}
        </Box>
    )
}

function vec3ToHex(v: number[]): string {
    const c = (i: number) =>
        Math.round(Math.min(1, Math.max(0, v[i] ?? 0)) * 255)
            .toString(16)
            .padStart(2, '0')
    return `#${c(0)}${c(1)}${c(2)}`
}

function hexToVec(hex: string, len: number, currentAlpha: number): number[] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return len === 4 ? [r, g, b, currentAlpha] : [r, g, b]
}

function VecInput({
    field, value, defaultValue, onChange,
}: {
    field: FieldDef
    value: number | number[] | undefined
    defaultValue: number[]
    onChange: (v: number[]) => void
}) {
    const n = field.kind === 'vec2<f32>' ? 2 : field.kind === 'vec3<f32>' ? 3 : 4
    const arr = useMemo<number[]>(() => {
        const src = (Array.isArray(value) ? value : defaultValue) as number[]
        const out: number[] = []
        for (let i = 0; i < n; i++) out.push(src[i] ?? defaultValue[i] ?? 0)
        return out
    }, [value, defaultValue, n])

    const setComponent = useCallback((i: number, vi: number) => {
        const next = [...arr]
        next[i] = vi
        onChange(next)
    }, [arr, onChange])

    if (field.color) {
        return (
            <Stack>
                <ColorField
                    label={field.uniformName ?? field.name}
                    value={vec3ToHex(arr)}
                    onChange={hex => onChange(hexToVec(hex, n, arr[3] ?? 1))}
                    extra={arr.map(v => v.toFixed(2)).join(', ')}
                />
                {n === 4 && (
                    <SliderField
                        label="alpha"
                        value={arr[3]}
                        min={0} max={1} step={0.01} fixed={2}
                        onChange={v => setComponent(3, v)}
                    />
                )}
            </Stack>
        )
    }

    return (
        <Field label={field.uniformName ?? field.name} column>
            <Stack>
                {arr.map((v, i) => (
                    <SliderField
                        key={i}
                        label={`[${i}]`}
                        value={v}
                        min={field.slider?.min ?? 0}
                        max={field.slider?.max ?? 1}
                        step={field.slider?.step ?? 0.01}
                        fixed={2}
                        onChange={vv => setComponent(i, vv)}
                    />
                ))}
            </Stack>
        </Field>
    )
}
