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

// Slot contracts:
//   source → uDiffuse; txcn{i} → uTxcn{i} (1×1 white fallback so samplers always read).
//   contour → instanced passes; pivot → uPivot (defaults to contour AABB centre or canvas
//   centre, with uPivotEnabled = 0/1); animation → uChan{i}; config picks the manifest.
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

// Geometry, per-vertex/index Buffers, per-instance Buffers and the parsed sampler set
// are cached. Shader + Mesh are deliberately rebuilt per frame: Pixi v8's per-program
// sync function captures the resource layout at compile time, so mutating
// shader.resources.<sampler> on a cached Shader is brittle. Shader.from hits Pixi's
// program cache, so per-frame rebuilds only allocate a thin wrapper + fresh bind groups.
interface PassCache {
    samplers: Set<string>
    geometry?: Geometry
    perVertexBuffer?: Buffer
    indexBuffer?: Buffer
    instanceBuffers?: Map<string, Buffer>
    instanceCount: number
    fullscreen: boolean
}

export class EffectProcessor extends BaseProcessor {
    readonly def = effectDef
    // NOT alwaysDirty: re-renders ride upstream propagation (Timer/EventEmitter/etc).
    // Static "image → sdf → effect" scenes do zero per-frame work.

    private cachedEffectName: string | null = null

    // Cache key = `${effectName}|${w}x${h}`. Param / phase / animation changes flow
    // through in-place uniform/buffer updates and don't invalidate the cache.
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

        // removeChildren only unparents; the per-frame Meshes are destroyed below.
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

        // shader.destroy(false) is mandatory: mesh.destroy() doesn't release the
        // Shader (Pixi can't know it's not shared), and each Shader.from owns its
        // own BindGroup. Without this, BindGroups leak (multi-GB GPU after a few
        // minutes). `false` keeps the globally-cached GL program alive.
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

    private ensurePassCache(pass: EffectPass, _ctx: ResourceContext): PassCache {
        const cached = this.passCache.get(pass.id)
        if (cached) return cached

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

    // Returns null for instanced passes with zero instances (no geometry to draw).
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

    // Streams uploaded via setDataWithSize so Pixi reallocates the GPU buffer
    // in-place; aLocal + index buffers stay untouched across frames.
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
                // Keep buffer when instance count drops; avoids realloc churn at a tiny GPU-memory cost.
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

    private buildUniformGroup(config: PlaygroundConfig, ctx: ResourceContext): UniformGroup {
        const entries = buildUniformEntries(config.fields, ctx.width, ctx.height, config.staticUniforms)

        for (let i = 0; i < TEXTURE_CHANNEL_COUNT; i++) {
            entries[`uTxcn${i}Enabled`] = { value: 0.0, type: 'f32' }
            entries[`uTxcn${i}Aspect`] = { value: 1.0, type: 'f32' }
        }
        // uChan{i} = vec4(time, raw, value, state) — the whole pool is bound so any
        // shader can read any slot. Unused slots emit an idle ChannelSignal.
        // Components: x = upstream Signal.value (unclamped phase); y = clamped 0..1
        // raw; z = lerp(min, max, raw); w = state.
        for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
            entries[`uChan${i}`] = { value: [0, 0, 0, 0], type: 'vec4<f32>' }
        }
        entries.uContourLen = { value: 0, type: 'f32' }
        entries.uPivot = { value: [ctx.width * 0.5, ctx.height * 0.5], type: 'vec2<f32>' }
        entries.uPivotEnabled = { value: 0.0, type: 'f32' }

        return new UniformGroup(entries as any, { isStatic: false })
    }

    // In-place mutation; the isStatic:false UniformGroup proxy bumps _dirtyId,
    // so no explicit .update() is needed.
    private refreshUniforms(
        group: UniformGroup,
        config: PlaygroundConfig,
        configData: Record<string, any> | null,
        ctx: ResourceContext,
    ): void {
        const u = group.uniforms as Record<string, any>

        u.uResolution = [ctx.width, ctx.height]

        // Field defaults first, then per-frame Config-node overrides.
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

        // uTxcn{i}Enabled gates shader sampling away from the white fallback;
        // uTxcn{i}Aspect carries width/height of the bound texture (1.0 when absent).
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
                // Default to the slot's manifest defaultMin so static scenes still render.
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

    // Warns once per effect when a shader references an out-of-pool or undeclared uChan{i}.
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
        // UniformGroup has no destroy(); let it GC. Stage Container is reused.
        this.uniforms = null
    }

    private disposePassCache(cache: PassCache): void {
        // Only instanced caches own Geometry + Buffers; fullscreen quad geometry is engine-owned.
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

function collectSamplers(source: string, out: Set<string>): void {
    const re = /\buniform\s+(?:lowp|mediump|highp)?\s*sampler2D\s+(\w+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) out.add(m[1])
}

function collectChannelRefs(source: string, out: Set<number>): void {
    const re = /\buChan(\d+)\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n)) out.add(n)
    }
}

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

function passInputsSatisfied(pass: EffectPass, inputs: Record<string, any>): boolean {
    // Passes opt into hard input deps via requiresInputs (txcn{i} included) so a
    // missing wire elides the pass entirely.
    for (const dep of pass.requiresInputs ?? []) {
        if (dep === 'source' && !inputs.source) return false
        if (dep === 'contour' && !inputs.contour) return false
        if (dep === 'pivot' && !inputs.pivot) return false
        if (dep.startsWith('txcn') && !inputs[dep]) return false
    }
    return true
}

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
