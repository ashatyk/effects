/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef } from '../types'
import { effects } from '../../effects'

export const configDef: ProcessorDef = {
    type: 'config',
    title: 'Config',
    category: 'util',
    inputs: [],
    outputs: [{ name: 'config', type: SLOT.CONFIG }],
    defaultParams: { effect: effects[0]?.name ?? '' },
}

export class ConfigProcessor extends BaseProcessor {
    readonly def = configDef

    execute(_inputs: Record<string, any>, params: Record<string, any>): Record<string, any> {
        const effectName = (params.effect ?? effects[0]?.name) as string
        const effectCfg = effects.find(e => e.name === effectName) ?? effects[0]
        if (!effectCfg) return { config: { __effectName: effectName } }

        const result: Record<string, any> = { __effectName: effectName }
        for (const field of effectCfg.fields) {
            const uName = field.uniformName ?? field.name
            const isScalar = field.kind === 'f32' || field.kind === 'i32'
            if (isScalar) {
                result[uName] = params[uName] ?? field.default
            } else {
                const def = field.default as number[]
                const arr: number[] = []
                for (let ci = 0; ci < def.length; ci++) {
                    arr.push(params[`${uName}_${ci}`] ?? def[ci])
                }
                result[uName] = arr
            }
        }
        return { config: result }
    }
}
