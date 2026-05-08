import type { PipelineNodeData } from '../types'

// (id, data) slice; runs inside the same ReactFlowProvider + EngineProvider as the canvas.
export interface NodeSettingsProps {
    id: string
    data: PipelineNodeData
}
