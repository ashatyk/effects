import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { PublishedPipeline } from '@effects/runtime'
import { ManifestPickerPage } from './pages/ManifestPickerPage'
import { SupplierPage } from './pages/SupplierPage'

/**
 * Supplier-app shell.
 *
 * State design: the loaded `PublishedPipeline` lives in App-level
 * state instead of being persisted to localStorage. Reload = fresh
 * picker. This matches the v1 contract — supplier prepares one config
 * per session, downloads `<effectId>.config.json`, and hands it to
 * the runtime team. No background draft persistence.
 */
export default function App() {
    const [pipeline, setPipeline] = useState<PublishedPipeline | null>(null)

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    <ManifestPickerPage onLoaded={setPipeline} />
                } />
                <Route path="/supplier" element={
                    pipeline
                        ? <SupplierPage pipeline={pipeline} onClear={() => setPipeline(null)} />
                        : <Navigate to="/" replace />
                } />
            </Routes>
        </BrowserRouter>
    )
}
