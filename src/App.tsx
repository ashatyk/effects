import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NodeEditor } from './components/NodeEditor'

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<NodeEditor />} />
            </Routes>
        </BrowserRouter>
    )
}
