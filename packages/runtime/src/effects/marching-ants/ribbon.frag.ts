// language=GLSL
export default `#version 300 es
precision highp float;

in vec2 vUV;                   // (arcS_px, side_0..1)
out vec4 fragColor;

uniform float uBandHeight;     // visible band thickness in px (baseline; must match vert)
uniform float uDashLen;        // dash segment length in px (along arc; baseline)
uniform float uGapLen;         // gap segment length in px  (along arc; baseline)
uniform float uCornerRadius;   // dash corner-radius in px (0 => sharp rect, halfBand => capsule)
uniform float uEdgeAA;         // arc-length edge softness in px
uniform float uCrossAA;        // cross-band edge softness in px
uniform float uContourLen;     // total perimeter in px (set by pass runner)
uniform vec4  uColor;          // dash colour
uniform vec4  uColorAlt;       // gap  colour (alpha=0 => transparent gap)

/* uChan2.z = width multiplier on uBandHeight (matches vert).
   uChan3.z = spacing multiplier on dash+gap period.
   uChan4.z = alpha multiplier. */
uniform vec4 uChan2;
uniform vec4 uChan3;
uniform vec4 uChan4;

// SDF to a rounded box centred at origin (b=half-extents, r=corner radius).
float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float bandMask(float vY, float bandH) {
    float yCentered = abs(vY - 0.5) * 2.0;
    float aaUV = clamp(uCrossAA / max(bandH, 1.0), 0.0, 0.5);
    return 1.0 - smoothstep(1.0 - aaUV, 1.0, yCentered);
}

void main() {
    float bandH    = uBandHeight * uChan2.z;
    float dashBase = uDashLen    * uChan3.z;
    float gapBase  = uGapLen     * uChan3.z;

    /* Snap period so the closed contour holds a whole number of dashes
       (preserves dash:gap ratio). Without this, mod() wraps total → 0
       leaves a visible seam dash. */
    float requested = max(dashBase + gapBase, 1.0);
    float periods   = max(floor(uContourLen / requested + 0.5), 1.0);
    float period    = max(uContourLen / periods, 1.0);
    float ratio     = dashBase / requested;
    float dashLen   = period * ratio;
    float halfDash  = dashLen * 0.5;
    float halfBand  = bandH * 0.5;

    /* Signed arc-distance to the *nearest* dash centre, wrapped across
       the period seam — otherwise dashes spanning a boundary appear
       "rounded only on one side". */
    float arc = mod(vUV.x - halfDash + period * 0.5, period) - period * 0.5;
    vec2  p   = vec2(arc, (vUV.y - 0.5) * bandH);

    float maxR = min(halfDash, halfBand);
    float r    = clamp(uCornerRadius, 0.0, maxR);
    float dist = sdRoundedBox(p, vec2(halfDash, halfBand), r);

    float aa   = max(uEdgeAA, 0.5);
    float dash = 1.0 - smoothstep(-aa, 0.0, dist);

    // "over" composite: dash on top of a rectangular gap-coloured band.
    float band  = bandMask(vUV.y, bandH);
    float dashA = uColor.a * dash;
    float gapA  = uColorAlt.a * band * (1.0 - dash);
    float a     = (dashA + gapA) * uChan4.z;
    if (a < 1e-3) discard;

    vec3 rgb = uColor.rgb * dashA + uColorAlt.rgb * gapA;
    fragColor = vec4(rgb * uChan4.z, a);
}
`
