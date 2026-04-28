import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

/**
 * Reroute waypoint — strictly a path-shaping device, not a junction.
 *
 * `isConnectable={false}` makes both handles inert for drag-to-create:
 * users can't start a new edge from the output and can't drop a dragged
 * edge onto the input. Already-connected edges continue to render
 * through the handles normally; React Flow uses the handle position only
 * as an anchor for edge geometry once the edge exists.
 *
 * Also: `pointer-events: none` on the inner handle node ensures the
 * connection-line hit area doesn't capture mouse-down events on the
 * waypoint dot, which is what made drag-create still feel possible
 * even with the React Flow flag set.
 */
export const RerouteNodeView = memo(() => {
    return (
        <div className="pn-reroute">
            <Handle
                type="target"
                position={Position.Left}
                id="in"
                className="pn-reroute-handle"
                isConnectable={false}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="out"
                className="pn-reroute-handle"
                isConnectable={false}
            />
        </div>
    )
})
