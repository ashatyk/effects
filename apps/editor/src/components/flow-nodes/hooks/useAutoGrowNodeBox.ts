import { useLayoutEffect, useRef } from 'react'
import { useNodeId, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { GRID_SIZE } from '../../node-editor/constants'

// Auto-grow the RF node box to fit intrinsic widget content (rounded up to GRID_SIZE).
// Measures .pn-widgets.scrollHeight (NOT .pn — it has overflow:visible so scrollHeight==clientHeight).
// RO covers descendant resize; MO re-attaches RO and catches canvas width/height attribute writes.
// Disabled in headless mode — Pins rail cards must not mutate RF dimensions of unrelated nodes.
export function useAutoGrowNodeBox(enabled: boolean, minWidth: number, minHeight: number) {
    const elRef = useRef<HTMLDivElement | null>(null)
    const { getNode, updateNode } = useReactFlow()
    const updateInternals = useUpdateNodeInternals()
    const flowNodeId = useNodeId()

    useLayoutEffect(() => {
        if (!enabled || !flowNodeId) return
        const el = elRef.current
        if (!el) return

        let raf = 0
        const measureAndMaybeGrow = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const widgets = el.querySelector<HTMLElement>('.pn-widgets')
                const overflowH = widgets ? widgets.scrollHeight - widgets.clientHeight : 0
                const overflowW = widgets ? widgets.scrollWidth  - widgets.clientWidth  : 0

                if (overflowH <= 1 && overflowW <= 1) return

                const node = getNode(flowNodeId)
                const curW = node?.width
                    ?? (node as { measured?: { width?: number } } | undefined)?.measured?.width
                    ?? el.offsetWidth
                const curH = node?.height
                    ?? (node as { measured?: { height?: number } } | undefined)?.measured?.height
                    ?? el.offsetHeight

                const targetW = Math.max(minWidth, Math.ceil((curW + Math.max(0, overflowW)) / GRID_SIZE) * GRID_SIZE)
                const targetH = Math.max(minHeight, Math.ceil((curH + Math.max(0, overflowH)) / GRID_SIZE) * GRID_SIZE)

                if (targetW === curW && targetH === curH) return
                updateNode(flowNodeId, { width: targetW, height: targetH })
                updateInternals(flowNodeId)
            })
        }

        const ro = new ResizeObserver(measureAndMaybeGrow)
        const observed = new WeakSet<Element>()
        const observeRecursively = (root: Element) => {
            if (observed.has(root)) return
            observed.add(root)
            ro.observe(root)
            for (const child of Array.from(root.children)) observeRecursively(child)
        }
        observeRecursively(el)

        const mo = new MutationObserver(muts => {
            let needsMeasure = false
            for (const m of muts) {
                if (m.type === 'childList') {
                    for (const n of Array.from(m.addedNodes)) {
                        if (n instanceof Element) observeRecursively(n)
                    }
                    needsMeasure = true
                } else if (m.type === 'attributes') {
                    needsMeasure = true
                }
            }
            if (needsMeasure) measureAndMaybeGrow()
        })
        mo.observe(el, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['width', 'height', 'style'],
        })

        measureAndMaybeGrow()
        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            mo.disconnect()
        }
    }, [enabled, flowNodeId, minWidth, minHeight, getNode, updateNode, updateInternals])

    return elRef
}
