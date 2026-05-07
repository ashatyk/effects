/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Buffer, BufferUsage, Container, Geometry, Mesh, Shader, Texture, UniformGroup,
} from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type ContourSamples, type AnimationSignal, type ChannelSignal, type PassMetric, type EffectMetrics } from '../types'
import { effects } from '../../effects'
import { buildUniformEntries } from '../../pipeline/uniforms'
import { DEFAULT_VERTEX } from '../../pipeline/default-vertex'
import {
    ANIMATION_CHANNEL_COUNT,
    TEXTURE_CHANNEL_COUNT,
    type EffectPass, type InstancedPass, type PerInstanceAttr, type PlaygroundConfig,
} from '../../pipeline/types'
import { type InstanceStreams, resampleContourRibbon, resampleContourScrolling, streamsFromContour } from '../render/instanced-mesh'

/* Effect node inputs:
     • `source`     — the bitmap the effect modulates (uDiffuse).
     • `txcn0..7`   — eight generic texture channels. Each effect manifest
                      declares which of those slots it reads via
                      `PlaygroundConfig.textures.slots`, with a label that
                      the node UI surfaces next to the handle (similar to
                      how AnimationController shows animation slot names).
                      Shaders bind the channels they consume by declaring
                      `uniform sampler2D uTxcn{i};`. Unconnected slots
                      fall back to a 1×1 white texture so the sampler is
                      always safe to read.
     • `contour`    — resampled SoA polyline used by instanced passes.
     • `pivot`      — 2D point in pixel space (matching the canvas
                      resolution). Bound as `uPivot: vec2<f32>` for shaders
                      that need a focal point (radial / centred effects,
                      anchored animations, gravity origins, ...). When no
                      pivot is wired, defaults to the contour's AABB centre
                      if a contour is connected, else the canvas centre.
                      `uPivotEnabled: f32` exposes whether the user
                      explicitly drove the value (1.0) vs the runtime fell
                      back to a default (0.0).
     • `animation`  — multi-channel signal driving uChan{i} uniforms.
     • `config`     — picks the active manifest from the Config node. */
export const effectDef: ProcessorDef = {
    type: 'effect',
    title: 'Effect',
    category: 'output',
    inputs: [
        { name: 'source', type: SLOT.TEXTURE, label: 'source' },
        ...Array.from({ length: TEXTURE_CHANNEL_COUNT }, (_, i) => ({
            name: `txcn${i}`,
            type: SLOT.TEXTURE,
            label: `txcn${i}`,
        })),
        { name: 'contour', type: SLOT.CONTOUR, label: 'contour' },
        { name: 'pivot', type: SLOT.VEC, label: 'pivot' },
        { name: 'animation', type: SLOT.ANIMATION, label: 'animation' },
        { name: 'config', type: SLOT.CONFIG },
    ],
    /* `metrics` carries per-pass CPU build timing and total GPU dispatch
       time, refreshed every frame. Wire it into a Log node to see where
       a frame's budget is spent. */
    outputs: [
        { name: 'texture', type: SLOT.TEXTURE },
        { name: 'metrics', type: SLOT.METRICS },
    ],
    defaultParams: {},
}

interface ResourceContext {
    inputs: Record<string, any>
    width: number
    height: number
    fallback: any
    engine: IDataflowEngine
}

/**
 * Per-pass cached GPU resources. Built once when the active effect or the
 * canvas resolution changes; reused every frame.
 *
 * What is NOT cached on purpose: the per-pass `Shader` + `Mesh`. Pixi v8's
 * GL renderer generates a per-program "sync function" the first time it
 * sees a new shader and caches it globally by `glProgram._key`. The
 * generated code captures the resource layout at the time of generation,
 * so mutating `shader.resources.<sampler> = newSrc` after the fact is
 * brittle (works in some paths, silently no-ops in others). Re-creating
 * the Shader + Mesh per frame is cheap — `Shader.from` hits Pixi's
 * internal program cache and returns a fresh wrapper around the
 * already-compiled GL program. The bind groups are rebuilt from a fresh
 * resources record that points at the actual current `inp.source` /
 * `inp.txcn{i}` references, so samplers are always accurate.
 *
 * The expensive items below stay cached:
 *   - `Geometry` (instanced only — fullscreen uses engine.getQuadGeometry).
 *   - Per-vertex `aLocal` + `indexBuffer` Buffers (manifest-derived).
 *   - Per-instance Buffers (positions, tangents, arcS, *Next, index) —
 *     updated in place via `Buffer.setDataWithSize` instead of being
 *     rebuilt on each frame.
 *   - Sampler-name set parsed from the shader source (avoids re-scanning
 *     GLSL with regex every frame).
 */
interface PassCache {
    /** Set of sampler names declared in this pass's shader sources. */
    samplers: Set<string>
    /** Instanced-only: owned Geometry whose attributes wrap our buffers. */
    geometry?: Geometry
    /** Instanced-only: per-vertex `aLocal` + index buffer (static). */
    perVertexBuffer?: Buffer
    indexBuffer?: Buffer
    /** Instanced-only: per-instance buffers keyed by attribute name. */
    instanceBuffers?: Map<string, Buffer>
    /** Instanced-only: count the GPU buffers were last sized for. */
    instanceCount: number
    /** True for fullscreen passes — informs invalidation/destroy logic. */
    fullscreen: boolean
}

export class EffectProcessor extends BaseProcessor {
    readonly def = effectDef
    /* Intentionally NOT alwaysDirty. Effect re-renders only when something
       upstream actually changes:
         - any wired alwaysDirty source (Timer / EventEmitter / Envelope /
           Combine / SignalSwitch / AnimationController / AnimationSwitch)
           BFS-marks Effect dirty every tick that it ticks, so animated
           scenes keep ticking exactly as before;
         - param edits / wire changes flow through the same
           `markDirty` propagation;
         - the upstream image / contour producers mark their own dirty
           when their async resources arrive, propagating downstream.
       Effect itself sleeps when nothing in its dependency tree moved —
       a static "image -> sdf -> effect" scene now costs zero per-frame
       work instead of dispatching the same identical RT 60 times/s. */

    private cachedEffectName: string | null = null

    /* Cache keyed by `${effectName}|${w}x${h}`. Changing the active effect
       or the canvas resolution destroys the cache and rebuilds. Phase /
       parameter / animation changes never invalidate — they flow through
       in-place uniform / buffer updates. */
    private cacheKey: string | null = null
    private stage: Container | null = null
    private uniforms: UniformGroup | null = null
    private passCache: Map<string, PassCache> = new Map()

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const tStart = performance.now()
        const configData = inputs.config as Record<string, any> | null
        if (configData?.__effectName) {
            this.cachedEffectName = configData.__effectName as string
        }
        const effectName = this.cachedEffectName ?? effects[0]?.name ?? ''
        const config = effects.find(e => e.name === effectName) ?? effects[0]
        if (!config) return { texture: null, metrics: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const rt = this.ensureRT(w, h)

        const ctx: ResourceContext = {
            inputs,
            width: w,
            height: h,
            fallback: Texture.WHITE.source,
            engine,
        }

        /* Invalidate per-pass cache if the active effect or the canvas
           dimensions changed. Otherwise everything is reused. */
        const nextKey = `${config.name}|${w}x${h}`
        if (this.cacheKey !== nextKey) {
            this.invalidateCache()
            this.cacheKey = nextKey
            this.uniforms = this.buildUniformGroup(config, ctx)
        }
        if (!this.stage) this.stage = new Container()
        const stage = this.stage
        const uniforms = this.uniforms!

        this.refreshUniforms(uniforms, config, configData, ctx)
        this.warnUndeclaredChannels(config)

        /* Stage child list is rebuilt every frame. `removeChildren` only
           unparents — the per-frame Meshes get destroyed below after
           render. Container itself stays cached across frames. */
        stage.removeChildren()

        const passMetrics: PassMetric[] = []
        const ephemeralMeshes: Mesh<Geometry, Shader>[] = []
        for (const pass of config.passes) {
            if (!passInputsSatisfied(pass, inputs)) {
                passMetrics.push({ id: pass.id, kind: pass.kind, cpuMs: 0, skipped: true })
                continue
            }
            const tPass = performance.now()
            let cpuMs = 0
            try {
                const cache = this.ensurePassCache(pass, ctx)
                if (pass.kind === 'instanced' && cache.geometry) {
                    this.refreshInstancedStreams(pass, cache, ctx, configData, params)
                }
                const mesh = this.buildPassMesh(pass, cache, ctx, uniforms)
                if (mesh) {
                    mesh.blendMode = pass.blend === 'add' ? 'add' : 'normal'
                    stage.addChild(mesh)
                    ephemeralMeshes.push(mesh)
                }
                cpuMs = performance.now() - tPass
            } catch (e) {
                cpuMs = performance.now() - tPass
                console.warn(`[EffectProcessor] pass "${pass.id}" failed:`, e)
            }
            passMetrics.push({ id: pass.id, kind: pass.kind, cpuMs, skipped: false })
        }

        const tDispatch = performance.now()
        engine.app.renderer.render({
            container: stage,
            target: rt,
            clear: true,
        })
        const gpuDispatchMs = performance.now() - tDispatch

        /* Tear down per-frame Mesh + Shader wrappers. The cached Geometry
           and Buffers stay — `geometry: false, texture: false,
           textureSource: false` keeps Pixi from cascading into them.
           
           CRITICAL: `mesh.destroy()` does NOT destroy the Shader
           (shaders can be shared between meshes — Pixi has no way of
           knowing it's the only owner). Each frame we build a fresh
           Shader.from({ resources }) that allocates its own owned
           BindGroup(s) holding GL state for sampler / texture /
           uniform-buffer bindings. Without explicit shader.destroy()
           those BindGroups accumulate indefinitely — heap snapshots
           on a 2-effect scene running for a few minutes show 90k+
           BindGroup instances (multi-GB GPU memory). The
           `destroyPrograms: false` arg keeps the GL program itself
           alive (it's cached globally by source, shared across
           every frame's Shader wrapper) so we don't pay the
           per-frame compile cost. */
        for (let i = 0; i < ephemeralMeshes.length; i++) {
            const mesh = ephemeralMeshes[i]
            const shader = mesh.shader as Shader | null | undefined
            mesh.destroy({ children: false, texture: false, textureSource: false })
            shader?.destroy(false)
        }

        const totalMs = performance.now() - tStart
        const cpuMs = passMetrics.reduce((acc, p) => acc + p.cpuMs, 0)
        const metrics: EffectMetrics = {
            effectName: config.name,
            totalMs,
            cpuMs,
            gpuDispatchMs,
            passes: passMetrics,
            timestampMs: tStart,
        }
        return { texture: rt.source, metrics }
    }

    /* ───────── Pass cache lifecycle ───────── */

    /**
     * Build (or retrieve) the cached non-shader resources for a pass:
     * the sampler-name set and, for instanced passes, the Geometry plus
     * its static aLocal/index buffers and the slot for per-instance
     * Buffers. For fullscreen passes the cache only carries the sampler
     * names — the geometry comes from `engine.getQuadGeometry` per frame.
     */
    private ensurePassCache(pass: EffectPass, _ctx: ResourceContext): PassCache {
        const cached = this.passCache.get(pass.id)
        if (cached) return cached

        /* Discover the sampler names declared by this pass's shader sources
           once — used to bind only resources the program actually expects
           when assembling the per-frame resources record. */
        const samplers = new Set<string>()
        collectSamplers(pass.fragment, samplers)
        if ('vertex' in pass && pass.vertex) collectSamplers(pass.vertex, samplers)

        if (pass.kind === 'fullscreen') {
            const cache: PassCache = {
                samplers,
                instanceCount: 0,
                fullscreen: true,
            }
            this.passCache.set(pass.id, cache)
            return cache
        }

        /* Instanced pass — own the per-vertex aLocal buffer + index buffer
           (manifest-derived, immutable) plus a Geometry that
           `refreshInstancedStreams` will append per-instance attributes
           onto when the streams arrive. */
        const local = new Float32Array(pass.geometry.perVertex.aLocal.length * 2)
        for (let i = 0; i < pass.geometry.perVertex.aLocal.length; i++) {
            local[i * 2] = pass.geometry.perVertex.aLocal[i][0]
            local[i * 2 + 1] = pass.geometry.perVertex.aLocal[i][1]
        }
        const perVertexBuffer = new Buffer({
            data: local,
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
        })
        const indexBuffer = new Buffer({
            data: new Uint16Array(pass.geometry.indexBuffer),
            usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
        })
        const geometry = new Geometry({
            attributes: {
                aLocal: { buffer: perVertexBuffer, format: 'float32x2' },
            },
            indexBuffer,
            topology: 'triangle-list',
            instanceCount: 0,
        })
        const cache: PassCache = {
            samplers,
            geometry,
            perVertexBuffer,
            indexBuffer,
            instanceBuffers: new Map(),
            instanceCount: 0,
            fullscreen: false,
        }
        this.passCache.set(pass.id, cache)
        return cache
    }

    /**
     * Build a fresh per-frame Mesh + Shader for the pass. The Shader's
     * underlying GL program is cached internally by Pixi (keyed by GLSL
     * source), so reconstruction only allocates a thin wrapper + a fresh
     * BindGroup. The fresh resources record points directly at the
     * current-frame textures, which avoids the brittle path of mutating
     * `shader.resources.<sampler>` on a cached Shader where Pixi's
     * generated per-program sync function may have captured stale state.
     *
     * Returns `null` for instanced passes whose contour produced zero
     * instances (no geometry to draw).
     */
    private buildPassMesh(
        pass: EffectPass,
        cache: PassCache,
        ctx: ResourceContext,
        uniforms: UniformGroup,
    ): Mesh<Geometry, Shader> | null {
        const inp = ctx.inputs
        const resources: Record<string, any> = { uniforms }
        if (cache.samplers.has('uDiffuse')) {
            resources.uDiffuse = inp.source ?? ctx.fallback
        }
        for (let i = 0; i < TEXTURE_CHANNEL_COUNT; i++) {
            const name = `uTxcn${i}`
            if (cache.samplers.has(name)) {
                resources[name] = inp[`txcn${i}`] ?? ctx.fallback
            }
        }
        const shader = Shader.from({
            gl: { vertex: 'vertex' in pass && pass.vertex ? pass.vertex : DEFAULT_VERTEX, fragment: pass.fragment },
            resources: resources as any,
        })
        if (cache.fullscreen) {
            const geo = ctx.engine.getQuadGeometry(ctx.width, ctx.height)
            return new Mesh<Geometry, Shader>({ geometry: geo, shader })
        }
        if (!cache.geometry || cache.instanceCount === 0) return null
        return new Mesh<Geometry, Shader>({ geometry: cache.geometry, shader })
    }

    /**
     * Recompute per-instance streams (positions/tangents/arcS, ribbon's
     * *Next siblings, optional 'index' attr) and upload them to the cached
     * GPU buffers. When the instance count changes (e.g. contour totalLength
     * or scrolling spacing changed), buffers are resized via
     * `setDataWithSize` — Pixi reallocates the GPU buffer in place when
     * possible. The `aLocal` + index buffers stay untouched.
     */
    private refreshInstancedStreams(
        pass: EffectPass,
        cache: PassCache,
        ctx: ResourceContext,
        configData: Record<string, any> | null,
        params: Record<string, any>,
    ): void {
        if (pass.kind !== 'instanced' || !cache.geometry || !cache.instanceBuffers) return

        const contour = ctx.inputs.contour as ContourSamples | null
        if (!contour || contour.count === 0) {
            cache.geometry.instanceCount = 0
            cache.instanceCount = 0
            return
        }

        let streams: InstanceStreams
        if (pass.scrolling) {
            const animation = ctx.inputs.animation as AnimationSignal | null
            const phaseSlot = pass.scrolling.phaseSlot ?? 0
            const phase = animation?.channels?.[String(phaseSlot)]?.value ?? 0
            if (pass.scrolling.mode === 'ribbon') {
                const segSize = pass.scrolling.segmentSizeField
                    ? Math.max(2, this.readScalar(configData, params, pass.scrolling.segmentSizeField, 8))
                    : 8
                streams = resampleContourRibbon(contour, segSize, phase)
            } else {
                const spacing = this.resolveSpacing(pass.scrolling, configData, params, contour.totalLength)
                streams = resampleContourScrolling(contour, spacing, phase)
            }
        } else {
            streams = streamsFromContour(contour)
        }

        if (streams.count === 0) {
            cache.geometry.instanceCount = 0
            cache.instanceCount = 0
            return
        }

        for (const m of pass.geometry.perInstance.map) {
            const data = perInstanceData(m, streams)
            if (!data) continue
            const isVec2 = m.from === 'positions' || m.from === 'tangents'
                || m.from === 'positionsNext' || m.from === 'tangentsNext'
            this.uploadInstanceAttribute(cache, m, data, isVec2)
        }

        cache.geometry.instanceCount = streams.count
        cache.instanceCount = streams.count
    }

    private uploadInstanceAttribute(
        cache: PassCache,
        m: PerInstanceAttr,
        data: Float32Array,
        isVec2: boolean,
    ): void {
        if (!cache.geometry || !cache.instanceBuffers) return
        let buf = cache.instanceBuffers.get(m.name)
        if (!buf) {
            buf = new Buffer({
                data,
                usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
                /* `shrinkToFit: false` keeps the underlying GPU buffer when
                   the new instance count is smaller than the previous one —
                   common when the contour totalLength dips between frames.
                   Avoids destroy-and-realloc churn at the cost of a tiny bit
                   of extra GPU memory. */
                shrinkToFit: false,
            })
            cache.instanceBuffers.set(m.name, buf)
            cache.geometry.addAttribute(m.name, {
                buffer: buf,
                format: isVec2 ? 'float32x2' : 'float32',
                instance: true,
            })
            return
        }
        buf.setDataWithSize(data, data.length, true)
    }

    /* ───────── Uniforms ───────── */

    private buildUniformGroup(config: PlaygroundConfig, ctx: ResourceContext): UniformGroup {
        const entries = buildUniformEntries(config.fields, ctx.width, ctx.height, config.staticUniforms)

        for (let i = 0; i < TEXTURE_CHANNEL_COUNT; i++) {
            entries[`uTxcn${i}Enabled`] = { value: 0.0, type: 'f32' }
            entries[`uTxcn${i}Aspect`] = { value: 1.0, type: 'f32' }
        }
        /* Animation channels: the entire pool (size = ANIMATION_CHANNEL_COUNT)
           is bound as `uChan{i}` uniforms of type `vec4(drive, raw, value, state)`.
           Every shader can opt into any slot regardless of whether the manifest
           mentions it explicitly — unused slots get an idle ChannelSignal
           (time=0, raw=0, value=slot's defaultMin or 0, state=0).
           Component contract:
              .x = upstream Signal.value (unclamped — Timer.unbounded grows
                   linearly, Interpolator sine/triangle oscillate 0..1, a
                   paused Timer holds a static phase).
              .y = raw 0..1 driver (clamped value)
              .z = mapped value (lerp(min, max, raw))
              .w = state */
        for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
            entries[`uChan${i}`] = { value: [0, 0, 0, 0], type: 'vec4<f32>' }
        }
        entries.uContourLen = { value: 0, type: 'f32' }
        entries.uPivot = { value: [ctx.width * 0.5, ctx.height * 0.5], type: 'vec2<f32>' }
        entries.uPivotEnabled = { value: 0.0, type: 'f32' }

        return new UniformGroup(entries as any, { isStatic: false })
    }

    /**
     * Mutate uniform values in place each frame. Pixi v8 picks up the
     * changes at next render via `_dirtyId` increments triggered by the
     * proxy on `uniforms.uniforms`. No `.update()` call needed since the
     * group was constructed with `isStatic: false`.
     */
    private refreshUniforms(
        group: UniformGroup,
        config: PlaygroundConfig,
        configData: Record<string, any> | null,
        ctx: ResourceContext,
    ): void {
        const u = group.uniforms as Record<string, any>

        u.uResolution = [ctx.width, ctx.height]

        /* Field defaults first (static for a given effect), then per-frame
           Config-node overrides. Mirrors the original `entries[key].value`
           write but on the live Pixi proxy. */
        for (const field of config.fields) {
            const name = field.uniformName ?? field.name
            if (name in u) u[name] = field.default
        }
        if (configData) {
            for (const key in configData) {
                if (key === '__effectName') continue
                if (key in u) u[key] = configData[key]
            }
        }

        /* uTxcn{i}Enabled flags expose presence of each generic texture
           channel to the shader (1.0 if connected, 0.0 otherwise). Shaders
           that only read a sampler when a flag is on can avoid sampling
           the white fallback. uTxcn{i}Aspect carries width/height of the
           connected texture (1.0 if absent) — used by glyph-style shaders
           that previously read a fixed `uTextAspect` from the atlas slot. */
        for (let i = 0; i < TEXTURE_CHANNEL_COUNT; i++) {
            const tex = ctx.inputs[`txcn${i}`] as { width?: number; height?: number } | null | undefined
            u[`uTxcn${i}Enabled`] = tex ? 1.0 : 0.0
            const tw = tex?.width
            const th = tex?.height
            u[`uTxcn${i}Aspect`] = (tw && th && th > 0) ? tw / th : 1.0
        }

        const animation = ctx.inputs.animation as AnimationSignal | null
        const slots = config.animation.slots
        for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
            const cs: ChannelSignal | undefined = animation?.channels?.[String(i)]
            let time = 0, raw = 0, value = 0, state = 0
            if (cs) {
                time = cs.time
                raw = cs.raw
                value = cs.value
                state = cs.state
            } else {
                /* Default value when the channel isn't wired: prefer the
                   slot's manifest defaultMin so static (no-controller)
                   scenes still render with sensible amplitudes. */
                let slotMin = 0
                for (let s = 0; s < slots.length; s++) {
                    if (slots[s].slot === i) { slotMin = slots[s].defaultMin ?? 0; break }
                }
                value = slotMin
            }
            u[`uChan${i}`] = [time, raw, value, state]
        }

        const contour = ctx.inputs.contour as ContourSamples | null
        u.uContourLen = contour ? contour.totalLength : 0

        const pivotInput = readPivot(ctx.inputs.pivot)
        const pivotEnabled = pivotInput !== null
        let px = ctx.width * 0.5
        let py = ctx.height * 0.5
        if (pivotInput) {
            px = pivotInput[0]
            py = pivotInput[1]
        } else if (contour) {
            const [minX, minY, maxX, maxY] = contour.aabb
            px = (minX + maxX) * 0.5
            py = (minY + maxY) * 0.5
        }
        u.uPivot = [px, py]
        u.uPivotEnabled = pivotEnabled ? 1.0 : 0.0
    }

    /* ───────── Misc helpers ───────── */

    private readScalar(
        configData: Record<string, any> | null,
        params: Record<string, any>,
        key: string,
        fallback: number,
    ): number {
        if (configData && key in configData) {
            const v = Number(configData[key])
            if (Number.isFinite(v)) return v
        }
        if (key in params) {
            const v = Number(params[key])
            if (Number.isFinite(v)) return v
        }
        return fallback
    }

    private resolveSpacing(
        scrolling: NonNullable<InstancedPass['scrolling']>,
        configData: Record<string, any> | null,
        params: Record<string, any>,
        totalLength: number,
    ): number {
        const explicit = scrolling.spacingField
            ? this.readScalar(configData, params, scrolling.spacingField, 0)
            : 0
        if (explicit > 0) return explicit

        const phraseLen = scrolling.phraseLenField
            ? Math.max(1, this.readScalar(configData, params, scrolling.phraseLenField, 1))
            : 1
        const repeats = scrolling.repeatsField
            ? Math.max(1, this.readScalar(configData, params, scrolling.repeatsField, 1))
            : 1

        const auto = totalLength / (phraseLen * repeats)
        return auto > 0 ? auto : 1
    }

    /**
     * Scan every shader source on the active manifest for `uChan{i}` references
     * and warn when an index falls outside the bound pool or isn't declared
     * in `animation.slots`. The warning fires once per (effect, slot) pair —
     * we don't want to spam the console on every frame.
     */
    private warnUndeclaredChannels(config: PlaygroundConfig): void {
        const cacheKey = config.name
        if (this.warnedConfigs.has(cacheKey)) return
        this.warnedConfigs.add(cacheKey)

        const declared = new Set(config.animation.slots.map(s => s.slot))
        const referenced = new Set<number>()
        for (const pass of config.passes) {
            collectChannelRefs(pass.fragment, referenced)
            if ('vertex' in pass && pass.vertex) collectChannelRefs(pass.vertex, referenced)
        }
        for (const i of referenced) {
            if (i < 0 || i >= ANIMATION_CHANNEL_COUNT) {
                console.warn(`[EffectProcessor] "${config.name}" shader references uChan${i} which is outside the channel pool (0..${ANIMATION_CHANNEL_COUNT - 1}).`)
            } else if (!declared.has(i)) {
                console.warn(`[EffectProcessor] "${config.name}" shader uses uChan${i} but the slot is not declared in animation.slots — runtime falls back to defaults.`)
            }
        }
    }
    private warnedConfigs = new Set<string>()

    private invalidateCache(): void {
        for (const cache of this.passCache.values()) {
            this.disposePassCache(cache)
        }
        this.passCache.clear()
        /* UniformGroup has no destroy() — let it GC. Stage stays alive
           and is reused across cache invalidations (it's purely a
           Container). */
        this.uniforms = null
    }

    private disposePassCache(cache: PassCache): void {
        /* Per-frame Mesh+Shader are NOT cached (see PassCache docs) so
           there's nothing to destroy on that front. We only own the
           instanced Geometry + its Buffers; fullscreen quad geometry is
           engine-owned and stays alive. */
        if (!cache.fullscreen && cache.geometry) {
            cache.geometry.destroy(false)
            cache.perVertexBuffer?.destroy()
            cache.indexBuffer?.destroy()
            if (cache.instanceBuffers) {
                for (const b of cache.instanceBuffers.values()) b.destroy()
            }
        }
    }

    destroy(): void {
        this.invalidateCache()
        this.stage?.destroy({ children: false })
        this.stage = null
        super.destroy()
    }
}

/* Pull every `uniform sampler2D <name>` declaration out of a GLSL source.
   Tolerates layout-qualifiers, line breaks, and whitespace variations. */
function collectSamplers(source: string, out: Set<string>): void {
    const re = /\buniform\s+(?:lowp|mediump|highp)?\s*sampler2D\s+(\w+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) out.add(m[1])
}

/* Find every `uChan{N}` token referenced by a shader — covers both uniform
   declarations and call sites like `uChan5.x`. Used to validate that a
   manifest declares all channels its shaders read. */
function collectChannelRefs(source: string, out: Set<number>): void {
    const re = /\buChan(\d+)\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n)) out.add(n)
    }
}

/**
 * Resolve a per-instance attribute mapping into the underlying typed array
 * from `streams`. Returns null when the requested stream isn't present
 * (e.g. a ribbon-only `*Next` attribute on a glyph-mode pass) — caller
 * skips uploading that attribute.
 */
function perInstanceData(m: PerInstanceAttr, streams: InstanceStreams): Float32Array | null {
    switch (m.from) {
        case 'positions':     return streams.positions
        case 'tangents':      return streams.tangents
        case 'arcS':          return streams.arcS
        case 'positionsNext': return streams.positionsNext ?? streams.positions
        case 'tangentsNext':  return streams.tangentsNext ?? streams.tangents
        case 'arcSNext':      return streams.arcSNext ?? streams.arcS
        case 'index': {
            const idx = new Float32Array(streams.count)
            for (let i = 0; i < streams.count; i++) idx[i] = i
            return idx
        }
    }
}

/* ───────── helpers ───────── */

function passInputsSatisfied(pass: EffectPass, inputs: Record<string, any>): boolean {
    /* Hard deps that gate the pass entirely. `txcn{i}` channels can also
       be listed — passes that *must* sample a particular channel (e.g. a
       full-screen mask reading SDF from txcn0) opt in here so the pass is
       elided when the user hasn't wired anything to that slot. */
    for (const dep of pass.requiresInputs ?? []) {
        if (dep === 'source' && !inputs.source) return false
        if (dep === 'contour' && !inputs.contour) return false
        if (dep === 'pivot' && !inputs.pivot) return false
        if (dep.startsWith('txcn') && !inputs[dep]) return false
    }
    return true
}

/**
 * Coerce whatever lands on the `pivot` input slot into a `[x, y]` pair in
 * pixel space. Tolerates plain arrays (the canonical wire format),
 * `{x, y}` objects (handy for debugging from the console), and rejects
 * NaN / non-finite components silently. Returns `null` when nothing
 * usable is present so the caller can fall back to its default centre.
 */
function readPivot(raw: unknown): [number, number] | null {
    if (raw == null) return null
    if (Array.isArray(raw) && raw.length >= 2) {
        const x = Number(raw[0])
        const y = Number(raw[1])
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
        return null
    }
    if (typeof raw === 'object') {
        const o = raw as { x?: unknown; y?: unknown }
        const x = Number(o.x)
        const y = Number(o.y)
        if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
    }
    return null
}
