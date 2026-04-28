/* eslint-disable @typescript-eslint/no-explicit-any */
import { UniformGroup } from 'pixi.js'
import { BaseProcessor } from './base-processor'
import { SLOT, type ProcessorDef, type IDataflowEngine } from '../types'
import DepthProjectFragment from '../../pipeline/passes/depth-project'

export const depthProjectDef: ProcessorDef = {
    type: 'depthProject',
    title: 'Depth Project',
    category: 'depth',
    inputs: [
        { name: 'sdf', type: SLOT.TEXTURE },
        { name: 'depth', type: SLOT.TEXTURE },
    ],
    outputs: [{ name: 'depth_ref', type: SLOT.TEXTURE }],
    defaultParams: { width: 0, height: 0 },
}

export class DepthProjectProcessor extends BaseProcessor {
    readonly def = depthProjectDef

    execute(inputs: Record<string, any>, params: Record<string, any>, engine: IDataflowEngine): Record<string, any> {
        const sdfSrc = inputs.sdf
        const depthSrc = inputs.depth
        if (!sdfSrc || !depthSrc) return { depth_ref: null }

        const [w, h] = this.resolveRes(inputs, params, engine)
        const rt = this.ensureRT(w, h)
        const uniforms = new UniformGroup({
            uResolution: { value: [w, h], type: 'vec2<f32>' },
        } as any, { isStatic: true })

        engine.renderPassInto(rt, DepthProjectFragment, {
            uniforms,
            verticalDistanceTexture: sdfSrc,
            depthTexture: depthSrc,
        })
        return { depth_ref: rt.source }
    }
}
