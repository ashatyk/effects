import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { PROCESSOR_CATALOG } from '@effects/runtime/node-engine/processors'
import { categoryColor } from '../../flow-nodes/categoryColors'
import type { PipelineNodeData } from '../constants'
import type { PageState } from '../sceneResolver'

type PNode = Node<PipelineNodeData>

/**
 * Tint each edge by its source node's category accent. Clones look up
 * the ORIGINAL's category (across every page) so an outgoing edge from
 * a clone of an `image` node is green, not slate — otherwise edges
 * fanning out of clones would all be the same colour and lose their
 * navigational role.
 */
export function useEdgeColouring(
    nodes: PNode[],
    edges: Edge[],
    allPages: PageState[],
): Edge[] {
    return useMemo(() => {
        /* Build an across-pages id → category map so we can resolve
           clones to their origin's category in O(1). The active page's
           nodes live both in `nodes` (active) and in `allPages`; the
           lookup map covers both. */
        const categoryById = new Map<string, string | undefined>()
        for (const page of allPages) {
            for (const n of page.nodes) {
                if (n.data.cloneOf) continue
                categoryById.set(n.id, PROCESSOR_CATALOG[n.data.processor]?.def.category)
            }
        }
        const cloneOfById = new Map<string, string>()
        for (const n of nodes) {
            if (n.data.cloneOf) cloneOfById.set(n.id, n.data.cloneOf)
        }
        const colorByNode = new Map<string, string>()
        for (const n of nodes) {
            const target = cloneOfById.get(n.id) ?? n.id
            const cat = categoryById.get(target)
                ?? PROCESSOR_CATALOG[n.data?.processor]?.def.category
            colorByNode.set(n.id, categoryColor(cat))
        }
        return edges.map(e => {
            const stroke = colorByNode.get(e.source) ?? categoryColor(undefined)
            const existing = (e.style ?? {}) as React.CSSProperties
            return { ...e, style: { ...existing, stroke } }
        })
    }, [edges, nodes, allPages])
}
