import type { ComponentType } from 'react'
import type { NodeSettingsProps } from './settings/types'

import { PreviewNodeActions } from './settings/PreviewNodeActions'

/**
 * Per-processor right-rail **Actions** panes — export-style buttons
 * (Save image, Download mask, Copy contour as JSON, etc.) that
 * trigger side-effects against the running engine but do NOT mutate
 * scene state. Kept apart from `pipelineNodeSettings` so the
 * inspector can render them under a dedicated `Actions` heading
 * instead of misleadingly bundling them with editable parameters.
 *
 * Contract mirrors `pipelineNodeSettings`: same `NodeSettingsProps`
 * shape, same `(id, data)` slice, same engine-context plumbing
 * (each entry can call `useEngine()` / `useNodeOutputs(id)` /
 * `useScene()`). Components are responsible for their own internal
 * layout; the surrounding `SectionBlock` supplies padding + heading.
 *
 * A processor present in this registry but absent from
 * `pipelineNodeSettings` still renders cleanly — `PublishInspector`
 * skips the empty `Parameters` section in that case rather than
 * showing the "no editable parameters" hint above an Actions block
 * that clearly contradicts it.
 *
 * Add new entries when a node grows an export / snapshot / reset
 * action that would otherwise pollute its `*NodeSettings` pane.
 */
export const pipelineNodeActions: Record<string, ComponentType<NodeSettingsProps>> = {
    preview: PreviewNodeActions,
}
