export default function sdfBlurV(blurRadius = 10, blurStep = 2.0): string {
// language=GLSL
return `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform sampler2D sdfHRTTexture;

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

float readSigned(vec2 uv){
    vec4 t = texture(sdfHRTTexture, uv);
    float dist = unpack(t.rgb);
    float s = (t.a > 0.5) ? -dist : dist;
    return s;
}

void main(){
    vec2 texel = 1.0 / uResolution;
    float sum = 0.0;
    float w   = 0.0;

    for (int dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; ++dy){
        float k = 1.0;
        sum += readSigned(vUV + vec2(0.0, float(dy)*BLUR_STEP*texel.y));
        w   += k;
    }
    float s = sum / max(w, 1.0);

    float dist = abs(s);

    float inside = s < 0.0 ? 1.0 : 0.0;

    fragColor = vec4(pack(dist), inside);
}
`
}
