import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { BakedPipeline, PublishedPipeline } from '@effects/runtime'
import type { SupplierConfig } from '@effects/player'
import { ManifestPickerPage } from './pages/ManifestPickerPage'
import { PlayerPage } from './pages/PlayerPage'

/**
 * Player-app shell.
 *
 * Two mount paths:
 *
 * 1. **Baked** (production): drop a `.baked.json` and render
 *    immediately — single self-contained AOT artifact, no SAM, no
 *    runtime config merge.
 *
 * 2. **Pipeline + config** (dev / debug): drop a `.published.json`
 *    plus an optional `.config.json` — replays the supplier's
 *    interactive flow, runs the full original graph (segmentation
 *    spawns SAM, etc.). Useful for sanity-checking a pipeline
 *    before bake.
 *
 * App-level state holds whichever mount the picker resolved. Reload
 * clears everything — the demo is intentionally non-persistent.
 * Tier-3 production integrations would call `EffectPlayer.fromBaked`
 * directly with bundled JSON, no router, no picker.
 */
export default function App() {
    const [pipeline, setPipeline] = useState<PublishedPipeline | null>(null)
    const [config, setConfig] = useState<SupplierConfig | null>(null)
    const [baked, setBaked] = useState<BakedPipeline | null>(null)

    const clearAll = () => {
        setPipeline(null)
        setConfig(null)
        setBaked(null)
    }

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    <ManifestPickerPage
                        onLoadedPipeline={(p, c) => { clearAll(); setPipeline(p); setConfig(c ?? null) }}
                        onLoadedBaked={b => { clearAll(); setBaked(b) }}
                    />
                } />
                <Route path="/player" element={
                    (baked || pipeline)
                        ? <PlayerPage
                            mount={baked
                                ? { kind: 'baked', baked }
                                : { kind: 'pipeline', pipeline: pipeline!, initialConfig: config }}
                            onClear={clearAll}
                          />
                        : <Navigate to="/" replace />
                } />
            </Routes>
        </BrowserRouter>
    )
}
