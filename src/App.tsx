import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { NodeEditor } from './components/NodeEditor'
import './App.css'

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<NodeEditor />} />
            </Routes>
        </BrowserRouter>
    )
}
