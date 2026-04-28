// language=GLSL
export default `
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform sampler2D verticalDistanceTexture;
uniform sampler2D depthTexture;

#define PACK_MAX 16777215.0
#define MAX_D    1200.0
#define SAMPLE_R 5

float unpack24(vec3 rgb){
    float n = (rgb.r * 255.0) * 65536.0
            + (rgb.g * 255.0) * 256.0
            + (rgb.b * 255.0);
    return n / PACK_MAX;
}

void main(){
    vec4 sdf = texture(verticalDistanceTexture, vUV);
    float dist = unpack24(sdf.rgb) * MAX_D;
    bool inside = sdf.a > 0.5;

    vec2 texel = 1.0 / uResolution;

    float gradStep = max(1.0, dist * 0.05);
    vec2 dx = vec2(texel.x * gradStep, 0.0);
    vec2 dy = vec2(0.0, texel.y * gradStep);

    float s00 = unpack24(texture(verticalDistanceTexture, vUV - dx - dy).rgb);
    float s10 = unpack24(texture(verticalDistanceTexture, vUV      - dy).rgb);
    float s20 = unpack24(texture(verticalDistanceTexture, vUV + dx - dy).rgb);
    float s01 = unpack24(texture(verticalDistanceTexture, vUV - dx     ).rgb);
    float s21 = unpack24(texture(verticalDistanceTexture, vUV + dx     ).rgb);
    float s02 = unpack24(texture(verticalDistanceTexture, vUV - dx + dy).rgb);
    float s12 = unpack24(texture(verticalDistanceTexture, vUV      + dy).rgb);
    float s22 = unpack24(texture(verticalDistanceTexture, vUV + dx + dy).rgb);

    vec2 grad = vec2(
        (s20 + 2.0*s21 + s22) - (s00 + 2.0*s01 + s02),
        (s02 + 2.0*s12 + s22) - (s00 + 2.0*s10 + s20)
    );

    float signedDist = inside ? -dist : dist;
    vec2 dir = length(grad) > 1e-6 ? normalize(grad) : vec2(0.0);
    vec2 boundaryUV = clamp(vUV - dir * signedDist / uResolution, 0.0, 1.0);

    // Sample depth in a wide disk around the projected boundary point.
    // This smooths out Voronoi ridge discontinuities at their source.
    float sampleSpread = max(2.0, dist * 0.04);
    float sum = 0.0;
    float wSum = 0.0;
    for (int iy = -SAMPLE_R; iy <= SAMPLE_R; iy++) {
        for (int ix = -SAMPLE_R; ix <= SAMPLE_R; ix++) {
            float r2 = float(ix*ix + iy*iy);
            if (r2 > float(SAMPLE_R * SAMPLE_R)) continue;
            float w = exp(-r2 / float(SAMPLE_R));
            vec2 offset = vec2(float(ix), float(iy)) * texel * sampleSpread;
            sum += texture(depthTexture, boundaryUV + offset).r * w;
            wSum += w;
        }
    }
    float refDepth = sum / wSum;
    fragColor = vec4(refDepth, refDepth, refDepth, 1.0);
}
`
