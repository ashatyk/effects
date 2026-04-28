import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import Stack from '@mui/material/Stack'
import { BaseNodeShell } from './BaseNodeShell'
import { useSetParam } from './useSetParam'
import { NumberField, SectionTitle } from './widgets'
import {
    ribbonAnimControllerDef,
    particlesAnimControllerDef,
    fullscreenAnimControllerDef,
    type ChannelDescriptor,
} from '../../node-engine/processors/animation-controller'
import type { ProcessorDef } from '../../node-engine/types'
import type { PipelineNodeData } from './types'

interface ControllerProps {
    def: ProcessorDef
    title: string
    channels: ChannelDescriptor[]
}

function ControllerView({ id, data, def, title, channels }: NodeProps & { data: PipelineNodeData } & ControllerProps) {
    const set = useSetParam(id)
    return (
        <BaseNodeShell title={title} category={def.category} inputs={def.inputs} outputs={def.outputs} minWidth={280}>
            {channels.map((c, i) => {
                const minV = Number(data.params[`min_${c.id}`] ?? c.defaultMin)
                const maxV = Number(data.params[`max_${c.id}`] ?? c.defaultMax)
                return (
                    <Stack
                        key={c.id}
                        /* Top margin on every section but the first creates
                         * vertical rhythm without resorting to a divider
                         * line — the SectionTitle's spacing handles its own
                         * top padding, this just opens up between groups. */
                        sx={{ mt: i === 0 ? 0 : 2 }}
                    >
                        <SectionTitle>{c.label}</SectionTitle>
                        <NumberField label="min" value={minV} step={0.1} onChange={v => set(`min_${c.id}`, v)} />
                        <NumberField label="max" value={maxV} step={0.1} onChange={v => set(`max_${c.id}`, v)} />
                    </Stack>
                )
            })}
        </BaseNodeShell>
    )
}

const RIBBON_CHANNELS: ChannelDescriptor[] = [
    { id: 'scroll',    label: 'Scroll',    defaultMin: 0, defaultMax: 600 },
    { id: 'radial',    label: 'Radial',    defaultMin: 0, defaultMax: 20 },
    { id: 'width',     label: 'Width',     defaultMin: 1, defaultMax: 2 },
    { id: 'spacing',   label: 'Spacing',   defaultMin: 1, defaultMax: 2 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
]
const PARTICLES_CHANNELS: ChannelDescriptor[] = [
    { id: 'scroll',    label: 'Scroll',    defaultMin: 0, defaultMax: 600 },
    { id: 'radial',    label: 'Radial',    defaultMin: 0, defaultMax: 20 },
    { id: 'size',      label: 'Size',      defaultMin: 1, defaultMax: 2 },
    { id: 'glow',      label: 'Glow',      defaultMin: 1, defaultMax: 2 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
]
const FULLSCREEN_CHANNELS: ChannelDescriptor[] = [
    { id: 'progress',  label: 'Progress',  defaultMin: 0, defaultMax: 1 },
    { id: 'intensity', label: 'Intensity', defaultMin: 1, defaultMax: 1 },
    { id: 'phase',     label: 'Phase',     defaultMin: 0, defaultMax: 6.2831853 },
]

export const RibbonAnimControllerNodeView = memo((props: NodeProps & { data: PipelineNodeData }) =>
    <ControllerView {...props} def={ribbonAnimControllerDef} title="Ribbon Animation" channels={RIBBON_CHANNELS} />
)
export const ParticlesAnimControllerNodeView = memo((props: NodeProps & { data: PipelineNodeData }) =>
    <ControllerView {...props} def={particlesAnimControllerDef} title="Particles Animation" channels={PARTICLES_CHANNELS} />
)
export const FullscreenAnimControllerNodeView = memo((props: NodeProps & { data: PipelineNodeData }) =>
    <ControllerView {...props} def={fullscreenAnimControllerDef} title="Fullscreen Animation" channels={FULLSCREEN_CHANNELS} />
)
