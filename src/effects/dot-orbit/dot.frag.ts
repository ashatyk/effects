// language=GLSL
export default `#version 300 es
precision highp float;

in vec2  vLocal;
in float vRadius;
in float vArc;
in float vHeightT;

out vec4 fragColor;

uniform float uContourLen;

uniform vec4  uColorA;
uniform vec4  uColorB;
uniform float uGradientFrequency;
uniform float uHeightTint;

uniform vec4  uGlowColor;
uniform float uGlowSize;
uniform float uGlowIntensity;
uniform float uEdgeSoftness;

/* Animation channels — vec4(time_ms, raw, value, state). */
uniform vec4 uChan_glow;       // multiplier on glow intensity
uniform vec4 uChan_intensity;  // alpha multiplier

void main() {
    float r = length(vLocal);

    /* Anti-aliased disk core. Edge softness is a pixel-space width, so we
       divide by the per-instance pixel radius to express it in disk-local
       units (1 unit of vLocal == vRadius pixels on screen). */
    float aaWidth = max(uEdgeSoftness, 0.001) / max(vRadius, 1.0);
    float disk = 1.0 - smoothstep(1.0 - aaWidth, 1.0, r);

    /* Outer halo: soft falloff in the corona r in [1, glowSize]. Quadratic
       for a softer look than linear; clipped inside the disk via step(). */
    float gw = max(uGlowSize, 1.0);
    float corona = step(1.0, r) * (1.0 - smoothstep(1.0, gw, r));
    corona *= corona;
    float glow = corona * uGlowIntensity * uChan_glow.z;

    /* Gradient along contour. uGradientFrequency 0 = single A->B sweep,
       otherwise that many A<->B cycles. We bias by current height so taller
       dots skew toward color B. */
    float arcN  = (uContourLen > 0.0) ? clamp(vArc / uContourLen, 0.0, 1.0) : 0.0;
    float gradT = (uGradientFrequency <= 0.0)
        ? arcN
        : 0.5 + 0.5 * sin(arcN * uGradientFrequency * 6.2831853);
    gradT = clamp(mix(gradT, vHeightT, clamp(uHeightTint, 0.0, 1.0)), 0.0, 1.0);

    vec3  baseCol = mix(uColorA.rgb, uColorB.rgb, gradT);
    float baseA   = mix(uColorA.a,   uColorB.a,   gradT);

    vec3  rgb = baseCol * disk + uGlowColor.rgb * glow;
    float a   = (baseA * disk + uGlowColor.a * glow) * uChan_intensity.z;

    if (a < 1e-3) discard;

    fragColor = vec4(rgb * a, a);
}
`
