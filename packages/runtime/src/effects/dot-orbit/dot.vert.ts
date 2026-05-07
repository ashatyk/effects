import { NOISE_GLSL } from '../../pipeline/noise.glsl'

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
uniform float uNoiseAmount;     // 0..1 — fraction of (max-min) replaced by noise
uniform float uNoiseScale;      // spatial frequency of noise (per 100 px)
uniform float uGlowSize;        // quad must be expanded by glow corona radius

/* Animation channels — vec4(drive, raw, value, state).
   Slot 0 (scroll): NOT read here. The runtime already folds the slot-0
           controller value into the per-instance scroll phase via
           pass.scrolling — every dot's aArcS arrives pre-shifted, so the
           travelling wave below naturally moves with the dots without
           the shader needing to read uChan0 separately. (Reading it here
           would double-scroll.)
   Slot 1: radial — uChan1.z additive radial offset (px).
   Slot 2: size   — uChan2.z multiplier on dot radius.
   Slot 5: noise time — uChan5.x drives noise drift independently of the
           wave. Canonical noise convention: .x (unclamped) so a Timer in
           'unbounded' mode produces continuous monotonic drift. */
uniform vec4 uChan1;
uniform vec4 uChan2;
uniform vec4 uChan5;

out vec2  vLocal;
out float vRadius;
out float vArc;
out float vHeightT;     // 0..1, normalized current radius — used for color/alpha bias

${NOISE_GLSL}

void main() {
    /* Compose dot height from a travelling sine wave plus low-frequency noise,
       both keyed off the per-instance arc length so the pattern flows along
       the contour rather than being attached to the screen.

       The wave's translation is already handled by the runtime: aArcS
       arrives shifted by the slot-0 scroll phase (see
       pass.scrolling.phaseSlot in the manifest), so the wave crests
       slide along with the dots automatically — no per-vertex slot-0
       read needed. Noise drift is independent and reads the canonical
       slot-5 .x (unclamped) so an unbounded Timer keeps the field
       drifting. The previous 'uChan0.x * 0.001' / 'uChan5.x * 0.001'
       factors were stale — they treated .x as milliseconds, which it
       hasn't been since autoTimer was retired in favour of Timer +
       Interpolator (Signal.value is dimensionless now). */
    float tNoiseRaw = uChan5.x;
    float arc01 = aArcS * 0.01;
    float wave  = sin(arc01 * uWaveFrequency);                                                         // -1..1
    float noise = valueNoise2D(vec2(arc01 * uNoiseScale, tNoiseRaw * 0.3)) * 2.0 - 1.0;                // -1..1
    float mixT  = mix(wave, noise, clamp(uNoiseAmount, 0.0, 1.0));                                     // -1..1
    float t01   = 0.5 + 0.5 * mixT;                                                                    // 0..1

    float radius = mix(max(uDotMinRadius, 0.5), uDotMaxRadius, t01) * uChan2.z;

    /* Anchor offset along the contour normal (radial channel). */
    vec2 nrm = vec2(-aTangent.y, aTangent.x);
    vec2 anchor = aPosition + nrm * uChan1.z;

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
