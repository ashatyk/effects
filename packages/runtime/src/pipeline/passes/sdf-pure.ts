// language=GLSL
/*
 * Signed distance to a closed contour, packed across RGB as 24-bit
 * `biased = signed_d / MAX_D * 0.5 + 0.5` ∈ [0,1]; A=1.0 always.
 *
 * Why A=1 (not the old "inside flag in alpha"): Canvas2D round-trips
 * (Pixi extract.base64 → Assets.load(dataUrl)) premultiply on write
 * and divide by alpha on read, so any A=0 pixel reads back RGB=0,
 * turning the entire outside-the-shape region into a fake boundary.
 * Effects sampling outside the silhouette (god-rays, light-beam,
 * dot-grid-orbit, text-grid-orbit, ping-pong-morphing) rendered
 * blank in the Tier-3 player even though they looked correct in the
 * editor. Folding inside into the sign of the distance keeps A=1
 * everywhere and survives the round-trip.
 *
 * Precision: 23-bit signed across [-MAX_D, +MAX_D]. With MAX_D =
 * max(uResolution.x, uResolution.y) ≈ 1200 px on the default canvas
 * the per-pixel precision is ~0.00014 px.
 *
 * TODO: MAX_D is hardcoded to 1200 in shaders — lift to a uniform if
 * effects need drastically different canvas sizes.
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

    /* Sign: negative inside, positive outside. Bias to [0,1] for 24-bit
       RGB packing; A=1 keeps the texture safe across PNG/Canvas2D round-trips. */
    float maxD = max(uResolution.x, uResolution.y);
    float signed_d = (sd.y > 0.5) ? -sd.x : sd.x;
    float biased = clamp(signed_d / maxD * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(pack(biased), 1.0);
}
`
