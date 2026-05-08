import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { PublishedPipeline } from '@effects/runtime'
import { ManifestPickerPage } from './pages/ManifestPickerPage'
import { SupplierPage } from './pages/SupplierPage'

// Pipeline lives in App state (not localStorage): reload = fresh picker.
// Matches the v1 contract — one config per session, no draft persistence.
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
