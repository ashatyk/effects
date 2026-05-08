// language=GLSL
export default `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

/* Text strip atlas (white-on-black) on txcn1. uTxcn1Aspect = w/h, set
   by EffectProcessor from connected texture dimensions. */
uniform sampler2D uTxcn1;
uniform float uTxcn1Aspect;

uniform vec4 uTextColor;
uniform vec4 uGlowColor;
uniform float uGlowIntensity;

uniform float uContourLen;    // total arc length of the contour (px)
uniform float uTextHeight;    // height of text strip on canvas (px, baseline)
uniform float uTextRepeats;   // how many phrase copies per contour (baseline)
uniform float uTextRepeatPadding; // px gap between phrase repeats along contour
uniform float uTextEdgeAA;        // softness of the glyph alpha cutoff (0..0.5)

/* uChan3.z = phrase-length multiplier (more spacing = fewer repeats).
   uChan4.z = alpha multiplier. */
uniform vec4 uChan3;
uniform vec4 uChan4;

void main() {
    float natural = max(1.0, uTextHeight * uTxcn1Aspect);
    float repeats = max(1.0, uTextRepeats);
    float requested = (uContourLen / repeats) * uChan3.z;
    if (requested <= 1.0) requested = natural;

    /* Snap period to a whole number of phrases — otherwise the seam where
       the closed contour wraps shows a chopped letter (last segment's u
       at totalLength+phasePx doesn't match the first segment's at phasePx
       even though they share geometry). Same trick as marching-ants. */
    float periodsCount = max(floor(uContourLen / max(requested, 1.0) + 0.5), 1.0);
    float phraseArc = max(uContourLen / periodsCount, 1.0);

    // Reserve padFrac of each slot for inter-phrase padding (discarded).
    float padFrac = clamp(uTextRepeatPadding / max(phraseArc, 1.0), 0.0, 0.95);
    float u = mod(vUV.x / phraseArc, 1.0);
    if (u > 1.0 - padFrac) discard;
    float uTex = u / max(1.0 - padFrac, 1e-3);

    float v = clamp(vUV.y, 0.0, 1.0);
    float lum = texture(uTxcn1, vec2(uTex, v)).r;

    // Soft alpha cutoff — uTextEdgeAA = transition width in lum-units.
    float aa = max(uTextEdgeAA, 1e-3);
    float alphaMask = smoothstep(0.0, aa, lum);
    if (alphaMask <= 0.0) discard;

    // Inner glow on near-edge pixels.
    float glow = (1.0 - lum) * uGlowIntensity;
    vec3 color = uTextColor.rgb * lum + uGlowColor.rgb * glow;
    float alpha = uTextColor.a * (lum + glow * 0.5) * alphaMask * uChan4.z;

    fragColor = vec4(color * alpha, alpha);
}
`
