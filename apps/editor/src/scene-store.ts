import Dexie, { type EntityTable } from 'dexie'
import type { SerializedNode, SerializedEdge } from '@effects/runtime'

/* ── Schema types ── */

/* `SerializedNode` and `SerializedEdge` are the wire format also used
   by `PublishedPipeline.graph` (consumed by Tier-2/Tier-3). They live
   in the runtime package so supplier-app and any future native runner
   can decode them without depending on the editor. Re-export here so
   editor code can keep importing one name. */
export type { SerializedNode, SerializedEdge }

export interface SceneSnapshot {
    id?: number
    timestamp: number
    label: string
    nodeIdCounter: number
    /* Tier-2 publish-plane manifest schema version. Default `1` — the
       value future Tier-2 supplier-app and Tier-3 runtime check before
       loading a `PublishedPipeline` derived from this snapshot. Bump
       only on breaking changes to the published surface (new required
       fields, removed slots, or anything else that breaks consumers
       compiled against an older shape). Reads default to `1` via `??`
       so legacy snapshots are still loadable. See
       `@effects/runtime → PUBLISH_MANIFEST_VERSION`. */
    manifestVersion?: number
    /* Pinned nodes are global across pages — pin is a UX preference, not
       a per-page setting. */
    pinnedIds?: string[]
    /* ── Pages (current source of truth) ───────────────────────────── */
    /* The scene is a list of named pages, each owning its own
       nodes/edges/viewport. The DataflowEngine sees the union of all
       real (non-clone) nodes and the resolved edges across pages — it
       knows nothing about pages itself. `pages` is optional only to
       allow legacy snapshots (no `pages` field) to migrate transparently
       — see `applySnapshot` in `useSceneHistory.ts`. */
    pages?: SerializedPage[]
    activePageId?: string
    /* ── Legacy flat fields (DEPRECATED) ───────────────────────────── */
    /* Read by the migration path in `applySnapshot` only when `pages`
       is missing. New writes should always populate `pages` instead. */
    nodes?: SerializedNode[]
    edges?: SerializedEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

/**
 * One scenario tab in the editor. Contains its own slice of the graph
 * plus a viewport so each page remembers where the user was zoomed.
 */
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

/* ── Dexie DB ── */

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

/* ── SceneStore: public API ── */

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

    /* ── Snapshots (undo / redo) ── */

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

    /* ── Blob storage (images, textures) ── */

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

    /* ── Housekeeping ── */

    async clearAll(): Promise<void> {
        await db.snapshots.clear()
        await db.blobs.clear()
        this.cursor = -1
        this.count = 0
    }
}

export const sceneStore = new SceneStore()
