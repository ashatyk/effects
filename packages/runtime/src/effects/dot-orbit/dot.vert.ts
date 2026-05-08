import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `#version 300 es
precision highp float;

/* aLocal ∈ {-1,+1}^2 — corner of the centered unit quad; doubles as
   disk-local position so length(vLocal) is the SDF to the disk centre. */
in vec2 aLocal;

in vec2 aPosition;
in vec2 aTangent;
in float aArcS;

uniform vec2 uResolution;

uniform float uDotMinRadius;
uniform float uDotMaxRadius;
uniform float uWaveFrequency;   // cycles per 100 px of arc length
uniform float uNoiseAmount;     // 0..1 — fraction of (max-min) replaced by noise
uniform float uNoiseScale;      // spatial frequency of noise (per 100 px)
uniform float uGlowSize;        // quad expanded by glow corona radius

/* Animation channels — vec4(drive, raw, value, state).
   Slot 0 (scroll): NOT read here — runtime pre-shifts aArcS via
           pass.scrolling.phaseSlot, so reading uChan0 would double-scroll.
   Slot 1: radial offset (px) — uChan1.z.
   Slot 2: size multiplier — uChan2.z.
   Slot 5: noise drift time — uChan5.x (canonical .x, unclamped) so an
           'unbounded' Timer produces continuous monotonic drift. */
uniform vec4 uChan1;
uniform vec4 uChan2;
uniform vec4 uChan5;

out vec2  vLocal;
out float vRadius;
out float vArc;
out float vHeightT;     // 0..1, normalized current radius

${NOISE_GLSL}

void main() {
    /* Dot height = travelling sine + low-freq noise, keyed off arc length
       so the pattern flows with the contour, not the screen. aArcS arrives
       pre-shifted by slot-0 scroll phase (see pass.scrolling). Noise drift
       reads slot-5 .x (canonical, unclamped) — the legacy '* 0.001' ms→s
       factor was retired with autoTimer; Signal.value is dimensionless. */
    float tNoiseRaw = uChan5.x;
    float arc01 = aArcS * 0.01;
    float wave  = sin(arc01 * uWaveFrequency);                                                         // -1..1
    float noise = valueNoise2D(vec2(arc01 * uNoiseScale, tNoiseRaw * 0.3)) * 2.0 - 1.0;                // -1..1
    float mixT  = mix(wave, noise, clamp(uNoiseAmount, 0.0, 1.0));                                     // -1..1
    float t01   = 0.5 + 0.5 * mixT;                                                                    // 0..1

    float radius = mix(max(uDotMinRadius, 0.5), uDotMaxRadius, t01) * uChan2.z;

    // Anchor offset along the contour normal (radial channel).
    vec2 nrm = vec2(-aTangent.y, aTangent.x);
    vec2 anchor = aPosition + nrm * uChan1.z;

    /* Expand the billboard so the corona (r ∈ [1, glowSize] disk-local)
       fits without quad-edge clipping (visible stair-steps on small dots).
       vLocal is re-normalised so 1.0 == disk edge in fragment space. */
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
