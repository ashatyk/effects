/**
 * Canonical noise primitives used across all effect shaders.
 *
 * Shape contract (do NOT redefine these locally in any shader):
 *   hash21(vec2)        — per-cell 0..1 hash (deterministic, no time)
 *   valueNoise2D(vec2)  — bilinearly-interpolated 2D value noise, smoothstep weights
 *   fbm2D(vec2)         — 3-octave fbm sum on top of valueNoise2D, range ~0..1
 *
 * Time-driven shaders feed `xy + uChan5.x * 0.001 * driftDir` into these
 * functions — uChan5 is the dedicated "noise time" slot in the animation
 * pool (see `src/pipeline/types.ts`). Drift speed is controlled upstream
 * by the Timer driving slot 5, not by a per-effect speed uniform.
 *
 * The string is appended into each fragment/vertex shader between
 * `#version 300 es; precision ...` and `void main()`. Keeping the chunk in
 * TS (rather than per-shader copies) ensures a single source of truth so a
 * future noise-visualizer node renders exactly what the effects sample.
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
