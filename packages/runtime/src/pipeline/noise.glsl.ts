/**
 * Canonical noise primitives — DO NOT redefine locally in any shader.
 *   hash21(vec2)        — per-cell 0..1 deterministic hash
 *   valueNoise2D(vec2)  — bilinear value noise with smoothstep weights
 *   fbm2D(vec2)         — 3-octave fbm on valueNoise2D, range ~0..1
 *
 * Time-driven shaders feed `xy + uChan5.x * driftDir`; uChan5 is the
 * canonical "noise time" slot. Speed comes from the upstream Timer
 * driving slot 5, not a per-effect uniform.
 */
export const NOISE_GLSL = `
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float valueNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2D(vec2 p) {
    float a = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
        a += amp * valueNoise2D(p);
        p = p * 2.02 + 17.0;
        amp *= 0.5;
    }
    return a;
}
`
