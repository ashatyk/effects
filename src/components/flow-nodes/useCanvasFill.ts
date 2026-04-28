import { useEffect } from 'react'

/**
 * Sets up a DPR-aware <canvas> that fills its parent container's width
 * and a fixed pixel height. Re-initialises whenever the visible width
 * changes (sidebar resize, node resize, …) and notifies the caller via
 * `onResize` so they can re-run their draw routine at the new size.
 *
 * Usage:
 *   useCanvasFill(canvasRef, PREVIEW_H, (w, h, ctx) => drawScope(ctx, w, h, ...))
 *
 * The hook owns the DPR scaling — drawing code receives a transformed
 * `ctx` and works in CSS pixels.
 */
export function useCanvasFill(
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    cssHeight: number,
    onResize: (w: number, h: number, ctx: CanvasRenderingContext2D) => void,
): void {
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const apply = () => {
            const dpr = window.devicePixelRatio || 1
            const cssWidth = Math.max(1, canvas.clientWidth)
            canvas.width = Math.round(cssWidth * dpr)
            canvas.height = Math.round(cssHeight * dpr)
            canvas.style.height = `${cssHeight}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            onResize(cssWidth, cssHeight, ctx)
        }
        apply()

        const ro = new ResizeObserver(apply)
        ro.observe(canvas)
        return () => ro.disconnect()
    }, [canvasRef, cssHeight, onResize])
}
