/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type Signal, type EventSignal } from '../types'

/**
 * Easing curve applied to the crossfade alpha during a transition.
 * `instant` skips the morph and snaps the output to the new side immediately.
 */
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

/** Snapshot of the live transition exposed for the NodeView preview. */
export interface SwitchSnapshot {
    /** Side currently selected after the latest event. Target of any in-flight morph. */
    currentSide: SwitchSide
    /** Side the morph is fading *from*. Equal to `currentSide` when settled. */
    fromSide: SwitchSide
    /** Cross-fade alpha in [0, 1]. 1 when settled at `currentSide`. */
    alpha: number
    /** True while a morph is in progress (alpha < 1). */
    transitioning: boolean
    /** Duration of the active transition in ms (0 when settled). */
    durationMs: number
    /** Profile used for the active transition (or the most recent one). */
    profile: SwitchProfile
    /** Monotonic event counter observed on the event input — exposed so the
     *  view can show how many flips have happened. */
    eventCount: number
    /** True for exactly the frame on which a flip happened — the view uses
     *  this to draw a spike marker on the scope. */
    flippedThisFrame: boolean
}

/**
 * Two-state cross-fade between SIGNAL `signal_a` and SIGNAL `signal_b`,
 * gated by a discrete EVENT on `event`. Each new event toggles the
 * currently-selected side (A↔B), starting a cross-fade with the matching
 * direction's duration + easing profile. So an A→B fade can rush in fast
 * with `easeOut` while a B→A return rolls back slowly with `easeInOut`.
 *
 *   signal_a ─┐
 *             ├──► (event toggles side) ──► signal
 *   signal_b ─┘                ▲
 *                              │
 *                            EVENT (EventEmitter / future event sources)
 *
 * Output during a morph is `lerp(fromSide.value, toSide.value, shapedAlpha)`
 * and `toSide.value` once the morph completes — both inputs keep evolving
 * while the cross-fade is in flight (true cross-fade, not freeze + ramp).
 *
 * Re-emitting mid-morph immediately toggles back and starts a fresh
 * transition from the current `output` value (no queueing). This keeps a
 * rapid double-emit from desyncing — the second event always lands on the
 * currently-visible value rather than ghosting through to the "true" target.
 *
 * `alwaysDirty = true` because the morph clock is internal to this node —
 * the engine has no other way of knowing the output is changing during a
 * transition when both upstream signals are momentarily quiet.
 */
export class SignalSwitchProcessor extends BaseProcessor {
    readonly def = signalSwitchDef
    alwaysDirty = true

    /** Live state mirrored to the NodeView. */
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
    /** 0 when settled. `performance.now()` of the moment a morph began. */
    private transitionStartMs = 0
    private transitionFromSide: SwitchSide = 'a'
    private transitionToSide: SwitchSide = 'a'
    private transitionDurationMs = 0
    private transitionProfile: SwitchProfile = 'easeInOut'
    /** Captured `output.value` at the moment a morph started. Used as the
     *  alpha=0 endpoint when re-flipping mid-morph so we don't snap to a
     *  stale upstream value. */
    private transitionFromValue = 0
    /** True when the active morph crossfades from a captured constant
     *  (a re-flip mid-morph), false when it crossfades from the live
     *  upstream value of the from-side. */
    private transitionFromCaptured = false
    /** Last seen event count — increment by one means a new event this frame. */
    private lastSeenEventCount = -1
    /** First-execute guard so we don't synthesize a spurious morph from the
     *  zero-default `currentSide` to whatever `initialSide` says. */
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
            /* Bootstrap event counter from the input so a saved-and-restored
               graph (or one connected to a long-running EventEmitter) doesn't
               trigger a phantom flip on the very first execute. */
            this.lastSeenEventCount = ev?.count ?? 0
            this.initialised = true
        }

        const now = performance.now()
        let flippedThisFrame = false

        /* React to a new event: toggle side and start a fresh transition.
           Multiple events queued up between executes still count as a single
           flip (the count moved by N → we still toggle once, because the
           net parity matters less than visual continuity). */
        if (ev && ev.count > this.lastSeenEventCount) {
            this.lastSeenEventCount = ev.count
            const nextSide: SwitchSide = this.currentSide === 'a' ? 'b' : 'a'

            /* Capture the currently-visible output value so a re-emit mid-
               morph doesn't snap back to a stale upstream value. The new
               cross-fade will go from this captured constant to the live
               value of the new target side. */
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

        /* Crossfade endpoints. When `transitionFromCaptured` is set the
           from-side is a frozen value captured at flip time (avoids snapping
           when the user re-emits mid-morph); otherwise it's the live
           upstream value of the from-side, so both inputs continue to
           evolve through the morph. */
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

/**
 * Sample the cross-fade easing at `t ∈ [0, 1]`. Exported so the NodeView
 * can preview both A→B and B→A profile curves without re-deriving the
 * formulas. `instant` returns 1 for any `t > 0`.
 */
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
