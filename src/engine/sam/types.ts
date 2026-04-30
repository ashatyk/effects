export type SamPoint = { point: [number, number]; label: number }

export type SamWorkerRequest =
    | { type: 'load_model' }
    | { type: 'encode_image'; data: { dataURL: string } }
    | { type: 'decode'; data: SamPoint[] }
    | { type: 'reset' }

export type SamWorkerResponse =
    | { type: 'model_loading'; data: { progress: number; status: string } }
    | { type: 'model_ready' }
    | { type: 'embeddings_ready'; data: { width: number; height: number } }
    | {
          type: 'decode_result'
          data: {
              /* Compact mask (1 byte per pixel, transferred from the
                 worker via `postMessage(..., [buffer])`). Previously we
                 sent it as `number[]` which is ~8x bigger in main heap. */
              mask: Uint8Array
              width: number
              height: number
              polygon: number[]
              score: number
          }
      }
    | { type: 'error'; data: { message: string } }
