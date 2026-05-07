// language=GLSL
export default `#version 300 es
precision highp float;

/* per-vertex: which corner of the segment quad this vertex represents.
   aLocal.x ∈ {0,1} — 0 = start of segment, 1 = end.
   aLocal.y ∈ {0,1} — 0 = inner edge (closer to contour), 1 = outer edge. */
in vec2 aLocal;

/* per-instance segment endpoints in pixel coords. */
in vec2 aPosition;       // start position
in vec2 aPositionNext;   // end position
in vec2 aTangent;        // unit tangent at start
in vec2 aTangentNext;    // unit tangent at end
in float aArcS;          // arc length at start (NOT wrapped)
in float aArcSNext;      // arc length at end

out vec2 vUV;

uniform vec2 uResolution;
uniform float uTextHeight;       // px — height of the text strip on screen (baseline)

/* Animation channels — vec4(drive, raw, value, state).
   Slot 1: uChan1.z — additive radial offset (px).
   Slot 2: uChan2.z — multiplier on uTextHeight.
   .z is the controller-mapped value (lerp(min, max, raw)). */
uniform vec4 uChan1;
uniform vec4 uChan2;

void main() {
    /* Pick segment endpoint (start vs end) by aLocal.x. */
    vec2 p   = mix(aPosition,  aPositionNext, aLocal.x);
    vec2 t   = mix(aTangent,   aTangentNext,  aLocal.x);
    /* Re-normalize the interpolated tangent (linear lerp shrinks it). */
    t = t / max(length(t), 1e-5);
    vec2 n = vec2(-t.y, t.x);

    /* Animated strip thickness and radial offset. */
    float h = uTextHeight * uChan2.z;
    float side = (aLocal.y - 0.5) * h + uChan1.z;

    vec2 worldPos = p + n * side;
    vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    /* UV.x is the (unwrapped) arc length at this vertex; the fragment shader
       wraps it through mod(uv.x, 1.0) so a single segment can span the seam
       between two phrase repetitions cleanly. */
    float arc = mix(aArcS, aArcSNext, aLocal.x);
    vUV = vec2(arc, aLocal.y);
}
`
