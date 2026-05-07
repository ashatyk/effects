import type { PipelineNodeData } from '../types'

/**
 * Settings-pane component contract. Each `*NodeSettings` renders the
 * controls for one processor type inside the right-rail Settings
 * panel. Mirrors the (id, data) slice of `NodeProps` but skips the
 * React Flow chrome — settings panes never need handles, resizers,
 * or the in-graph card surface; `PublishInspector`'s `SectionBlock`
 * provides the panel-side framing instead.
 *
 * Settings views run inside the same `<ReactFlowProvider>` and
 * `<EngineProvider>` as the canvas, so `useSetParam` / `useScene` /
 * `useEngine` / `useNodeOutputs` all work identically.
 */
export interface NodeSettingsProps {
    id: string
    data: PipelineNodeData
}
