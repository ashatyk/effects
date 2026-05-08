/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useCallback } from 'react'
import { ActionButton } from '@effects/ui'
import { effects } from '@effects/runtime'
import type { NodeSettingsProps } from './types'

/* Lives under Actions (not Parameters) because a download button next to
   editable sliders reads as if the button were itself a tunable knob. */
export const ConfigNodeActions = memo(({ data }: NodeSettingsProps) => {
    const effectName = (data.params.effect ?? effects[0]?.name ?? '') as string

    const handleExport = useCallback(() => {
        const effectCfg = effects.find(e => e.name === effectName)
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
    }, [effectName, data.params])

    return (
        <ActionButton onClick={handleExport} variant="primary">
            Export config
        </ActionButton>
    )
})
