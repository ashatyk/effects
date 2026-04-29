/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Container, Geometry, Mesh, Shader, Texture, UniformGroup,
} from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine, type ContourSamples, type AnimationSignal, type ChannelSignal, type PassMetric, type EffectMetrics } from '../types'
import { effects } from '../../effects'
import { buildUniformEntries, applyCoordsUniforms } from '../../pipeline/uniforms'
import { DEFAULT_VERTEX } from '../../pipeline/default-vertex'
import {
    ANIMATION_CHANNEL_COUNT,
    type EffectInputName, type EffectPass, type FullscreenPass, type InstancedPass, type PlaygroundConfig,
} from '../../pipeline/types'
import { buildInstancedMesh, resampleContourRibbon, resampleContourScrolling, streamsFromContour } from '../render/instanced-mesh'

export const effectDef: ProcessorDef = {
    type: 'effect',
    title: 'Effect',
    category: 'output',
    inputs: [
        { name: 'source', type: SLOT.TEXTURE, label: 'source' },
        { name: 'sdf', type: SLOT.TEXTURE },
        { name: 'depth', type: SLOT.TEXTURE },
        { name: 'depth_ref', type: SLOT.TEXTURE },
        { name: 'normals', type: SLOT.TEXTURE, label: 'normals' },
        { name: 'albedo', type: SLOT.TEXTURE, label: 'albedo' },
        { name: 'roughness', type: SLOT.TEXTURE, label: 'roughness' },
        { name: 'metallic', type: SLOT.TEXTURE, label: 'metallic' },
        { name: 'atlas', type: SLOT.TEXTURE, label: 'atlas' },
        { name: 'contour', type: SLOT.CONTOUR, label: 'contour' },
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
    hasDepth: boolean
    hasNormals: boolean
    hasMaterials: boolean
}

export class EffectProcessor extends BaseProcessor {
    readonly def = effectDef
    alwaysDirty = true

    private cachedEffectName: string | null = null

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
            hasDepth: !!(inputs.depth && inputs.depth_ref),
            hasNormals: !!inputs.normals,
            hasMaterials: !!(inputs.albedo && inputs.roughness && inputs.metallic),
        }

        const uniforms = this.makeUniformGroup(config, configData, ctx)
        this.warnUndeclaredChannels(config)

        /* Per-pass CPU build timing. We measure mesh construction +
           shader compilation here; GPU dispatch is timed separately
           around the single `renderer.render` call below since the
           whole stage goes through one batched draw and per-pass
           GPU timing would require timer-query extensions. */
        const passMetrics: PassMetric[] = []
        const stage = new Container()
        const ephemeralGeometries: Geometry[] = []
        for (const pass of config.passes) {
            if (!passInputsSatisfied(pass, inputs)) {
                passMetrics.push({ id: pass.id, kind: pass.kind, cpuMs: 0, skipped: true })
                continue
            }
            const tPass = performance.now()
            let cpuMs = 0
            try {
                const resources = this.makeResources(pass, ctx, uniforms)
                const mesh = pass.kind === 'fullscreen'
                    ? this.buildFullscreenMesh(pass, ctx, resources, ephemeralGeometries)
                    : this.buildInstancedMesh(pass, ctx, configData, params, resources, ephemeralGeometries)
                if (mesh) {
                    mesh.blendMode = pass.blend === 'add' ? 'add' : 'normal'
                    stage.addChild(mesh)
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

        stage.destroy({ children: true })
        for (const geo of ephemeralGeometries) geo.destroy(true)

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

    /* ───────── Mesh construction per pass ───────── */

    private buildFullscreenMesh(
        pass: FullscreenPass,
        ctx: ResourceContext,
        resources: Record<string, unknown>,
        ephemeral: Geometry[],
    ): Mesh<Geometry, Shader> {
        const geo = makeQuadGeo(ctx.width, ctx.height)
        ephemeral.push(geo)
        return new Mesh<Geometry, Shader>({
            geometry: geo,
            shader: Shader.from({
                gl: { vertex: pass.vertex || DEFAULT_VERTEX, fragment: pass.fragment },
                resources: resources as any,
            }),
        })
    }

    private buildInstancedMesh(
        pass: InstancedPass,
        ctx: ResourceContext,
        configData: Record<string, any> | null,
        params: Record<string, any>,
        resources: Record<string, unknown>,
        ephemeral: Geometry[],
    ): Mesh<Geometry, Shader> | null {
        const contour = ctx.inputs.contour as ContourSamples | null
        if (!contour || contour.count === 0) return null

        let streams
        if (pass.scrolling) {
            /* Scroll phase comes from the animation channel slot configured
               on the pass (defaults to slot 0 — the canonical "phase"
               position). When no AnimationController is wired, the channel
               value defaults to its manifest min — typically 0, i.e. no
               scrolling. */
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

        if (streams.count === 0) return null

        const mesh = buildInstancedMesh({
            def: pass.geometry,
            streams,
            vertex: pass.vertex,
            fragment: pass.fragment,
            resources,
        })
        const geo = mesh.geometry as Geometry | undefined
        if (geo) ephemeral.push(geo)
        return mesh
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

    /* ───────── Uniform / resource binding ───────── */

    private makeUniformGroup(
        config: PlaygroundConfig,
        configData: Record<string, any> | null,
        ctx: ResourceContext,
    ): UniformGroup {
        const entries = buildUniformEntries(config.fields, ctx.width, ctx.height, config.staticUniforms)

        /* Coords binding (data injected by ConfigProcessor or by upstream Polygon node) */
        const coordsSrc = ctx.inputs.coords_tex
        const aabb = ctx.inputs.aabb as number[] | null
        const pointCount = ctx.inputs.point_count as number | null
        const texDim = ctx.inputs.tex_dim as number[] | null
        if (coordsSrc && pointCount && texDim && aabb) {
            applyCoordsUniforms(entries, {
                tex: null as any,
                w: texDim[0], h: texDim[1],
                count: pointCount,
                minX: aabb[0], minY: aabb[1],
                maxX: aabb[2], maxY: aabb[3],
            })
        }

        /* Per-effect param overrides from Config node. */
        if (configData) {
            for (const [key, val] of Object.entries(configData)) {
                if (key !== '__effectName' && entries[key]) entries[key].value = val
            }
        }

        entries.uDepthEnabled = { value: ctx.hasDepth ? 1.0 : 0.0, type: 'f32' }
        entries.uNormalsEnabled = { value: ctx.hasNormals ? 1.0 : 0.0, type: 'f32' }
        entries.uMaterialsEnabled = { value: ctx.hasMaterials ? 1.0 : 0.0, type: 'f32' }

        /* Animation channels: the entire pool (size = ANIMATION_CHANNEL_COUNT)
           is bound as `uChan{i}` uniforms of type `vec4(time_ms, raw, value, state)`.
           Every shader can opt into any slot regardless of whether the manifest
           mentions it explicitly — unused slots get an idle ChannelSignal
           (time=0, raw=0, value=slot's defaultMin or 0, state=0).
           Component contract is fixed: .x = time_ms, .y = raw 0..1,
           .z = mapped value, .w = state. */
        const animation = ctx.inputs.animation as AnimationSignal | null
        const slotByIndex = new Map(config.animation.slots.map(s => [s.slot, s]))
        for (let i = 0; i < ANIMATION_CHANNEL_COUNT; i++) {
            const slot = slotByIndex.get(i)
            const cs: ChannelSignal | undefined = animation?.channels?.[String(i)]
            const v = cs ?? {
                time: 0,
                raw: 0,
                value: slot?.defaultMin ?? 0,
                state: 0 as 0 | 1,
            }
            entries[`uChan${i}`] = {
                value: [v.time, v.raw, v.value, v.state],
                type: 'vec4<f32>',
            }
        }

        /* Auto-derived: text-strip aspect ratio = atlas.width / atlas.height. */
        const atlas = ctx.inputs.atlas
        if (atlas && typeof atlas === 'object' && 'width' in atlas && 'height' in atlas
            && (atlas as any).height > 0) {
            entries.uTextAspect = { value: (atlas as any).width / (atlas as any).height, type: 'f32' }
        } else {
            entries.uTextAspect = { value: 1.0, type: 'f32' }
        }

        /* Per-contour info — used by ribbon-style scrolling shaders. */
        const contour = ctx.inputs.contour as ContourSamples | null
        entries.uContourLen = { value: contour ? contour.totalLength : 0, type: 'f32' }

        return new UniformGroup(entries as any, { isStatic: false })
    }

    private makeResources(
        pass: EffectPass,
        ctx: ResourceContext,
        uniforms: UniformGroup,
    ): Record<string, unknown> {
        const r: Record<string, any> = { uniforms }
        const inp = ctx.inputs

        /* Only bind samplers that the pass shaders actually declare. Otherwise
           Pixi v8 routes "extra" sampler resources to texture units that the
           fragment shader didnt reserve for them, which manifests as one pass
           sampling a sibling passs texture (e.g. copy-source rendering the
           SDF instead of the source image). */
        const wanted = new Set<string>()
        collectSamplers(pass.fragment, wanted)
        if ('vertex' in pass && pass.vertex) collectSamplers(pass.vertex, wanted)

        const bind = (name: string, value: unknown) => {
            if (!wanted.has(name)) return
            r[name] = value
        }

        bind('uDiffuse', inp.source ?? ctx.fallback)
        bind('verticalDistanceTexture', inp.sdf ?? ctx.fallback)
        bind('uPointTexture', inp.coords_tex ?? ctx.fallback)
        bind('depthTexture', ctx.hasDepth ? inp.depth : ctx.fallback)
        bind('depthRefTexture', ctx.hasDepth ? inp.depth_ref : ctx.fallback)
        bind('normalsTexture', ctx.hasNormals ? inp.normals : ctx.fallback)
        bind('albedoTexture', ctx.hasMaterials ? inp.albedo : ctx.fallback)
        bind('roughnessTexture', ctx.hasMaterials ? inp.roughness : ctx.fallback)
        bind('metallicTexture', ctx.hasMaterials ? inp.metallic : ctx.fallback)
        bind('uAtlas', inp.atlas ?? ctx.fallback)

        return r
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

    destroy(): void {
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

function makeQuadGeo(w: number, h: number): Geometry {
    return new Geometry({
        attributes: {
            aPosition: [0, 0, w, 0, w, h, 0, h],
            aUV: [0, 0, 1, 0, 1, 1, 0, 1],
        },
        indexBuffer: [0, 1, 2, 0, 2, 3],
    })
}

/* ───────── helpers ───────── */

function passInputsSatisfied(pass: EffectPass, inputs: Record<string, any>): boolean {
    /* Hard deps that gate the pass entirely. */
    const hard: EffectInputName[] = ['source', 'sdf', 'contour']
    for (const dep of pass.requiresInputs ?? []) {
        if (!hard.includes(dep)) continue
        if (dep === 'source' && !inputs.source) return false
        if (dep === 'sdf' && !inputs.sdf) return false
        if (dep === 'contour' && !inputs.contour) return false
    }
    return true
}
