import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNodeShell } from '../BaseNodeShell'
import { constantTextureDef } from '@effects/runtime/node-engine/processors/constant-texture'
import type { PipelineNodeData } from '../types'

/* Bake-target node. Hidden from the Add Node picker (def.hidden); only
   instantiated by `BakedPreview` for `.baked.json` files. */
export const ConstantTextureNodeView = memo(({ data }: NodeProps & { data: PipelineNodeData }) => {
    const dataUrl = typeof data.params.dataUrl === 'string' ? data.params.dataUrl : ''
    const width = Number(data.params.width) | 0
    const height = Number(data.params.height) | 0
    const sizeKb = dataUrl ? Math.round(dataUrl.length / 1024) : 0

    return (
        <BaseNodeShell
            title={constantTextureDef.title}
            category={constantTextureDef.category}
            inputs={constantTextureDef.inputs}
            outputs={constantTextureDef.outputs}
            minWidth={160}
            minHeight={120}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 4,
                padding: 4,
                width: '100%',
            }}>
                {dataUrl ? (
                    <img
                        src={dataUrl}
                        alt="baked texture"
                        style={{
                            width: '100%',
                            objectFit: 'contain',
                            background:
                                'linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), ' +
                                'linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), ' +
                                'linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), ' +
                                'linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)',
                            backgroundSize: '12px 12px',
                            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                            imageRendering: 'auto',
                            display: 'block',
                        }}
                    />
                ) : (
                    <div style={{
                        fontSize: 10,
                        color: 'var(--pn-text-muted, #888)',
                        fontStyle: 'italic',
                        padding: '12px 4px',
                        textAlign: 'center',
                    }}>
                        empty payload
                    </div>
                )}
                <div style={{
                    fontSize: 9,
                    color: 'var(--pn-text-muted, #888)',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    letterSpacing: 0.3,
                }}>
                    {width}×{height} · {sizeKb} KB
                </div>
            </div>
        </BaseNodeShell>
    )
})
