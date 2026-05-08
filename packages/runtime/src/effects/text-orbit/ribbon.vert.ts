// language=GLSL
export default `#version 300 es
precision highp float;

/* aLocal.x ∈ {0,1}: 0=start, 1=end of segment along curve.
   aLocal.y ∈ {0,1}: 0=inner edge, 1=outer edge of strip. */
in vec2 aLocal;

in vec2 aPosition;
in vec2 aPositionNext;
in vec2 aTangent;
in vec2 aTangentNext;
in float aArcS;          // arc length at start (NOT wrapped)
in float aArcSNext;

out vec2 vUV;

uniform vec2 uResolution;
uniform float uTextHeight;       // text strip height on screen (px, baseline)

// uChan1.z = radial offset (px); uChan2.z = uTextHeight multiplier.
uniform vec4 uChan1;
uniform vec4 uChan2;

void main() {
    vec2 p   = mix(aPosition,  aPositionNext, aLocal.x);
    vec2 t   = mix(aTangent,   aTangentNext,  aLocal.x);
    // Re-normalise linear-lerped tangent.
    t = t / max(length(t), 1e-5);
    vec2 n = vec2(-t.y, t.x);

    float h = uTextHeight * uChan2.z;
    float side = (aLocal.y - 0.5) * h + uChan1.z;

    vec2 worldPos = p + n * side;
    vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    /* UV.x = unwrapped arc length; fragment shader does mod(uv.x, 1.0)
       so a single segment can cleanly span the phrase-repeat seam. */
    float arc = mix(aArcS, aArcSNext, aLocal.x);
    vUV = vec2(arc, aLocal.y);
}
`
