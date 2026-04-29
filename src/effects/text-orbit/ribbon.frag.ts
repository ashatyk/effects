// language=GLSL
export default `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uAtlas;     // text strip texture (white text on black)

uniform vec4 uTextColor;
uniform vec4 uGlowColor;
uniform float uGlowIntensity;

uniform float uContourLen;    // total arc length of the contour (px)
uniform float uTextAspect;    // strip width / strip height
uniform float uTextHeight;    // height of text strip on canvas (px, baseline)
uniform float uTextRepeats;   // how many phrase copies per contour (baseline)
uniform float uTextRepeatPadding; // px gap between phrase repeats along contour
uniform float uTextEdgeAA;        // softness of the glyph alpha cutoff (0..0.5)

/* Animation channels — vec4(time_ms, raw, value, state).
   Slot 3: spacing — multiplier on phrase length (more spacing = fewer repeats).
   Slot 4: intensity — alpha multiplier. */
uniform vec4 uChan3;
uniform vec4 uChan4;

void main() {
    /* Phrase arc length used for UV mapping.
       If repeats > 0, fit "repeats" phrases around the entire contour.
       Otherwise use the natural aspect-driven length (1 phrase). */
    float natural = max(1.0, uTextHeight * uTextAspect);
    float repeats = max(1.0, uTextRepeats);
    float phraseArc = (uContourLen / repeats) * uChan3.z;
    if (phraseArc <= 1.0) phraseArc = natural;

    /* Reserve a fraction of the slot for inter-repeat padding. The text
       texture is mapped onto [0 .. 1 - padFrac] of each slot; the remaining
       [1 - padFrac .. 1] is discarded so adjacent phrases dont touch. */
    float padFrac = clamp(uTextRepeatPadding / max(phraseArc, 1.0), 0.0, 0.95);
    float u = mod(vUV.x / phraseArc, 1.0);
    if (u > 1.0 - padFrac) discard;
    float uTex = u / max(1.0 - padFrac, 1e-3);

    float v = clamp(vUV.y, 0.0, 1.0);
    float lum = texture(uAtlas, vec2(uTex, v)).r;

    /* Soft alpha cutoff. uTextEdgeAA sets the width (in lum-units) of the
       transition where the glyph fades to transparent. 0 = hard threshold. */
    float aa = max(uTextEdgeAA, 1e-3);
    float alphaMask = smoothstep(0.0, aa, lum);
    if (alphaMask <= 0.0) discard;

    /* Inner glow: pixels close to text edge get extra glow color. */
    float glow = (1.0 - lum) * uGlowIntensity;
    vec3 color = uTextColor.rgb * lum + uGlowColor.rgb * glow;
    float alpha = uTextColor.a * (lum + glow * 0.5) * alphaMask * uChan4.z;

    fragColor = vec4(color * alpha, alpha);
}
`
