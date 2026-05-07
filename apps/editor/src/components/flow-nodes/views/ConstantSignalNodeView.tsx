import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { useSetParam } from '../hooks/useSetParam'
import { NumberField, SwitchField } from '@effects/ui'
import { constantSignalDef } from '@effects/runtime/node-engine/processors/constant-signal'
import type { PipelineNodeData } from '../types'

export const ConstantSignalNodeView = memo(({ id, data }: NodeProps & { data: PipelineNodeData }) => {
    const set = useSetParam(id)
    const value = (data.params.value ?? 0) as number
    const state = Boolean(data.params.state ?? false)

    return (
        <BaseNodeShell
            title={constantSignalDef.title}
            category={constantSignalDef.category}
            inputs={constantSignalDef.inputs}
            outputs={constantSignalDef.outputs}
            minWidth={200}
        >
            <NumberField label="value" value={value} step={0.05} onChange={v => set('value', v)} />
            <SwitchField label="state (active)" checked={state} onChange={v => set('state', v)} />
        </BaseNodeShell>
    )
})
