export interface PipelineNodeData {
    processor: string
    params: Record<string, unknown>
    /* User-given display name shown in the node header. When unset the
       header falls back to `def.title`. Edited via double-click on the
       header (see `BaseNodeShell` + `useSetNodeLabel`). */
    label?: string
    /* If set, this node is a UI-only viewer alias of another node (the
       original) anywhere in the scene. Engine never sees clones — every
       edge whose source is a clone is rewritten to point at the
       original by `sceneResolver.resolveSceneForEngine` before reaching
       `engine.setEdges`, and `engine.addNode` is never called for
       clones. See `CloneNodeView`. */
    cloneOf?: string
    /* Tier-2 supplier exposure metadata. When present, the publish
       traversal (`derivePublishedSurface`) folds this node into the
       PublishedPipeline.surface for the supplier-facing UI:
        - mode='whole': the entire node is rendered for the supplier
          (e.g. Image upload widget, Segmentation point editor). Used
          when the node's UI is irreducible to a list of fields.
        - mode='fields': only the listed param keys are exposed; the
          supplier sees one widget per field. Used for Config-style
          nodes where each FieldDef can be individually surfaced.
       Lives on the node (not on PublishRoot) so the metadata survives
       PublishRoot deletion, copy-paste carries it, and a node can
       declare its exposable surface independently of which root
       happens to consume it. Filtered against the traversal-reached
       set at publish time — exposed nodes that aren't connected to a
       PublishRoot are reported as 'orphan-exposed' validation errors. */
    exposed?: ExposedMeta
    [key: string]: unknown
}

/** See `PipelineNodeData.exposed`. */
export interface ExposedMeta {
    mode: 'whole' | 'fields'
    /** FieldDef.name keys to expose. Only honoured when mode='fields';
     *  ignored on mode='whole'. */
    fields?: string[]
    /** Supplier-facing label. Falls back to `data.label` then the
     *  processor's `def.title` when unset. */
    label?: string
    /** Optional supplier-facing tooltip / hint string. */
    hint?: string
}
