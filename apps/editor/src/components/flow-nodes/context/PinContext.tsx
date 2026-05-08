import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'nodeEditor.pinnedIds.v1'

export interface PinState {
    pinnedIds: string[]
    isPinned: (id: string) => boolean
    togglePin: (id: string) => void
    clear: () => void
    setAll: (ids: string[]) => void
}

const PinCtx = createContext<PinState | null>(null)

function readPersisted(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const v = JSON.parse(raw)
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
    } catch { return [] }
}

function writePersisted(ids: string[]): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* quota / unavailable */ }
}

// Persists in localStorage (UX preference, not graph state). Snapshots may also drive setAll
// on undo/redo. Stale ids are dropped — we never resurrect deleted pins.
export function usePinState({ liveNodeIds }: { liveNodeIds: Set<string> }): PinState {
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPersisted())

    const liveRef = useRef(liveNodeIds)
    liveRef.current = liveNodeIds

    useEffect(() => {
        setPinnedIds(prev => {
            const next = prev.filter(id => liveNodeIds.has(id))
            return next.length === prev.length ? prev : next
        })
    }, [liveNodeIds])

    useEffect(() => { writePersisted(pinnedIds) }, [pinnedIds])

    const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds])

    const togglePin = useCallback((id: string) => {
        setPinnedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }, [])

    const clear = useCallback(() => setPinnedIds([]), [])

    const setAll = useCallback((ids: string[]) => {
        const safe = Array.isArray(ids) ? ids.filter(x => typeof x === 'string') : []
        const live = liveRef.current
        const filtered = live.size > 0 ? safe.filter(id => live.has(id)) : safe
        setPinnedIds(prev => {
            if (prev.length === filtered.length && prev.every((v, i) => v === filtered[i])) return prev
            return filtered
        })
    }, [])

    return useMemo<PinState>(() => ({ pinnedIds, isPinned, togglePin, clear, setAll }),
        [pinnedIds, isPinned, togglePin, clear, setAll])
}

export function PinProvider({ value, children }: {
    value: PinState
    children: React.ReactNode
}) {
    return <PinCtx.Provider value={value}>{children}</PinCtx.Provider>
}

export function usePinning(): PinState {
    const v = useContext(PinCtx)
    if (!v) throw new Error('usePinning must be inside PinProvider')
    return v
}
