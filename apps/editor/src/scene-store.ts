import Dexie, { type EntityTable } from 'dexie'
import type { SerializedNode, SerializedEdge } from '@effects/runtime'

/* Re-exported so editor code imports one name; the canonical wire
   format lives in `@effects/runtime` for Tier-2/Tier-3 consumers. */
export type { SerializedNode, SerializedEdge }

export interface SceneSnapshot {
    id?: number
    timestamp: number
    label: string
    nodeIdCounter: number
    /* Tier-2 publish-plane manifest schema version. Bump only on
       breaking changes to the published surface; reads default to `1`
       via `??` so legacy snapshots stay loadable. See
       `@effects/runtime → PUBLISH_MANIFEST_VERSION`. */
    manifestVersion?: number
    /* Pin is a UX preference, global across pages — not per-page. */
    pinnedIds?: string[]
    /* `pages` is optional only so legacy snapshots (no `pages` field)
       migrate transparently via `applySnapshot` in `useSceneHistory.ts`.
       The DataflowEngine sees the union of real nodes/resolved edges
       across pages and knows nothing about pages itself. */
    pages?: SerializedPage[]
    activePageId?: string
    /* Legacy flat fields — read by `applySnapshot`'s migration path
       only when `pages` is missing. New writes always populate `pages`. */
    nodes?: SerializedNode[]
    edges?: SerializedEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

export interface SerializedPage {
    id: string                 // 'p_<int>'
    name: string               // user-given; defaults to 'Main'
    nodes: SerializedNode[]
    edges: SerializedEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

export interface BlobEntry {
    key: string
    blob: Blob
    mime: string
    width?: number
    height?: number
    updatedAt: number
}

class SceneDB extends Dexie {
    snapshots!: EntityTable<SceneSnapshot, 'id'>
    blobs!: EntityTable<BlobEntry, 'key'>

    constructor() {
        super('effects-scene-db')
        this.version(1).stores({
            snapshots: '++id, timestamp',
            blobs: 'key, updatedAt',
        })
    }
}

const db = new SceneDB()

const MAX_SNAPSHOTS = 80

export class SceneStore {
    private cursor = -1
    private count = 0

    async init(): Promise<void> {
        this.count = await db.snapshots.count()
        if (this.count > 0) {
            const last = await db.snapshots.orderBy('id').last()
            this.cursor = last?.id ?? -1
        }
    }

    async pushSnapshot(snap: Omit<SceneSnapshot, 'id' | 'timestamp'>): Promise<number> {
        if (this.cursor > 0) {
            await db.snapshots.where('id').above(this.cursor).delete()
        }

        const id = await db.snapshots.add({
            ...snap,
            timestamp: Date.now(),
        } as SceneSnapshot)

        this.cursor = id!
        this.count = await db.snapshots.count()

        if (this.count > MAX_SNAPSHOTS) {
            const excess = this.count - MAX_SNAPSHOTS
            const oldest = await db.snapshots.orderBy('id').limit(excess).primaryKeys()
            await db.snapshots.bulkDelete(oldest)
            this.count = await db.snapshots.count()
        }

        return id! as number
    }

    async undo(): Promise<SceneSnapshot | null> {
        if (this.cursor <= 0) return null
        const prev = await db.snapshots
            .where('id').below(this.cursor)
            .reverse()
            .first()
        if (!prev || !prev.id) return null
        this.cursor = prev.id
        return prev
    }

    async redo(): Promise<SceneSnapshot | null> {
        const next = await db.snapshots
            .where('id').above(this.cursor)
            .first()
        if (!next || !next.id) return null
        this.cursor = next.id
        return next
    }

    async currentSnapshot(): Promise<SceneSnapshot | null> {
        if (this.cursor <= 0) {
            return await db.snapshots.orderBy('id').last() ?? null
        }
        return await db.snapshots.get(this.cursor) ?? null
    }

    async putBlob(key: string, blob: Blob, meta?: { width?: number; height?: number }): Promise<void> {
        await db.blobs.put({
            key,
            blob,
            mime: blob.type || 'image/png',
            width: meta?.width,
            height: meta?.height,
            updatedAt: Date.now(),
        })
    }

    async putDataUrl(key: string, dataUrl: string, meta?: { width?: number; height?: number }): Promise<void> {
        const resp = await fetch(dataUrl)
        const blob = await resp.blob()
        await this.putBlob(key, blob, meta)
    }

    async getBlob(key: string): Promise<BlobEntry | undefined> {
        return db.blobs.get(key)
    }

    async getDataUrl(key: string): Promise<string | null> {
        const entry = await db.blobs.get(key)
        if (!entry) return null
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(entry.blob)
        })
    }

    async clearAll(): Promise<void> {
        await db.snapshots.clear()
        await db.blobs.clear()
        this.cursor = -1
        this.count = 0
    }
}

export const sceneStore = new SceneStore()
