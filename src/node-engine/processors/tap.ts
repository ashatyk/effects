/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type PulseSignal } from '../types'

export const tapDef: ProcessorDef = {
    type: 'tap',
    title: 'Tap',
    category: 'animTrigger',
    inputs: [],
    outputs: [{ name: 'pulse', type: SLOT.PULSE }],
    defaultParams: {
        throttleMs: 50,
    },
}

/**
 * Discrete pulse source — emits a `PulseSignal` with monotonically growing
 * `count` whenever the user clicks the canvas (or fires the dev "Fire" button
 * via shared state). Throttled to avoid double-fires from touch noise.
 *
 * The processor subscribes to `pointerdown` on `engine.app.canvas` lazily on
 * the first execute (when the engine reference is available). The handler is
 * shared with any UI that pokes `tapState.synthetic` to inject programmatic
 * pulses (used by the NodeView Fire button).
 */
export class TapProcessor extends BaseProcessor {
    readonly def = tapDef
    alwaysDirty = true

    private state: PulseSignal = { count: 0, lastTimestampMs: 0 }
    private subscribed = false
    private lastFireTime = 0
    private detach: (() => void) | null = null

    /** Per-instance event API: anything (a NodeView, an external integration) can
     *  push a pulse without touching the DOM. */
    fireSynthetic(x?: number, y?: number): void {
        const now = performance.now()
        const throttle = 0
        if (now - this.lastFireTime < throttle) return
        this.lastFireTime = now
        this.state = {
            count: this.state.count + 1,
            lastTimestampMs: now,
            lastX: x,
            lastY: y,
        }
    }

    private subscribeOnce(engine: IDataflowEngine, throttleMs: number): void {
        if (this.subscribed) return
        const canvas = engine.app.canvas as HTMLCanvasElement | undefined
        if (!canvas) return
        const handler = (ev: PointerEvent) => {
            const now = performance.now()
            if (now - this.lastFireTime < throttleMs) return
            this.lastFireTime = now
            const rect = canvas.getBoundingClientRect()
            const sx = canvas.width  / Math.max(1, rect.width)
            const sy = canvas.height / Math.max(1, rect.height)
            this.state = {
                count: this.state.count + 1,
                lastTimestampMs: now,
                lastX: (ev.clientX - rect.left) * sx,
                lastY: (ev.clientY - rect.top)  * sy,
            }
            engine.markDirty(this.nodeId)
        }
        canvas.addEventListener('pointerdown', handler)
        this.detach = () => canvas.removeEventListener('pointerdown', handler)
        this.subscribed = true
    }

    execute(_inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const throttleMs = Math.max(0, Number(params.throttleMs ?? 50) || 0)
        this.subscribeOnce(engine, throttleMs)
        return { pulse: { ...this.state } }
    }

    destroy(): void {
        super.destroy()
        if (this.detach) { this.detach(); this.detach = null }
        this.subscribed = false
    }
}
