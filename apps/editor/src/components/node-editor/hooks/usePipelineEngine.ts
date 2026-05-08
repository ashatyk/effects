/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { DataflowEngine } from '@effects/runtime'
import { sceneStore } from '@/scene-store'
import type { ScenePayload } from './useSceneHistory'

interface Deps {
    engineRef: React.MutableRefObject<DataflowEngine | null>
    applySnapshot: (
        snap: ScenePayload,
        engine: DataflowEngine,
    ) => Promise<void>
}

export function usePipelineEngine({ engineRef, applySnapshot }: Deps) {
    const [engineReady, setEngineReady] = useState(false)
    const restoredRef = useRef(false)

    useEffect(() => {
        let destroyed = false
        const app = new Application()
        ;(async () => {
            await app.init({
                width: 16, height: 16,
                preference: 'webgl',
                preferWebGLVersion: 2,
                background: 0x000000,
                backgroundAlpha: 1,
                antialias: false,
                autoStart: false,
            } as any)
            if (destroyed) { app.destroy(true, { children: true }); return }

            const canvas = app.canvas as HTMLCanvasElement
            canvas.style.position = 'fixed'
            canvas.style.left = '-9999px'
            canvas.style.top = '-9999px'
            canvas.style.pointerEvents = 'none'
            document.body.appendChild(canvas)

            app.stage.eventMode = 'none'
            const engine = new DataflowEngine(app)
            engineRef.current = engine
            engine.start()
            setEngineReady(true)

            if (!restoredRef.current) {
                restoredRef.current = true
                await sceneStore.init()
                const snap = await sceneStore.currentSnapshot()
                // Snapshot may be pages-aware (snap.pages[]) or legacy flat (snap.nodes/edges);
                // applySnapshot migrates legacy into the default page.
                const hasPages = (snap?.pages?.length ?? 0) > 0
                const hasLegacyNodes = (snap?.nodes?.length ?? 0) > 0
                if (snap && (hasPages || hasLegacyNodes)) {
                    await applySnapshot(snap, engine)
                }
            }
        })()

        return () => {
            destroyed = true
            const eng = engineRef.current
            if (eng) {
                const canvas = eng.app.canvas as HTMLCanvasElement
                eng.destroy()
                try { eng.app.destroy(true, { children: true }) } catch { /* */ }
                canvas?.remove()
            }
            engineRef.current = null
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return { engineReady }
}
