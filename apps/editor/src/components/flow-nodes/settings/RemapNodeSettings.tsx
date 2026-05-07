import { memo } from 'react'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SelectField } from '@effects/ui'
import { REMAP_OPS } from '@effects/runtime/node-engine/processors/remap'
import type { NodeSettingsProps } from './types'

type RemapOp = typeof REMAP_OPS[number]

export const RemapNodeSettings = memo(({ id, data }: NodeSettingsProps) => {
    const set = useSetParam(id)
    const p = data.params
    return (
        <>
            <SelectField
                label="op"
                value={(p.op ?? 'passthrough') as RemapOp}
                options={REMAP_OPS}
                onChange={v => set('op', v)}
            />
            <NumberField
                label="strength"
                value={(p.strength ?? 2) as number}
                min={0} max={10} step={0.1}
                onChange={v => set('strength', v)}
            />
        </>
    )
})
