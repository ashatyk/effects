import type { ComponentType } from 'react'
import type { NodeSettingsProps } from './settings/types'

import { PreviewNodeActions } from './settings/PreviewNodeActions'
import { EventEmitterNodeActions } from './settings/EventEmitterNodeActions'
import { TapZoneNodeActions } from './settings/TapZoneNodeActions'
import { ConfigNodeActions } from './settings/ConfigNodeActions'

// Side-effect buttons (export/snapshot/reset). Same contract as pipelineNodeSettings; kept separate
// so the inspector renders them under a dedicated "Actions" heading.
export const pipelineNodeActions: Record<string, ComponentType<NodeSettingsProps>> = {
    preview: PreviewNodeActions,
    eventEmitter: EventEmitterNodeActions,
    tapZone: TapZoneNodeActions,
    config: ConfigNodeActions,
}
