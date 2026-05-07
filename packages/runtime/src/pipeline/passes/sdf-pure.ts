// language=GLSL
/*
 * Unsigned distance to a closed contour, packed as a SIGNED
 * normalised 24-bit value across RGB. Alpha is always 1.0.
 *
 * Encoding (versus the old "unsigned in RGB + inside flag in A"):
 *
 *   signed_d = inside ? -dist : +dist          // canonical SDF
 *                                              // (negative inside)
 *   biased   = clamp(signed_d / MAX_D * 0.5
 *                    + 0.5, 0.0, 1.0)          // 0..1
 *   RGB      = pack24(biased)                  // 24-bit precision
 *   A        = 1.0                             // never zero!
 *
 * Why the format changed: the old format put `inside` into the alpha
 * channel as 1.0 (inside) / 0.0 (outside). That meant every pixel
 * outside the silhouette had `A=0` — and the moment such a texture
 * round-trips through Canvas2D (which Pixi's `extract.base64` /
 * `Assets.load(dataUrl)` does internally), the canvas's
 * premultiplied-alpha storage destroys RGB on `A=0`:
 *   - putImageData → internal premultiply → `RGB *= 0`;
 *   - toDataURL → un-premultiply on read → `RGB / 0 = NaN → 0`.
 * Net effect: every pixel outside the silhouette read back as
 * RGB=0 (= "distance 0 = on the boundary"), turning the entire
 * outside-the-shape region into a fake boundary. Effects that
 * sample distance outside the silhouette (god-rays, light-beam,
 * dot-grid-orbit, text-grid-orbit, ping-pong-morphing) rendered
 * blank in the Tier-3 player even though they looked correct in
 * the editor.
 *
 * The new format folds the inside flag into the SIGN of the
 * distance value itself — `A=1` everywhere keeps every pixel safe
 * from the premultiply trip. Effects no longer need to read alpha
 * to know inside vs outside; they just check `signed_d < 0`.
 *
 * Precision: 24-bit / 2 = 23-bit signed → ~16M levels across
 * `[-MAX_D, +MAX_D]`. With `MAX_D = max(uResolution.x,
 * uResolution.y)` (~1200 px on the default canvas) the per-pixel
 * precision is ~0.00014 px — same order of magnitude as the old
 * format's unsigned 24-bit. The sign bit costs us nothing in
 * practical terms.
 *
 * `MAX_D` is hardcoded in shaders to `1200.0` (matches the default
 * canvas's larger dimension) — TODO: lift to a uniform if effects
 * need to support drastically different canvas sizes.
 */
export default `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2  uResolution;
uniform sampler2D uPointTexture;
uniform int   uPointTexelCount;
uniform vec2  uPointTextureDim;

#define MAX_POINTS 512

#define BYTE_MAX        255.0
#define BYTE_BASE       256.0
#define BYTE_BASE2      65536.0
#define PACK_MAX        16777215.0
#define ROUND_BIAS      0.5

vec3 pack(float x01){
    float n = clamp(x01, 0.0, 1.0) * PACK_MAX + ROUND_BIAS;
    float r = floor(n / BYTE_BASE2);
    n -= r * BYTE_BASE2;
    float g = floor(n / BYTE_BASE);
    float b = n - g * BYTE_BASE;
    return vec3(r, g, b) / BYTE_MAX;
}


vec2 readPointN(int i){
    int w = int(uPointTextureDim.x);
    ivec2 xy = ivec2(i % w, i / w);
    return texelFetch(uPointTexture, xy, 0).rg;
}

vec2 readPointPx(int i){ return readPointN(i) * uResolution; }

vec2 sdfU(vec2 p){
    float bestD2 = 1e14;
    bool inside = false;

    int N = min(uPointTexelCount, MAX_POINTS);
    vec2 a = readPointPx(0);

    for (int i = 0; i < MAX_POINTS; ++i){
        if (i >= N) break;
        int j = (i + 1 == N) ? 0 : (i + 1);
        vec2 b  = readPointPx(j);
        vec2 ab = b - a;

        vec2 pa = p - a;
        float denom = max(dot(ab,ab), 1e-8);
        float h = clamp(dot(pa,ab) / denom, 0.0, 1.0);
        vec2  diff = pa - ab * h;
        bestD2 = min(bestD2, dot(diff, diff));

        if (((a.y <= p.y) && (b.y > p.y)) || ((b.y <= p.y) && (a.y > p.y))){
            float xInt = a.x + (p.y - a.y) * ab.x / ab.y;
            if (p.x < xInt) inside = !inside;
        }
        a = b;
    }
    return vec2(sqrt(bestD2), inside ? 1.0 : 0.0);
}

void main(){
    vec2 pPx = vUV * uResolution;
    vec2 sd  = sdfU(pPx);

    /* Canonical SDF sign convention: negative inside, positive
       outside. Bias to [0, 1] for 24-bit RGB packing; A=1 always
       so the texture survives any PNG / Canvas2D round trip. */
    float maxD = max(uResolution.x, uResolution.y);
    float signed_d = (sd.y > 0.5) ? -sd.x : sd.x;
    float biased = clamp(signed_d / maxD * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(pack(biased), 1.0);
}
`
