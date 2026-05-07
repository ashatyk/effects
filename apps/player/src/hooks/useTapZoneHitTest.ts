import { useEffect } from 'react'
import {
    type DataflowEngine,
    type PublishedSurface,
    TapZoneProcessor,
} from '@effects/runtime'
import type { EffectPlayer } from '@effects/player'

/**
 * Wire native pointer clicks on a `<canvas>` into Tier-3 `tapZone`
 * dispatch.
 *
 * For every `surface.tapZones[]` entry with `kind === 'tap'`:
 *  - Look up the live `TapZoneProcessor` instance and read its
 *    last-seen `ContourSamples` (set by `tapZone.execute()` every
 *    frame the contour input is wired and producing).
 *  - On every canvas click, convert the (clientX, clientY) into the
 *    effect's pixel space (the coordinate system contour positions
 *    live in), accounting for the canvas's `objectFit: contain` CSS
 *    scaling.
 *  - Run a ray-casting point-in-polygon test against the contour
 *    ring. First match (z-order = surface array order) emits the
 *    zone's `eventId` via `player.emit(...)`.
 *
 * Zones with `kind === 'event'` are skipped entirely — they're
 * `eventEmitter` nodes (no contour input) and surface as a sidebar
 * button instead.
 *
 * Coordinate transform notes:
 *  - `canvas.width` / `canvas.height` are the GPU backing buffer
 *    (sized by `EffectPlayer` to match the publishRoot's output RT).
 *  - `getBoundingClientRect()` gives the CSS box (which `objectFit:
 *    contain` may letterbox inside).
 *  - The drawn-area scale is `min(rect.w / canvas.w, rect.h / canvas.h)`
 *    and is centred — same arithmetic as `<img object-fit: contain>`.
 *  - Clicks inside the letterbox bands are misses (out-of-canvas
 *    pixel coordinates), guarded by an explicit bounds check.
 */
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
                    /* First match wins — z-order is surface array order
                       (which mirrors graph publish order). Two zones
                       overlapping on the same pixel is an authoring
                       bug; the runtime picks the earliest declared
                       deterministically rather than firing both. */
                    return
                }
            }
        }
        canvas.addEventListener('click', onClick)
        return () => canvas.removeEventListener('click', onClick)
    }, [canvas, engine, player, surface])
}

/** Convert client-space (x, y) into the canvas's GPU-pixel coordinate
 *  system, honouring `objectFit: contain` letterboxing. Returns null
 *  if the click landed in the letterbox bands (outside the drawn
 *  area). */
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

/** Ray-casting point-in-polygon (PNPOLY variant) against a closed
 *  ring stored as a flat `[x0,y0, x1,y1, ...]` Float32Array. The
 *  ring is implicitly closed (edge `i ↔ (i-1) % count`); producers
 *  must NOT duplicate the first vertex at the end (segmentation
 *  strips the SAM-supplied duplicate). */
function pointInClosedRing(x: number, y: number, positions: Float32Array, count: number): boolean {
    let inside = false
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = positions[i * 2]
        const yi = positions[i * 2 + 1]
        const xj = positions[j * 2]
        const yj = positions[j * 2 + 1]
        /* Standard ray-cast: count edges crossed by a horizontal ray
           from (x, y) to +∞. Odd → inside, even → outside. The +1e-12
           on the denominator dodges divide-by-zero on horizontal
           edges (which contribute zero crossings anyway). */
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        if (intersect) inside = !inside
    }
    return inside
}
