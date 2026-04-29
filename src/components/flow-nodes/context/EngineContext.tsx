import { createContext, useContext } from 'react'
import type { DataflowEngine } from '../../../node-engine/dataflow-engine'

const EngineCtx = createContext<DataflowEngine | null>(null)

export const EngineProvider = EngineCtx.Provider

export function useEngine(): DataflowEngine {
    const e = useContext(EngineCtx)
    if (!e) throw new Error('useEngine must be inside EngineProvider')
    return e
}
