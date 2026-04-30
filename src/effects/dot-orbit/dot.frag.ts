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
uniform float uEdgeSoftness;

/* Animation channels — vec4(time_ms, raw, value, state).
   Slot 4: intensity — alpha multiplier. */
uniform vec4 uChan4;

/**
 * Core-only pass for DotOrbit. Renders the anti-aliased solid disk and
 * nothing else — the corona is painted in a sibling additive 'glow' pass
 * underneath. Splitting the two pieces into separate passes (glow under
 * normal-blend cores) keeps each tail dot's halo from leaking across the
 * head dot it overlaps.
 *
 * The companion runtime sorts instances by predicted wave height before
 * uploading the buffer, so larger dots (head) draw last and fully occlude
 * smaller adjacent dots (tail) when their disks overlap.
 */
void main() {
    float r = length(vLocal);

    /* Anti-aliased disk core. Edge softness is a pixel-space width, so we
       divide by the per-instance pixel radius to express it in disk-local
       units (1 unit of vLocal == vRadius pixels on screen). */
    float aaWidth = max(uEdgeSoftness, 0.001) / max(vRadius, 1.0);
    float disk = 1.0 - smoothstep(1.0 - aaWidth, 1.0, r);
    if (disk < 1e-3) discard;

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

    float a = baseA * disk * uChan4.z;
    if (a < 1e-3) discard;
    fragColor = vec4(baseCol * a, a);
}
`
