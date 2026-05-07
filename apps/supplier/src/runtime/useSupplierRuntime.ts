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

/**
 * React adapter around `@effects/player`'s `createEngine`. Builds a
 * `DataflowEngine` from a `PublishedPipeline.graph` and owns the
 * Pixi `Application` lifecycle for the supplier app.
 *
 * The supplier app needs the engine handle directly (not the
 * `EffectPlayer` fasade) because every form widget calls granular
 * `applyOverride.*` helpers — wrapping them in player's `setField`/
 * `setImage`/etc. would just add a thin redirect. The fasade is
 * what the Tier-3 player-demo / partner integrations use.
 *
 * Engine starts ticking immediately so any time-driven effects
 * (animations, scrolls) are live by the time the supplier wires
 * inputs.
 */
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
        /* Pipeline identity is the only structural input — switching
           pipelines tears the engine down and rebuilds. */
    }, [pipeline])

    return {
        engine: handleRef.current?.engine ?? null,
        app: handleRef.current?.app ?? null,
        ready,
    }
}
