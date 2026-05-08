import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { BakedPipeline, PublishedPipeline } from '@effects/runtime'
import type { SupplierConfig } from '@effects/player'
import { ManifestPickerPage } from './pages/ManifestPickerPage'
import { PlayerPage } from './pages/PlayerPage'

// Two mount paths:
//   - baked (.baked.json): self-contained AOT artifact, no SAM, no merge.
//   - pipeline + optional config (.published.json + .config.json): replays
//     the supplier flow on the full original graph for pre-bake sanity checks.
// Tier-3 production integrations skip this picker and call
// `EffectPlayer.fromBaked` directly with bundled JSON.
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
