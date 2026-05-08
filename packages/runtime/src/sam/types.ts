export type SamPoint = { point: [number, number]; label: number }

export type SamWorkerResponse =
    | { type: 'model_loading'; data: { progress: number; status: string } }
    | { type: 'model_ready' }
    | { type: 'embeddings_ready'; data: { width: number; height: number } }
    | {
          type: 'decode_result'
          data: {
              /* Uint8Array (1 byte/pixel) transferred via postMessage([buffer])
                 — number[] was ~8x larger in the main heap. */
              mask: Uint8Array
              width: number
              height: number
              polygon: number[]
              score: number
          }
      }
    | { type: 'error'; data: { message: string } }
