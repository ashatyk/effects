import { createContext, useContext } from 'react'

/**
 * `true` while a node view is being rendered outside of ReactFlow — for
 * example, inside the pin sidebar. Components consult this to suppress
 * react-flow-only chrome (Handles, NodeResizer) that would otherwise misbehave
 * or duplicate connection points.
 */
const HeadlessNodeCtx = createContext<boolean>(false)

export const HeadlessNodeProvider = HeadlessNodeCtx.Provider

export function useIsHeadlessNode(): boolean {
    return useContext(HeadlessNodeCtx)
}
