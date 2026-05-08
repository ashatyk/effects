import { memo, useMemo, type ComponentType } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { usePinning } from '../flow-nodes/context/PinContext'
import { useScene } from './SceneContext'
import { pipelineNodeTypes } from '../flow-nodes/nodeTypes'
import { HeadlessNodeProvider } from '../flow-nodes/context/HeadlessNodeContext'
import {
    NodeIdProvider,
    HeadlessNodeDataProvider,
} from '../flow-nodes/context/NodeIdContext'
import type { PipelineNodeData } from '../flow-nodes/types'
import type { PNode } from './sceneResolver'

// Renders each pinned *NodeView headless (no handles, no resizer) so cards work outside RF context.
export const PinsPanel = memo(function PinsPanel() {
    const { pinnedIds } = usePinning()
    const { pages } = useScene()

    const pinned = useMemo(() => {
        const byId = new Map<string, PNode>()
        for (const p of pages) {
            for (const n of p.nodes) {
                if (!byId.has(n.id)) byId.set(n.id, n)
            }
        }
        const out: PNode[] = []
        for (const id of pinnedIds) {
            const n = byId.get(id)
            if (n) out.push(n)
        }
        return out
    }, [pinnedIds, pages])

    if (pinned.length === 0) {
        return (
            <Typography
                variant="body2"
                sx={{
                    color: 'text.disabled',
                    textAlign: 'center',
                    fontStyle: 'italic',
                    px: 2,
                    py: 3,
                    fontSize: 12,
                }}
            >
                No pinned nodes. Click the pin icon on a node header to pin it here.
            </Typography>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5 }}>
            {pinned.map(n => (
                <PinnedCard key={n.id} id={n.id} data={n.data as PipelineNodeData} />
            ))}
        </Box>
    )
})

const PinnedCard = memo(function PinnedCard({
    id, data,
}: { id: string; data: PipelineNodeData }) {
    const View = pipelineNodeTypes[
        data.processor as keyof typeof pipelineNodeTypes
    ] as unknown as ComponentType<{ id: string; data: PipelineNodeData }> | undefined

    if (!View) {
        return (
            <Box className="pn-pinned-host">
                <Typography variant="caption" sx={{ color: 'error.main' }}>
                    Unknown processor: {data.processor}
                </Typography>
            </Box>
        )
    }

    return (
        <Box className="pn-pinned-host">
            <HeadlessNodeProvider value={true}>
                <NodeIdProvider value={id}>
                    <HeadlessNodeDataProvider value={data}>
                        {/* Views expect full RF NodeProps; we supply only id + data (all shipped views destructure only those). */}
                        <View id={id} data={data} />
                    </HeadlessNodeDataProvider>
                </NodeIdProvider>
            </HeadlessNodeProvider>
        </Box>
    )
})
