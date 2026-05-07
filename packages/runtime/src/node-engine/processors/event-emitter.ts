/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type EventSignal } from '../types'

export const eventEmitterDef: ProcessorDef = {
    type: 'eventEmitter',
    title: 'Event Emitter',
    category: 'animTrigger',
    inputs: [],
    outputs: [{ name: 'event', type: SLOT.EVENT }],
    defaultParams: {
        throttleMs: 0,
        /* Stable identifier the Tier-3 client uses to dispatch events
           programmatically. Required by the publish validator
           (`derivePublishedSurface` reports duplicates as a hard
           error). Default empty so the autogen path in
           `NodeEditor.addProcessorNode` mints a unique `evt_<n>` slug
           on creation; restored snapshots keep their persisted id
           verbatim so external glue code that pinned to it doesn't
           break across editor sessions. */
        id: '',
        /* Supplier-facing label. Optional — falls back to the node's
           `data.label` or the processor title when unset. */
        label: 'Event',
    },
}

/**
 * On-demand discrete event source. Emits an `EventSignal` with monotonically
 * growing `count` whenever any UI / external integration calls `emit()`.
 * Optional `throttleMs` rejects emits that arrive faster than the configured
 * interval — useful when the Emit button is bound to a keyboard shortcut or
 * driven from a tight loop.
 *
 * `alwaysDirty = true` so downstream consumers (`signalSwitch`, `envelope`)
 * see the freshest event-count every frame.
 */
export class EventEmitterProcessor extends BaseProcessor {
    readonly def = eventEmitterDef
    alwaysDirty = true

    state: EventSignal = { count: 0, lastTimestampMs: 0 }
    private lastEmitTime = 0
    private throttleMs = 0

    /** Programmatic API for any UI (Emit button, hotkey, external bridge) to
     *  push an event. Subject to the configured `throttleMs`. */
    emit(x?: number, y?: number): void {
        const now = performance.now()
        if (this.throttleMs > 0 && now - this.lastEmitTime < this.throttleMs) return
        this.lastEmitTime = now
        this.state = {
            count: this.state.count + 1,
            lastTimestampMs: now,
            lastX: x,
            lastY: y,
        }
    }

    execute(_inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        this.throttleMs = Math.max(0, Number(params.throttleMs ?? 0) || 0)
        return { event: { ...this.state } }
    }
}
