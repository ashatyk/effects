/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    derivePublishedSurface,
    type DerivePublishedSurfaceResult,
    type SerializedNode,
    type SerializedEdge,
} from '@effects/runtime'
import { resolveSceneForEngine, type PageState } from './sceneResolver'

// Flatten PageState[] → resolved (nodes, edges) for derivePublishedSurface (which knows nothing
// about pages/clones). Same flatten engine.setEdges runs.
export function deriveFromPages(pages: PageState[]): DerivePublishedSurfaceResult {
    const { realNodes, resolvedEdges } = resolveSceneForEngine(pages)

    const nodes: SerializedNode[] = realNodes.map(n => {
        const sn: SerializedNode = {
            id: n.id,
            type: n.type ?? n.data.processor,
            position: { ...n.position },
            data: { ...n.data, params: { ...n.data.params } } as any,
        }
        const w = (n as { width?: number }).width
        const h = (n as { height?: number }).height
        if (typeof w === 'number') sn.width = w
        if (typeof h === 'number') sn.height = h
        if (n.style) sn.style = { ...n.style } as Record<string, unknown>
        return sn
    })

    const edges: SerializedEdge[] = resolvedEdges.map(e => {
        const out: SerializedEdge = { source: e.source, target: e.target }
        if (e.id !== undefined) out.id = e.id
        if (e.type !== undefined) out.type = e.type
        if (e.sourceHandle !== undefined) out.sourceHandle = e.sourceHandle
        if (e.targetHandle !== undefined) out.targetHandle = e.targetHandle
        if (e.data !== undefined) out.data = e.data as Record<string, unknown>
        return out
    })

    return derivePublishedSurface({ nodes, edges })
}

// Stable structural hash that changes whenever the publish traversal would yield a different
// result (nodes/edges/exposed/publish-relevant params). Lets useDerivedSurface skip viewport edits.
export function publishStructuralHash(pages: PageState[]): string {
    const parts: string[] = []
    for (const p of pages) {
        for (const n of p.nodes) {
            const ex = (n.data as any).exposed as
                | { mode?: string; fields?: string[]; label?: string; hint?: string }
                | undefined
            const exFields = ex?.fields ? ex.fields.slice().sort().join(',') : ''
            parts.push(
                `N:${n.id}:${n.data.processor}:${n.data.cloneOf ?? ''}` +
                `:${ex?.mode ?? ''}:${exFields}:${ex?.label ?? ''}:${ex?.hint ?? ''}`,
            )
            const proc = n.data.processor
            if (proc === 'publishRoot') {
                const params = n.data.params as Record<string, unknown>
                parts.push(`PR:${params.name ?? ''}:${params.version ?? ''}:${params.effectId ?? ''}`)
            }
            if (proc === 'tapZone' || proc === 'eventEmitter') {
                const params = n.data.params as Record<string, unknown>
                parts.push(`EV:${proc}:${params.id ?? ''}:${params.label ?? ''}`)
            }
            if (proc === 'config') {
                const params = n.data.params as Record<string, unknown>
                parts.push(`CFG:${params.effect ?? ''}`)
            }
        }
        for (const e of p.edges) {
            parts.push(`E:${e.source}:${e.sourceHandle ?? ''}>${e.target}:${e.targetHandle ?? ''}`)
        }
    }
    return parts.join('|')
}
