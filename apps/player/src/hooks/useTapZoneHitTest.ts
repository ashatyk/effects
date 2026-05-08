import { useEffect } from 'react'
import {
    type DataflowEngine,
    type PublishedSurface,
    TapZoneProcessor,
} from '@effects/runtime'
import type { EffectPlayer } from '@effects/player'

// Wires canvas pointer clicks into tapZone dispatch.
// - Reads each TapZoneProcessor's last-seen ContourSamples.
// - Maps clientX/Y → effect pixel space, honouring `objectFit: contain` letterboxing.
// - Ray-cast point-in-polygon against the contour ring; first match emits eventId.
// Zones with kind === 'event' (eventEmitter nodes, no contour) are handled by the sidebar buttons.
export function useTapZoneHitTest(
    canvas: HTMLCanvasElement | null,
    engine: DataflowEngine | null,
    player: EffectPlayer | null,
    surface: PublishedSurface,
): void {
    useEffect(() => {
        if (!canvas || !engine || !player) return
        const tapZones = surface.tapZones.filter(z => z.kind === 'tap')
        if (tapZones.length === 0) return

        const onClick = (e: MouseEvent) => {
            const px = canvasToEffectPixel(canvas, e.clientX, e.clientY)
            if (!px) return
            for (const zone of tapZones) {
                const proc = engine.getProcessor<TapZoneProcessor>(zone.nodeId)
                const contour = proc?.contour
                if (!contour || contour.count < 3) continue
                if (pointInClosedRing(px.x, px.y, contour.positions, contour.count)) {
                    player.emit(zone.eventId, px.x, px.y)
                    // First match wins — z-order = surface array order = graph publish order.
                    // Overlapping zones on the same pixel is an authoring bug; pick deterministically.
                    return
                }
            }
        }
        canvas.addEventListener('click', onClick)
        return () => canvas.removeEventListener('click', onClick)
    }, [canvas, engine, player, surface])
}

// Maps client-space (x, y) into canvas GPU-pixel coords, honouring
// `objectFit: contain` letterboxing. Returns null for clicks in the bands.
function canvasToEffectPixel(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const cssX = clientX - rect.left
    const cssY = clientY - rect.top
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height)
    if (!Number.isFinite(scale) || scale <= 0) return null
    const drawnW = canvas.width * scale
    const drawnH = canvas.height * scale
    const offsetX = (rect.width - drawnW) / 2
    const offsetY = (rect.height - drawnH) / 2
    const px = (cssX - offsetX) / scale
    const py = (cssY - offsetY) / scale
    if (px < 0 || py < 0 || px > canvas.width || py > canvas.height) return null
    return { x: px, y: py }
}

// PNPOLY ray-cast against a closed ring stored as flat [x0,y0,x1,y1,...].
// Ring is implicitly closed (edge i ↔ (i-1) % count); producers must NOT
// duplicate the first vertex at the end (segmentation strips SAM's dup).
function pointInClosedRing(x: number, y: number, positions: Float32Array, count: number): boolean {
    let inside = false
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = positions[i * 2]
        const yi = positions[i * 2 + 1]
        const xj = positions[j * 2]
        const yj = positions[j * 2 + 1]
        // +1e-12 on denominator dodges divide-by-zero on horizontal edges
        // (which contribute zero crossings anyway).
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        if (intersect) inside = !inside
    }
    return inside
}
