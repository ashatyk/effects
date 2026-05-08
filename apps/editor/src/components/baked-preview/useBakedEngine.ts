import { useEffect, useState } from 'react'
import type { BakedPipeline, DataflowEngine, PublishedPipeline } from '@effects/runtime'
import {
    applyAllOverrides,
    createEngine,
    emptyConfig,
    type SupplierConfig,
} from '@effects/player'

interface BakedEngineState {
    engine: DataflowEngine | null
    ready: boolean
    error: string | null
}

/**
 * Self-contained Pixi + `DataflowEngine` bootstrap for a
 * `BakedPipeline`, mirroring `EffectPlayer.fromBaked` but without a
 * visible canvas — node cards subscribe via `EngineContext` for
 * their own previews. `ready` flips true only after
 * `applyAllOverrides`'s synchronous portion so React Flow doesn't
 * race the first tick. The `PublishedPipeline` wrapper is a pure
 * type-shim: `createEngine` only reads `pipeline.graph.{nodes,edges}`
 * which `BakedPipeline.graph` already provides.
 */
export function useBakedEngine(baked: BakedPipeline | null): BakedEngineState {
    const [state, setState] = useState<BakedEngineState>({
        engine: null,
        ready: false,
        error: null,
    })

    useEffect(() => {
        if (!baked) {
            setState({ engine: null, ready: false, error: null })
            return
        }

        let destroyed = false
        let cleanup: (() => void) | null = null

        ;(async () => {
            try {
                const pipeline: PublishedPipeline = {
                    id: baked.id,
                    name: baked.name,
                    version: baked.pipelineVersion,
                    manifestVersion: baked.manifestVersion,
                    graph: baked.graph,
                    surface: baked.surface,
                }

                const { engine, destroy } = await createEngine({ pipeline })
                if (destroyed) { destroy(); return }

                const embedded = baked.embeddedConfig as SupplierConfig | undefined
                const config = embedded && embedded.pipelineId === pipeline.id
                    ? embedded
                    : emptyConfig(pipeline)
                applyAllOverrides(engine, pipeline, config)

                cleanup = destroy
                setState({ engine, ready: true, error: null })
            } catch (e) {
                setState({ engine: null, ready: false, error: (e as Error).message ?? String(e) })
            }
        })()

        return () => {
            destroyed = true
            cleanup?.()
            cleanup = null
            setState({ engine: null, ready: false, error: null })
        }
    }, [baked])

    return state
}
