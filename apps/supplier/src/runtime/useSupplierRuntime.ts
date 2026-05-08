import { useEffect, useRef, useState } from 'react'
import type { Application } from 'pixi.js'
import {
    createEngine,
    type CreatedEngine,
} from '@effects/player'
import {
    type DataflowEngine,
    type PublishedPipeline,
} from '@effects/runtime'

interface SupplierRuntime {
    engine: DataflowEngine | null
    app: Application | null
    ready: boolean
}

// Owns the Pixi Application + DataflowEngine lifecycle for supplier UX.
// Exposes the raw engine (not the EffectPlayer facade) because every form
// widget calls granular applyOverride.* helpers directly.
export function useSupplierRuntime(pipeline: PublishedPipeline): SupplierRuntime {
    const handleRef = useRef<CreatedEngine | null>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let destroyed = false
        ;(async () => {
            const handle = await createEngine({ pipeline })
            if (destroyed) { handle.destroy(); return }
            handleRef.current = handle
            setReady(true)
        })()

        return () => {
            destroyed = true
            handleRef.current?.destroy()
            handleRef.current = null
            setReady(false)
        }
        // Pipeline identity is the only structural input — switching tears down + rebuilds.
    }, [pipeline])

    return {
        engine: handleRef.current?.engine ?? null,
        app: handleRef.current?.app ?? null,
        ready,
    }
}
