import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'nodeEditor.pinnedIds.v1'

export interface PinState {
    pinnedIds: string[]
    isPinned: (id: string) => boolean
    togglePin: (id: string) => void
    unpin: (id: string) => void
    clear: () => void
    /* Replace the entire pin set wholesale. Used by scene-history to
       restore pins captured in a snapshot. */
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

/**
 * Owns the pin set and exposes mutation helpers. Persists to localStorage so
 * the user's pin layout survives reloads — independent of scene snapshots
 * (pinning is a UX preference, not part of the graph). Snapshots may also
 * capture pinned ids and call `setAll` during undo/redo to restore them.
 *
 * IDs that no longer correspond to existing nodes are silently dropped on
 * read; we never resurrect stale pins.
 */
export function usePinState({ liveNodeIds }: { liveNodeIds: Set<string> }): PinState {
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPersisted())

    /* Track the latest live ids in a ref so `setAll` can filter stale ids
       at call time without needing to be re-created when the live set
       changes. Keeps the returned helpers stable across renders. */
    const liveRef = useRef(liveNodeIds)
    liveRef.current = liveNodeIds

    /* Drop pins whose nodes have been deleted/never restored. Runs whenever
       the live id set changes — cheap O(n) reconcile. */
    useEffect(() => {
        setPinnedIds(prev => {
            const next = prev.filter(id => liveNodeIds.has(id))
            return next.length === prev.length ? prev : next
        })
    }, [liveNodeIds])

    /* Persist on every mutation. */
    useEffect(() => { writePersisted(pinnedIds) }, [pinnedIds])

    const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds])

    const togglePin = useCallback((id: string) => {
        setPinnedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }, [])

    const unpin = useCallback((id: string) => {
        setPinnedIds(prev => prev.filter(x => x !== id))
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

    return useMemo<PinState>(() => ({ pinnedIds, isPinned, togglePin, unpin, clear, setAll }),
        [pinnedIds, isPinned, togglePin, unpin, clear, setAll])
}

/**
 * Thin context wrapper around a `PinState`. State is owned by the parent
 * (via `usePinState`) so it can be threaded into hooks that live above the
 * provider in the JSX tree (e.g. scene-history).
 */
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
