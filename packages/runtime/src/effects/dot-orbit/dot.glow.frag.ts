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

/* Animation channels — vec4(drive, raw, value, state).
   Slot 3: uChan3.z — multiplier on glow intensity.
   Slot 4: uChan4.z — alpha multiplier.
   .z is the controller-mapped value (lerp(min, max, raw)). */
uniform vec4 uChan3;
uniform vec4 uChan4;

/**
 * Glow-only pass for DotOrbit. Renders the corona that surrounds each disk
 * and *nothing else*; the actual disk core is painted in a separate normal-
 * blend pass on top so the trailing dot's halo can never cover the leading
 * dot's body. Pixi 'add' blend on this pass merges every halo into a soft
 * cloud rather than alpha-stacking glow over disk → glow over disk → …,
 * which is what produced the pink fringe over the red head in the original
 * single-pass version. The disk's own footprint is masked out
 * ('step(1.0, r)') so nothing the core pass paints later gets darkened by
 * the glow underneath.
 */
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
