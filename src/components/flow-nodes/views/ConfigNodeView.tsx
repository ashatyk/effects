/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useMemo, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { ActionButton, ColorField, Field, SelectField, SliderField } from '../widgets'
import { configDef } from '../../../node-engine/processors/config'
import { effects } from '../../../effects'
import type { FieldDef } from '../../../pipeline/types'
import type { PipelineNodeData } from '../types'

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

function ScalarField({ field, value, onChange }: {
    field: FieldDef
    value: number
    onChange: (uName: string, v: number) => void
}) {
    const uName = field.uniformName ?? field.name
    return (
        <SliderField
            label={field.label}
            value={value}
            min={field.slider?.min ?? 0}
            max={field.slider?.max ?? 1}
            step={field.slider?.step ?? (field.kind === 'i32' ? 1 : 0.01)}
            fixed={field.kind === 'i32' ? 0 : 2}
            onChange={v => onChange(uName, v)}
        />
    )
}

function VecField({ field, params, onScalar, onColor }: {
    field: FieldDef
    params: Record<string, any>
    onScalar: (uName: string, v: number) => void
    onColor: (uName: string, hex: string) => void
}) {
    const uName = field.uniformName ?? field.name
    const def = field.default as number[]
    const n = field.kind === 'vec2<f32>' ? 2 : field.kind === 'vec3<f32>' ? 3 : 4

    const arr: number[] = []
    for (let i = 0; i < n; i++) {
        arr.push((params[`${uName}_${i}`] ?? def[i]) as number)
    }

    if (field.color) {
        return (
            <Stack>
                <ColorField
                    label={field.label}
                    value={vec3ToHex(arr)}
                    onChange={hex => onColor(uName, hex)}
                    extra={arr.map(v => v.toFixed(2)).join(', ')}
                />
                {n === 4 && (
                    <SliderField
                        label="alpha"
                        value={arr[3]}
                        min={0} max={1} step={0.01} fixed={2}
                        onChange={v => onScalar(`${uName}_3`, v)}
                    />
                )}
            </Stack>
        )
    }

    return (
        <Field label={field.label} column>
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
                        onChange={vv => onScalar(`${uName}_${i}`, vv)}
                    />
                ))}
            </Stack>
        </Field>
    )
}

export const ConfigNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const effectName = (data.params.effect ?? effects[0]?.name ?? '') as string
    const effectCfg = useMemo(() => effects.find(e => e.name === effectName), [effectName])
    const names = effects.map(e => e.name)

    const handleScalar = useCallback((uName: string, v: number) => set(uName, v), [set])

    const handleExport = useCallback(() => {
        if (!effectCfg) return
        const out: Record<string, any> = { effect: effectName }
        for (const field of effectCfg.fields) {
            const uName = field.uniformName ?? field.name
            const isScalar = field.kind === 'f32' || field.kind === 'i32'
            if (isScalar) {
                out[uName] = (data.params[uName] ?? field.default) as number
            } else {
                const def = field.default as number[]
                const arr: number[] = []
                for (let i = 0; i < def.length; i++) {
                    arr.push((data.params[`${uName}_${i}`] ?? def[i]) as number)
                }
                out[uName] = arr
            }
        }
        const json = JSON.stringify(out, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${effectName}-config.json`
        a.click()
        URL.revokeObjectURL(url)
    }, [effectCfg, effectName, data.params])

    const handleColor = useCallback((uName: string, hex: string) => {
        const def = effectCfg?.fields.find(f => (f.uniformName ?? f.name) === uName)?.default as number[] | undefined
        const n = def?.length ?? 3
        const alpha = (data.params[`${uName}_3`] as number | undefined) ?? def?.[3] ?? 1
        const vec = hexToVec(hex, n, alpha)
        for (let i = 0; i < vec.length; i++) {
            set(`${uName}_${i}`, vec[i])
        }
    }, [set, effectCfg, data.params])

    return (
        <BaseNodeShell title={configDef.title} category={configDef.category} inputs={configDef.inputs} outputs={configDef.outputs} minWidth={420}>
            <SelectField label="effect" value={effectName} options={names} onChange={v => set('effect', v)} />
            <ActionButton onClick={handleExport} variant="primary">Export config</ActionButton>
            {effectCfg?.fields.map(field => {
                const uName = field.uniformName ?? field.name
                const isScalar = field.kind === 'f32' || field.kind === 'i32'
                if (isScalar) {
                    return (
                        <ScalarField
                            key={uName}
                            field={field}
                            value={(data.params[uName] ?? field.default) as number}
                            onChange={handleScalar}
                        />
                    )
                }
                return (
                    <VecField
                        key={uName}
                        field={field}
                        params={data.params}
                        onScalar={handleScalar}
                        onColor={handleColor}
                    />
                )
            })}
        </BaseNodeShell>
    )
})
