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
        // `id` is the Tier-3 dispatch slug; derivePublishedSurface reports duplicates as
        // a hard error. Empty default lets NodeEditor mint a unique evt_<n>; restored
        // snapshots keep their persisted id verbatim.
        id: '',
        // Supplier-facing label; falls back to data.label or the processor title.
        label: 'Event',
    },
}

// alwaysDirty so signalSwitch/envelope see the freshest event-count each frame.
export class EventEmitterProcessor extends BaseProcessor {
    readonly def = eventEmitterDef
    alwaysDirty = true

    state: EventSignal = { count: 0, lastTimestampMs: 0 }
    private lastEmitTime = 0
    private throttleMs = 0

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
