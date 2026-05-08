export interface PipelineNodeData {
    processor: string
    params: Record<string, unknown>
    label?: string
    // UI-only viewer alias of another node. Engine never sees clones — sceneResolver rewrites
    // outgoing edges to point at the origin and engine.addNode is never called for clones.
    cloneOf?: string
    // Tier-2 exposure metadata; survives PublishRoot deletion, carried by copy-paste.
    // mode='whole': render the entire node for the supplier (e.g. Image upload, Segmentation editor).
    // mode='fields': expose listed param keys (Config-style nodes).
    exposed?: ExposedMeta
    // Escape hatch for nodes whose output is large-on-disk but cheap-to-recompute live (e.g.
    // sdfFromContour). When true, the bake step in @effects/player adds this node as a taint seed.
    runtimeDynamic?: boolean
    [key: string]: unknown
}

export interface ExposedMeta {
    mode: 'whole' | 'fields'
    // FieldDef.name keys; honoured only when mode='fields'.
    fields?: string[]
    // Supplier-facing label; falls back to data.label then def.title.
    label?: string
    hint?: string
}
