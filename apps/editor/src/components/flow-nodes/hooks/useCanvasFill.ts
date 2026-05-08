import { useEffect } from 'react'

// DPR-aware <canvas> that fills parent width with fixed cssHeight; ctx is pre-scaled to CSS pixels.
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
