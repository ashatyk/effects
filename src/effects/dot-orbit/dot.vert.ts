// language=GLSL
export default `#version 300 es
precision highp float;

/* Per-vertex: corner of the centered unit quad. aLocal ∈ {-1, +1}^2.
   At fragment time we use aLocal as the disk-local position so length(vLocal)
   gives a unit-radius signed-distance to the disk centre. */
in vec2 aLocal;

/* Per-instance: where this dot lives on the contour and its arc-length param. */
in vec2 aPosition;
in vec2 aTangent;
in float aArcS;

uniform vec2 uResolution;

uniform float uDotMinRadius;
uniform float uDotMaxRadius;
uniform float uWaveFrequency;   // cycles per 100 px of arc length
uniform float uWaveSpeed;       // rad/sec phase advance
uniform float uNoiseAmount;     // 0..1 — fraction of (max-min) replaced by noise
uniform float uNoiseScale;      // spatial frequency of noise (per 100 px)
uniform float uGlowSize;        // quad must be expanded by glow corona radius

/* Animation channels — vec4(time_ms, raw, value, state). */
uniform vec4 uChan_scroll;      // x = time_ms since clip start (drives wobble)
uniform vec4 uChan_radial;      // additive radial offset of dot anchor (px)
uniform vec4 uChan_size;        // multiplier on dot radius

out vec2  vLocal;
out float vRadius;
out float vArc;
out float vHeightT;     // 0..1, normalized current radius — used for color/alpha bias

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

/* 1D value noise with smoothstep interpolation — cheap, no atlas, plenty of
   character variation per instance. */
float vnoise11(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
}

void main() {
    /* Compose dot height from a travelling sine wave plus low-frequency noise,
       both keyed off the per-instance arc length so the pattern flows along
       the contour rather than being attached to the screen. The temporal
       phase is driven by the scroll channel's elapsed time (sec). */
    float tSec  = uChan_scroll.x * 0.001;
    float arc01 = aArcS * 0.01;
    float wave  = sin(arc01 * uWaveFrequency + tSec * uWaveSpeed);            // -1..1
    float noise = vnoise11(arc01 * uNoiseScale + tSec * 0.3) * 2.0 - 1.0;     // -1..1
    float mixT  = mix(wave, noise, clamp(uNoiseAmount, 0.0, 1.0));             // -1..1
    float t01   = 0.5 + 0.5 * mixT;                                            // 0..1

    float radius = mix(max(uDotMinRadius, 0.5), uDotMaxRadius, t01) * uChan_size.z;

    /* Anchor offset along the contour normal (radial channel). */
    vec2 nrm = vec2(-aTangent.y, aTangent.x);
    vec2 anchor = aPosition + nrm * uChan_radial.z;

    /* Expand the billboard quad by glow size so the outer corona (rendered
       at r in [1, glowSize] in disk-local units) fits inside the polygon
       and isnt clipped by the quad edges (which would produce visible
       square stair-steps around small dots).

       Re-normalize vLocal so that 1.0 == disk edge in fragment space,
       independent of how far the quad extends past it. */
    float quadHalf = max(uGlowSize, 1.0);
    vec2 worldPos = anchor + aLocal * radius * quadHalf;
    vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    vLocal   = aLocal * quadHalf;
    vRadius  = radius;
    vArc     = aArcS;
    vHeightT = t01;
}
`
