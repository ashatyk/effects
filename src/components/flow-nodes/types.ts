export interface PipelineNodeData {
    processor: string
    params: Record<string, unknown>
    label?: string
    [key: string]: unknown
}
