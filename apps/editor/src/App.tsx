import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NodeEditor } from './components/NodeEditor'
import { BakedPreview } from './components/baked-preview/BakedPreview'

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<NodeEditor />} />
                <Route path="/baked" element={<BakedPreview />} />
            </Routes>
        </BrowserRouter>
    )
}
