import { useMemo } from 'react'
import type { DerivePublishedSurfaceResult } from '@effects/runtime'
import { useScene } from '../SceneContext'
import { deriveFromPages, publishStructuralHash } from '../publish-from-pages'

// Memoised; recomputes only when publishStructuralHash changes (skips viewport/page-name edits).
export function useDerivedSurface(): DerivePublishedSurfaceResult {
    const { pages } = useScene()
    const hash = publishStructuralHash(pages)
    return useMemo(
        () => deriveFromPages(pages),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hash],
    )
}
