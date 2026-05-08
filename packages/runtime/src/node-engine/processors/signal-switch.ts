/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal, type EventSignal } from '../types'

// `instant` snaps to the target side without crossfading.
export type SwitchProfile =
    | 'instant'
    | 'linear'
    | 'easeIn'
    | 'easeOut'
    | 'easeInOut'
    | 'smoothstep'
    | 'sine'

export type SwitchSide = 'a' | 'b'

export const signalSwitchDef: ProcessorDef = {
    type: 'signalSwitch',
    title: 'Signal Switch',
    category: 'animMod',
    inputs: [
        { name: 'signal_a', type: SLOT.SIGNAL, label: 'a' },
        { name: 'signal_b', type: SLOT.SIGNAL, label: 'b' },
        { name: 'event',    type: SLOT.EVENT,  label: 'event' },
    ],
    outputs: [{ name: 'signal', type: SLOT.SIGNAL }],
    defaultParams: {
        initialSide: 'a' as SwitchSide,
        transitionAbMs: 500,
        transitionBaMs: 500,
        profileAb: 'easeInOut' as SwitchProfile,
        profileBa: 'easeInOut' as SwitchProfile,
    },
}

const idleSignal = (): Signal => ({ value: 0, time: 0, age: 0, state: 0, lastTimestampMs: 0 })

export interface SwitchSnapshot {
    currentSide: SwitchSide
    fromSide: SwitchSide
    alpha: number
    transitioning: boolean
    durationMs: number
    profile: SwitchProfile
    eventCount: number
    // True only on the frame the flip happened (used to draw a spike marker).
    flippedThisFrame: boolean
}

// True cross-fade (both inputs keep evolving), not freeze + ramp. Re-emitting mid-
// morph captures the currently-visible value as the new from-endpoint so a rapid
// double-emit can't ghost through to a stale upstream target.
// alwaysDirty: the morph clock is internal — the engine has no other way to
// know the output is changing while both inputs are momentarily quiet.
export class SignalSwitchProcessor extends BaseProcessor {
    readonly def = signalSwitchDef
    alwaysDirty = true

    lastSignal: Signal | null = null
    lastA: Signal | null = null
    lastB: Signal | null = null
    lastControl: EventSignal | null = null
    snapshot: SwitchSnapshot = {
        currentSide: 'a',
        fromSide: 'a',
        alpha: 1,
        transitioning: false,
        durationMs: 0,
        profile: 'easeInOut',
        eventCount: 0,
        flippedThisFrame: false,
    }

    private currentSide: SwitchSide = 'a'
    // 0 when settled.
    private transitionStartMs = 0
    private transitionFromSide: SwitchSide = 'a'
    private transitionToSide: SwitchSide = 'a'
    private transitionDurationMs = 0
    private transitionProfile: SwitchProfile = 'easeInOut'
    // Captured output.value at flip time; used as the from-endpoint while
    // transitionFromCaptured is true (set on re-flips mid-morph).
    private transitionFromValue = 0
    private transitionFromCaptured = false
    private lastSeenEventCount = -1
    // Avoids a spurious morph from the default currentSide to initialSide on first execute.
    private initialised = false

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const a: Signal = (inputs.signal_a as Signal | undefined) ?? idleSignal()
        const b: Signal = (inputs.signal_b as Signal | undefined) ?? idleSignal()
        const ev = (inputs.event as EventSignal | undefined) ?? null

        const transitionAbMs = Math.max(0, Number(params.transitionAbMs ?? 500))
        const transitionBaMs = Math.max(0, Number(params.transitionBaMs ?? 500))
        const profileAb = (params.profileAb ?? 'easeInOut') as SwitchProfile
        const profileBa = (params.profileBa ?? 'easeInOut') as SwitchProfile
        const initialSide = (params.initialSide ?? 'a') as SwitchSide

        if (!this.initialised) {
            this.currentSide = initialSide
            this.transitionFromSide = initialSide
            this.transitionToSide = initialSide
            // Bootstrap from upstream count so a restored graph / long-running EventEmitter
            // doesn't trigger a phantom flip on first execute.
            this.lastSeenEventCount = ev?.count ?? 0
            this.initialised = true
        }

        const now = performance.now()
        let flippedThisFrame = false

        // N events queued between executes still count as one flip (visual continuity > parity).
        if (ev && ev.count > this.lastSeenEventCount) {
            this.lastSeenEventCount = ev.count
            const nextSide: SwitchSide = this.currentSide === 'a' ? 'b' : 'a'

            const wasTransitioning = this.transitionStartMs > 0
            const visibleValue = this.lastSignal?.value ?? (this.currentSide === 'a' ? a.value : b.value)

            this.transitionFromSide = this.currentSide
            this.transitionToSide = nextSide
            this.transitionStartMs = now
            this.transitionDurationMs = nextSide === 'b' ? transitionAbMs : transitionBaMs
            this.transitionProfile = nextSide === 'b' ? profileAb : profileBa
            this.transitionFromValue = visibleValue
            this.transitionFromCaptured = wasTransitioning
            this.currentSide = nextSide
            flippedThisFrame = true
        }

        let rawAlpha = 1
        let shapedAlpha = 1
        let transitioning = false

        if (this.transitionStartMs > 0) {
            const dur = this.transitionDurationMs
            const profile = this.transitionProfile
            if (dur <= 0 || profile === 'instant') {
                shapedAlpha = 1
                rawAlpha = 1
                this.transitionStartMs = 0
                this.transitionFromCaptured = false
            } else {
                const t = (now - this.transitionStartMs) / dur
                if (t >= 1) {
                    shapedAlpha = 1
                    rawAlpha = 1
                    this.transitionStartMs = 0
                    this.transitionFromCaptured = false
                } else {
                    rawAlpha = t < 0 ? 0 : t
                    shapedAlpha = applyEasing(profile, rawAlpha)
                    transitioning = true
                }
            }
        }

        // transitionFromCaptured: from-endpoint is the frozen value at flip time
        // (re-flip mid-morph); otherwise both inputs evolve through the morph.
        const fromVal = this.transitionFromCaptured && this.transitionStartMs > 0
            ? this.transitionFromValue
            : (this.transitionFromSide === 'a' ? a.value : b.value)
        const toVal = this.transitionToSide === 'a' ? a.value : b.value
        const value = fromVal + (toVal - fromVal) * shapedAlpha

        const upstreamActive = a.state === 1 || b.state === 1
        const state: 0 | 1 = upstreamActive || transitioning ? 1 : 0

        const lastTimestampMs = Math.max(
            a.lastTimestampMs,
            b.lastTimestampMs,
            ev?.lastTimestampMs ?? 0,
        )
        const time = Math.max(a.time, b.time)
        const age = Math.min(
            a.age || Number.POSITIVE_INFINITY,
            b.age || Number.POSITIVE_INFINITY,
        )

        const signal: Signal = {
            value,
            time,
            age: Number.isFinite(age) ? age : 0,
            state,
            lastTimestampMs,
        }

        this.lastA = a
        this.lastB = b
        this.lastControl = ev
        this.lastSignal = signal
        this.snapshot = {
            currentSide: this.currentSide,
            fromSide: this.transitionFromSide,
            alpha: shapedAlpha,
            transitioning,
            durationMs: transitioning ? this.transitionDurationMs : 0,
            profile: this.transitionProfile,
            eventCount: this.lastSeenEventCount,
            flippedThisFrame,
        }
        return { signal }
    }
}

// Exported so the NodeView can preview both A→B and B→A profile curves.
export function applyEasing(profile: SwitchProfile, t: number): number {
    if (!Number.isFinite(t)) return 0
    if (t <= 0) return 0
    if (t >= 1) return 1
    switch (profile) {
        case 'instant':    return 1
        case 'linear':     return t
        case 'easeIn':     return t * t
        case 'easeOut':    return 1 - (1 - t) * (1 - t)
        case 'easeInOut':  return 0.5 - 0.5 * Math.cos(Math.PI * t)
        case 'smoothstep': return t * t * (3 - 2 * t)
        case 'sine':       return Math.sin(t * Math.PI * 0.5)
    }
}
