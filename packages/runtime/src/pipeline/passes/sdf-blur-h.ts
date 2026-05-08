/**
 * Horizontal SDF blur — same packed format as sdf-pure.ts. Averages
 * signed-normalised values (biased*2-1) so pixels straddling the
 * silhouette edge converge to ~0 instead of jumping between +d/-d.
 * sdf-blur-v.ts is the exact mirror.
 */
export default function sdfBlurH(blurRadius = 10, blurStep = 2.0): string {
// language=GLSL
return `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform sampler2D sdfRTTexture;

#define BYTE_MAX        255.0
#define BYTE_BASE       256.0
#define BYTE_BASE2      65536.0
#define PACK_MAX        16777215.0
#define ROUND_BIAS      0.5

#define BLUR_RADIUS ${blurRadius}
#define BLUR_STEP   ${blurStep.toFixed(1)}

float unpack(vec3 rgb){
    float n =
    + (rgb.r * BYTE_MAX) * BYTE_BASE2
    + (rgb.g * BYTE_MAX) * BYTE_BASE
    + (rgb.b * BYTE_MAX);
    return n / PACK_MAX;
}

vec3 pack(float x01){
    float n = clamp(x01, 0.0, 1.0) * PACK_MAX + ROUND_BIAS;
    float r = floor(n / BYTE_BASE2);
    n -= r * BYTE_BASE2;
    float g = floor(n / BYTE_BASE);
    float b = n - g * BYTE_BASE;
    return vec3(r, g, b) / BYTE_MAX;
}

float readSignedNormalised(vec2 uv){
    // Decode 24-bit biased RGB to signed normalised [-1,+1] for averaging.
    return unpack(texture(sdfRTTexture, uv).rgb) * 2.0 - 1.0;
}

void main(){
    vec2 texel = 1.0 / uResolution;
    float sum = 0.0;
    float w   = 0.0;

    for (int dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; ++dx){
        float k = 1.0;

        sum += readSignedNormalised(vUV + vec2(float(dx)*BLUR_STEP*texel.x, 0.0));

        w += k;
    }

    float s = sum / max(w, 1.0);

    // Re-bias to [0,1] for 24-bit packing; A=1 survives PNG/Canvas2D round-trips.
    float biased = clamp(s * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(pack(biased), 1.0);
}
`
}
