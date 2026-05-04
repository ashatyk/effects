/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseProcessor } from './base-processor'
import {
    SLOT, type ProcessorDef, type IDataflowEngine,
    type AnimationSignal, type ChannelSignal, type EventSignal,
} from '../types'
import { applyEasing, type SwitchProfile, type SwitchSide } from './signal-switch'

export const animationSwitchDef: ProcessorDef = {
    type: 'animationSwitch',
    title: 'Animation Switch',
    category: 'animCtrl',
    inputs: [
        { name: 'animation_a', type: SLOT.ANIMATION, label: 'a' },
        { name: 'animation_b', type: SLOT.ANIMATION, label: 'b' },
        { name: 'event',       type: SLOT.EVENT,     label: 'event' },
    ],
    outputs: [{ name: 'animation', type: SLOT.ANIMATION }],
    defaultParams: {
        initialSide: 'a' as SwitchSide,
        transitionAbMs: 500,
        transitionBaMs: 500,
        profileAb: 'easeInOut' as SwitchProfile,
        profileBa: 'easeInOut' as SwitchProfile,
    },
}

const idleAnimation = (): AnimationSignal => ({ channels: {} })
const idleChannel = (): ChannelSignal => ({ time: 0, raw: 0, value: 0, state: 0 })

/** Snapshot of the live transition exposed for the NodeView preview. */
export interface AnimationSwitchSnapshot {
    currentSide: SwitchSide
    fromSide: SwitchSide
    alpha: number
    transitioning: boolean
    durationMs: number
    profile: SwitchProfile
    eventCount: number
    flippedThisFrame: boolean
    /** Sorted union of channel ids present on either side (or in the captured
     *  re-emit snapshot). Lets the view enumerate channels for a per-channel
     *  readout without re-walking the upstream packets. */
    channelIds: string[]
}

/**
 * Two-state cross-fade between ANIMATION `animation_a` and ANIMATION
 * `animation_b`, gated by a discrete EVENT on `event`. Each new event toggles
 * the currently-selected side (A↔B), starting a per-channel cross-fade with
 * the matching direction's duration + easing profile.
 *
 *   animation_a ─┐
 *                ├──► (event toggles side) ──► animation
 *   animation_b ─┘                ▲
 *                                 │
 *                              EVENT (EventEmitter / future event sources)
 *
 * Cross-fade is computed per channel and per scalar field (`time`, `raw`,
 * `value` are all lerped). `state` is the OR of from/to/upstream so a clip
 * mid-flight keeps downstream nodes ticking. Channels present on only one
 * side are lerped against an idle channel (`{ time:0, raw:0, value:0,
 * state:0 }`) so a side that publishes a subset of the controller pool
 * doesn't snap the missing channels.
 *
 * Re-emitting mid-morph captures the entire output `AnimationSignal` and
 * crossfades from that captured snapshot into the new target side — same
 * visual-continuity contract as `signalSwitch`, applied per channel.
 *
 * `alwaysDirty = true` because the morph clock is internal — the engine
 * has no other way of knowing the output is changing during a transition
 * when both upstream sides are momentarily quiet.
 */
export class AnimationSwitchProcessor extends BaseProcessor {
    readonly def = animationSwitchDef
    alwaysDirty = true

    /** Live state mirrored to the NodeView. */
    lastAnimation: AnimationSignal | null = null
    lastA: AnimationSignal | null = null
    lastB: AnimationSignal | null = null
    lastControl: EventSignal | null = null
    snapshot: AnimationSwitchSnapshot = {
        currentSide: 'a',
        fromSide: 'a',
        alpha: 1,
        transitioning: false,
        durationMs: 0,
        profile: 'easeInOut',
        eventCount: 0,
        flippedThisFrame: false,
        channelIds: [],
    }

    private currentSide: SwitchSide = 'a'
    private transitionStartMs = 0
    private transitionFromSide: SwitchSide = 'a'
    private transitionToSide: SwitchSide = 'a'
    private transitionDurationMs = 0
    private transitionProfile: SwitchProfile = 'easeInOut'
    /** Captured `output` at the moment a morph started. Used as the alpha=0
     *  endpoint when re-flipping mid-morph so we don't snap to a stale
     *  upstream value on any channel. */
    private transitionFromAnimation: AnimationSignal | null = null
    private transitionFromCaptured = false
    private lastSeenEventCount = -1
    private initialised = false

    execute(inputs: Record<string, any>, params: Record<string, any>, _engine: IDataflowEngine): Record<string, any> {
        const a: AnimationSignal = (inputs.animation_a as AnimationSignal | undefined) ?? idleAnimation()
        const b: AnimationSignal = (inputs.animation_b as AnimationSignal | undefined) ?? idleAnimation()
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
            /* Bootstrap event counter so a saved-and-restored graph (or one
               wired to a long-running EventEmitter) doesn't trigger a phantom
               flip on the very first execute. */
            this.lastSeenEventCount = ev?.count ?? 0
            this.initialised = true
        }

        const now = performance.now()
        let flippedThisFrame = false

        if (ev && ev.count > this.lastSeenEventCount) {
            this.lastSeenEventCount = ev.count
            const nextSide: SwitchSide = this.currentSide === 'a' ? 'b' : 'a'

            const wasTransitioning = this.transitionStartMs > 0
            /* Snapshot the *currently-visible* output (or the live from-side
               when settled) so a re-emit mid-morph crossfades from a frozen
               packet rather than snapping back to the stale upstream side. */
            const visibleAnim = this.lastAnimation ?? (this.currentSide === 'a' ? a : b)

            this.transitionFromSide = this.currentSide
            this.transitionToSide = nextSide
            this.transitionStartMs = now
            this.transitionDurationMs = nextSide === 'b' ? transitionAbMs : transitionBaMs
            this.transitionProfile = nextSide === 'b' ? profileAb : profileBa
            this.transitionFromAnimation = wasTransitioning ? cloneAnimation(visibleAnim) : null
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
                this.transitionFromAnimation = null
            } else {
                const t = (now - this.transitionStartMs) / dur
                if (t >= 1) {
                    shapedAlpha = 1
                    rawAlpha = 1
                    this.transitionStartMs = 0
                    this.transitionFromCaptured = false
                    this.transitionFromAnimation = null
                } else {
                    rawAlpha = t < 0 ? 0 : t
                    shapedAlpha = applyEasing(profile, rawAlpha)
                    transitioning = true
                }
            }
        }

        /* Build the channel-id union so a side that publishes fewer channels
           still surfaces every active channel from the other side (with the
           missing ones lerping against an idle channel rather than dropping). */
        const ids = new Set<string>()
        for (const k of Object.keys(a.channels)) ids.add(k)
        for (const k of Object.keys(b.channels)) ids.add(k)
        if (this.transitionFromCaptured && this.transitionFromAnimation) {
            for (const k of Object.keys(this.transitionFromAnimation.channels)) ids.add(k)
        }

        const out: AnimationSignal = { channels: {} }
        const fromSideAnim = this.transitionFromSide === 'a' ? a : b
        const toSideAnim   = this.transitionToSide   === 'a' ? a : b
        const useCaptured = this.transitionFromCaptured && this.transitionStartMs > 0 && this.transitionFromAnimation
        const fromAnim = useCaptured ? this.transitionFromAnimation! : fromSideAnim

        for (const id of ids) {
            const fromCh: ChannelSignal = fromAnim.channels[id] ?? idleChannel()
            const toCh: ChannelSignal = toSideAnim.channels[id] ?? idleChannel()
            const lerped: ChannelSignal = {
                time:  fromCh.time  + (toCh.time  - fromCh.time)  * shapedAlpha,
                raw:   fromCh.raw   + (toCh.raw   - fromCh.raw)   * shapedAlpha,
                value: fromCh.value + (toCh.value - fromCh.value) * shapedAlpha,
                /* Either-side state preserves "active clip" semantics through
                   the morph — important for shaders that gate behaviour on
                   `uChan{i}.w` (e.g. envelope-driven highlights). */
                state: ((fromCh.state | toCh.state) ? 1 : 0) as 0 | 1,
            }
            out.channels[id] = lerped
        }

        this.lastA = a
        this.lastB = b
        this.lastControl = ev
        this.lastAnimation = out
        this.snapshot = {
            currentSide: this.currentSide,
            fromSide: this.transitionFromSide,
            alpha: shapedAlpha,
            transitioning,
            durationMs: transitioning ? this.transitionDurationMs : 0,
            profile: this.transitionProfile,
            eventCount: this.lastSeenEventCount,
            flippedThisFrame,
            channelIds: Array.from(ids).sort((x, y) => Number(x) - Number(y)),
        }
        return { animation: out }
    }
}

function cloneAnimation(src: AnimationSignal): AnimationSignal {
    const channels: Record<string, ChannelSignal> = {}
    for (const [id, ch] of Object.entries(src.channels)) {
        channels[id] = { time: ch.time, raw: ch.raw, value: ch.value, state: ch.state }
    }
    return { channels }
}
