// language=GLSL
export default `#version 300 es
precision highp float;

/* Per-segment ribbon attributes (one instance per arc segment). */
in vec2 aLocal;

in vec2  aPosition;
in vec2  aPositionNext;
in vec2  aTangent;
in vec2  aTangentNext;
in float aArcS;
in float aArcSNext;

uniform vec2  uResolution;
uniform float uBandHeight;     // strip thickness in pixels (baseline)

/* Animation channels (vec4 = time_ms, raw, value, state).
   Slot 1: radial offset in px (additive).
   Slot 2: multiplier on uBandHeight. */
uniform vec4 uChan1;
uniform vec4 uChan2;

out vec2 vUV;                  // (arcS_px, side_0..1)

/* Cubic Hermite interpolation along the segment.
   Linear interpolation of aPosition + aPositionNext makes the ribbon a
   poly-line, so dashes that straddle a sample point show a visible kink.
   Hermite uses the per-end tangents to produce a C^1 curve; adjacent
   segments share both the endpoint and the tangent at that point, so the
   ribbon is smooth across segment boundaries — no more seam kinks. */
void main() {
    float u  = aLocal.x;
    float u2 = u * u;
    float u3 = u2 * u;

    float h00 =  2.0 * u3 - 3.0 * u2 + 1.0;
    float h10 =        u3 - 2.0 * u2 + u;
    float h01 = -2.0 * u3 + 3.0 * u2;
    float h11 =        u3 -       u2;

    /* Segment length in arc-length pixels. (phasePx cancels in the diff,
       so this is the geometric length of this segment on the contour.) */
    float L = max(aArcSNext - aArcS, 1e-3);

    vec2 p = h00 * aPosition
           + h10 * (aTangent     * L)
           + h01 * aPositionNext
           + h11 * (aTangentNext * L);

    /* Analytic derivative of the Hermite — gives the curve tangent at u. */
    float d00 =  6.0 * u2 - 6.0 * u;
    float d10 =  3.0 * u2 - 4.0 * u + 1.0;
    float d01 = -6.0 * u2 + 6.0 * u;
    float d11 =  3.0 * u2 - 2.0 * u;

    vec2 dpdu = d00 * aPosition
              + d10 * (aTangent     * L)
              + d01 * aPositionNext
              + d11 * (aTangentNext * L);

    vec2 t = dpdu / max(length(dpdu), 1e-5);
    vec2 n = vec2(-t.y, t.x);

    /* Animated band thickness + radial offset of the strip centre. */
    float bandH = uBandHeight * uChan2.z;
    float side  = (aLocal.y - 0.5) * bandH + uChan1.z;
    vec2 worldPos = p + n * side;
    vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    /* UV.x = arc length in pixels (already scrolled by the pass runner);
       UV.y = 0..1 across the strip. */
    float arc = mix(aArcS, aArcSNext, u);
    vUV = vec2(arc, aLocal.y);
}
`
