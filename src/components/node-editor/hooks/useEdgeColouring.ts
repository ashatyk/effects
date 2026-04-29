import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { PROCESSOR_CATALOG } from '../../../node-engine/processors'
import { categoryColor } from '../../flow-nodes/categoryColors'
import type { PipelineNodeData } from '../constants'

type PNode = Node<PipelineNodeData>

export function useEdgeColouring(nodes: PNode[], edges: Edge[]): Edge[] {
    return useMemo(() => {
        const colorByNode = new Map<string, string>()
        for (const n of nodes) {
            const cat = PROCESSOR_CATALOG[n.data?.processor]?.def.category
            colorByNode.set(n.id, categoryColor(cat))
        }
        return edges.map(e => {
            const stroke = colorByNode.get(e.source) ?? categoryColor(undefined)
            const existing = (e.style ?? {}) as React.CSSProperties
            return { ...e, style: { ...existing, stroke } }
        })
    }, [edges, nodes])
}
