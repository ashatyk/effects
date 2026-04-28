import Dexie, { type EntityTable } from 'dexie'

/* ── Schema types ── */

export interface SceneSnapshot {
    id?: number
    timestamp: number
    label: string
    nodes: SerializedNode[]
    edges: SerializedEdge[]
    nodeIdCounter: number
}

export interface SerializedNode {
    id: string
    type: string
    position: { x: number; y: number }
    data: {
        processor: string
        params: Record<string, unknown>
        label?: string
        imageUrl?: string
        [key: string]: unknown
    }
    style?: Record<string, unknown>
    selected?: boolean
}

export interface SerializedEdge {
    id?: string
    source: string
    sourceHandle?: string | null
    target: string
    targetHandle?: string | null
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

        this.cursor = id
        this.count = await db.snapshots.count()

        if (this.count > MAX_SNAPSHOTS) {
            const excess = this.count - MAX_SNAPSHOTS
            const oldest = await db.snapshots.orderBy('id').limit(excess).primaryKeys()
            await db.snapshots.bulkDelete(oldest)
            this.count = await db.snapshots.count()
        }

        return id
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

    get canUndo(): boolean { return this.cursor > 0 && this.count > 1 }

    get canRedo(): boolean {
        return this.cursor > 0 && this.cursor < (this.count > 0 ? Infinity : 0)
    }

    get snapshotCount(): number { return this.count }

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

    async getBlobUrl(key: string): Promise<string | null> {
        const entry = await db.blobs.get(key)
        if (!entry) return null
        return URL.createObjectURL(entry.blob)
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

    async deleteBlob(key: string): Promise<void> {
        await db.blobs.delete(key)
    }

    async hasBlob(key: string): Promise<boolean> {
        return (await db.blobs.get(key)) !== undefined
    }

    /* ── Housekeeping ── */

    async clearAll(): Promise<void> {
        await db.snapshots.clear()
        await db.blobs.clear()
        this.cursor = -1
        this.count = 0
    }

    async clearSnapshots(): Promise<void> {
        await db.snapshots.clear()
        this.cursor = -1
        this.count = 0
    }
}

export const sceneStore = new SceneStore()
