import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'nodeEditor.pinnedIds.v1'

interface PinState {
    pinnedIds: string[]
    isPinned: (id: string) => boolean
    togglePin: (id: string) => void
    unpin: (id: string) => void
    clear: () => void
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
 * (pinning is a UX preference, not part of the graph).
 *
 * IDs that no longer correspond to existing nodes are silently dropped on
 * read; we never resurrect stale pins.
 */
export function PinProvider({ liveNodeIds, children }: {
    liveNodeIds: Set<string>
    children: React.ReactNode
}) {
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => readPersisted())

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

    const value = useMemo<PinState>(() => ({ pinnedIds, isPinned, togglePin, unpin, clear }),
        [pinnedIds, isPinned, togglePin, unpin, clear])

    return <PinCtx.Provider value={value}>{children}</PinCtx.Provider>
}

export function usePinning(): PinState {
    const v = useContext(PinCtx)
    if (!v) throw new Error('usePinning must be inside PinProvider')
    return v
}
