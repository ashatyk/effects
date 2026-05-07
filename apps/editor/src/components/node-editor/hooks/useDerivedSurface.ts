import { useMemo } from 'react'
import type { DerivePublishedSurfaceResult } from '@effects/runtime'
import { useScene } from '../SceneContext'
import { deriveFromPages, publishStructuralHash } from '../publish-from-pages'

/**
 * Memoised wrapper around `derivePublishedSurface`. Re-runs only when
 * something the publish traversal actually depends on changes — that
 * skips re-traversal on viewport pans, page renames, label edits on
 * unrelated nodes, etc.
 *
 * The hash is conservative: any node addition/removal, edge change,
 * exposed metadata edit, publishRoot/Config/event-source param change
 * busts the cache. False negatives (recompute when nothing changed)
 * are fine — the traversal is pure CPU and cheap.
 */
export function useDerivedSurface(): DerivePublishedSurfaceResult {
    const { pages } = useScene()
    const hash = publishStructuralHash(pages)
    return useMemo(
        () => deriveFromPages(pages),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hash],
    )
}
