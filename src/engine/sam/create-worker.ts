export function createSamWorker(): Worker {
    const code = `
    let env, SamModel, AutoProcessor, RawImage, Tensor, cv;
    let image_embeddings = null;
    let image_inputs = null;
    let imgW = 0, imgH = 0;
    let libsLoaded = false;

    async function loadLibs() {
        if (libsLoaded) return;
        self.postMessage({ type: 'model_loading', data: { progress: 0.05, status: 'Downloading transformers.js...' } });
        const transformers = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0');
        env = transformers.env;
        SamModel = transformers.SamModel;
        AutoProcessor = transformers.AutoProcessor;
        RawImage = transformers.RawImage;
        Tensor = transformers.Tensor;
        env.allowLocalModels = false;

        self.postMessage({ type: 'model_loading', data: { progress: 0.15, status: 'Downloading OpenCV.js...' } });
        const ocv = await import('https://cdn.jsdelivr.net/npm/@opencvjs/web@4.11.0-release.1/lib/index.js');
        cv = await ocv.loadOpenCV();
        await cv.ready;

        libsLoaded = true;
    }

    let model = null;
    let processor = null;

    async function getModelAndProcessor() {
        if (!model) {
            self.postMessage({ type: 'model_loading', data: { progress: 0.3, status: 'Loading SAM model weights...' } });
            model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform', { quantized: true });
        }
        if (!processor) {
            processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
        }
        return { model, processor };
    }

    function maskToPolygon(mask01, W, H, epsilon) {
        let src = cv.matFromArray(H, W, cv.CV_8UC1, mask01);
        let bin = new cv.Mat();
        cv.threshold(src, bin, 0, 255, cv.THRESH_BINARY);

        const contours = new cv.MatVector();
        const hier = new cv.Mat();
        cv.findContours(bin, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() === 0) {
            src.delete(); bin.delete(); contours.delete(); hier.delete();
            return [];
        }

        let maxIdx = 0, maxArea = -1;
        for (let i = 0; i < contours.size(); i++) {
            const a = cv.contourArea(contours.get(i), false);
            if (a > maxArea) { maxArea = a; maxIdx = i; }
        }

        const approx = new cv.Mat();
        cv.approxPolyDP(contours.get(maxIdx), approx, Math.max(1e-3, epsilon), true);
        const data = approx.data32S;
        const out = new Array(data.length);
        for (let i = 0; i < data.length; i++) out[i] = data[i];

        src.delete(); bin.delete(); contours.delete(); hier.delete(); approx.delete();
        return out;
    }

    self.postMessage({ type: 'model_loading', data: { progress: 0, status: 'Worker started' } });

    self.onmessage = async (e) => {
        const { type, data } = e.data;

        try {
            if (type === 'load_model') {
                await loadLibs();
                await getModelAndProcessor();
                self.postMessage({ type: 'model_ready' });
                return;
            }

            if (type === 'encode_image') {
                await loadLibs();
                const { model: m, processor: p } = await getModelAndProcessor();
                self.postMessage({ type: 'model_loading', data: { progress: 0.5, status: 'Computing image embeddings...' } });

                const image = await RawImage.read(data.dataURL);
                imgW = image.width;
                imgH = image.height;
                image_inputs = await p(image);
                image_embeddings = await m.get_image_embeddings(image_inputs);

                self.postMessage({ type: 'embeddings_ready', data: { width: imgW, height: imgH } });
                return;
            }

            if (type === 'decode') {
                if (!image_inputs || !image_embeddings) {
                    self.postMessage({ type: 'error', data: { message: 'No image encoded yet' } });
                    return;
                }

                const reshaped = image_inputs.reshaped_input_sizes[0];
                const points = data.map(x => [x.point[0] * reshaped[1], x.point[1] * reshaped[0]]);
                const labels = data.map(x => BigInt(x.label));

                const input_points = new Tensor(
                    'float32',
                    points.flat(Infinity),
                    [1, 1, points.length, 2],
                );
                const input_labels = new Tensor(
                    'int64',
                    labels.flat(Infinity),
                    [1, 1, labels.length],
                );

                const outputs = await model({
                    ...image_embeddings,
                    input_points,
                    input_labels,
                });

                const masks = await processor.post_process_masks(
                    outputs.pred_masks,
                    image_inputs.original_sizes,
                    image_inputs.reshaped_input_sizes,
                );

                const mask = RawImage.fromTensor(masks[0][0]);
                const scores = outputs.iou_scores.data;
                const numMasks = scores.length;
                let bestIndex = 0;
                for (let i = 1; i < numMasks; i++) {
                    if (scores[i] > scores[bestIndex]) bestIndex = i;
                }

                const W = mask.width;
                const H = mask.height;
                const maskData = mask.data;
                const mask01 = new Uint8Array(W * H);
                for (let i = 0; i < W * H; i++) {
                    mask01[i] = maskData[numMasks * i + bestIndex] === 1 ? 1 : 0;
                }

                const polygon = maskToPolygon(mask01, W, H, 2.0);
                const maskArr = Array.from(mask01);

                self.postMessage({
                    type: 'decode_result',
                    data: { mask: maskArr, width: W, height: H, polygon, score: scores[bestIndex] }
                });
                return;
            }

            if (type === 'reset') {
                image_inputs = null;
                image_embeddings = null;
                imgW = 0; imgH = 0;
                self.postMessage({ type: 'model_ready' });
            }
        } catch (err) {
            self.postMessage({ type: 'error', data: { message: String(err?.stack || err?.message || err) } });
        }
    };
    `

    const blob = new Blob([code], { type: 'application/javascript' })
    return new Worker(URL.createObjectURL(blob), { type: 'module' })
}
