export type DepthResult = {
    data: Uint8Array
    width: number
    height: number
}

export type DepthStatus = 'idle' | 'loading-model' | 'estimating' | 'ready' | 'error'

export type DepthWorkerResponse =
    | { type: 'progress'; data: { status: string } }
    | { type: 'depth_result'; data: { depth: number[]; width: number; height: number } }
    | { type: 'error'; data: { message: string } }
