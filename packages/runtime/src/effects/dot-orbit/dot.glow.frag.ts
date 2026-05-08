// language=GLSL
export default `#version 300 es
precision highp float;

in vec2  vLocal;
in float vRadius;

out vec4 fragColor;

uniform vec4  uGlowColor;
uniform float uGlowSize;
uniform float uGlowIntensity;
uniform float uEdgeSoftness;

/* uChan3.z = glow-intensity multiplier; uChan4.z = alpha multiplier
   (.z = controller-mapped lerp(min, max, raw)). */
uniform vec4 uChan3;
uniform vec4 uChan4;

/* Glow-only pass. 'add' blend merges halos into a soft cloud; the disk
   footprint is masked out ('step(1.0, r)') so the core pass on top
   isn't darkened — the original single-pass version stacked glow over
   disk repeatedly, hence the "pink fringe over red head" bug. */
void main() {
    float r = length(vLocal);

    float gw = max(uGlowSize, 1.0);
    float corona = step(1.0, r) * (1.0 - smoothstep(1.0, gw, r));
    corona *= corona;
    float glow = corona * uGlowIntensity * uChan3.z;

    if (glow < 1e-3) discard;

    float a = uGlowColor.a * glow * uChan4.z;
    vec3 rgb = uGlowColor.rgb * a;
    fragColor = vec4(rgb, a);
}
`
