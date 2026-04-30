export function createDepthWorker(): Worker {
    const code = `
    let pipelineFn = null;
    let estimator = null;

    self.onmessage = async (e) => {
        const { type, data } = e.data;
        try {
            if (type === 'estimate') {
                if (!pipelineFn) {
                    self.postMessage({ type: 'progress', data: { status: 'Downloading depth library...' } });
                    const transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
                    transformers.env.allowLocalModels = false;
                    pipelineFn = transformers.pipeline;
                }

                if (!estimator) {
                    self.postMessage({ type: 'progress', data: { status: 'Loading depth model weights...' } });
                    estimator = await pipelineFn('depth-estimation', 'onnx-community/depth-anything-v2-base');
                }

                self.postMessage({ type: 'progress', data: { status: 'Estimating depth...' } });
                const result = await estimator(data.dataURL);
                const depthImage = result.depth;
                const w = depthImage.width;
                const h = depthImage.height;
                const raw = depthImage.data;

                const channels = raw.length / (w * h);
                let minV = Infinity, maxV = -Infinity;
                for (let i = 0; i < w * h; i++) {
                    const v = raw[i * channels];
                    if (v < minV) minV = v;
                    if (v > maxV) maxV = v;
                }
                const range = maxV - minV || 1;
                const grayscale = new Array(w * h);
                for (let i = 0; i < w * h; i++) {
                    grayscale[i] = 255 - Math.round(((raw[i * channels] - minV) / range) * 255);
                }

                self.postMessage({
                    type: 'depth_result',
                    data: { depth: grayscale, width: w, height: h }
                });
            }
        } catch (err) {
            self.postMessage({ type: 'error', data: { message: String(err?.stack || err?.message || err) } });
        }
    };
    `

    const blob = new Blob([code], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url, { type: 'module' })
    URL.revokeObjectURL(url)
    return worker
}
