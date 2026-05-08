import { createContext, useContext } from 'react'

// True while rendered outside RF (e.g. pin sidebar) — used to suppress Handles / NodeResizer.
const HeadlessNodeCtx = createContext<boolean>(false)

export const HeadlessNodeProvider = HeadlessNodeCtx.Provider

export function useIsHeadlessNode(): boolean {
    return useContext(HeadlessNodeCtx)
}
