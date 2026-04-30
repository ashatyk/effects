// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(drive, raw, value, state).
       Slot 0: appearance progress (0..1) — multiplied into beam intensity.
       Slot 1: ray rotation phase — uChan1.x carries the upstream signal
               value (radians). Wire AutoTimer in 'unbounded' mode and use
               slot-1 controller min/max to set the rotation range.
       Slot 4: intensity multiplier on final alpha. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;

    uniform vec4  uPointAABB;
    /* SDF (signed distance field) is wired through generic texture
       channel 0. Manifest declares the slot's UI label so the user
       knows to plug an SDF source into txcn0 on the Effect node. */
    uniform sampler2D uTxcn0;

    uniform float uEdgeFeatherPx;

    uniform vec4 uColor;
    uniform float uRayStrength;
    uniform float uRayDensity;
    uniform float uRayFalloff;
    uniform float uJoinSoftness;
    uniform float uRayPhaseOffsetFrac;

    const float TWO_PI    = 6.28318530718;
    const float EPS_ATTEN = 1e-3;
    const float INF_F     = 1e9;

    float unpackFloat24(vec3 rgb, float maxD){
        float n = (rgb.r * 255.0) * 65536.0 +
        (rgb.g * 255.0) *   256.0 +
        (rgb.b * 255.0);
        return (n / 16777215.0) * maxD;
    }

    float signedDistancePx(vec2 uv){
        vec4 t = texture(uTxcn0, uv);
        float d = unpackFloat24(t.xyz, 1200.0);
        return (t.w > 0.5) ? -d : d;
    }

    float rayAngular(float theta, float density, float phase, float joinSoft){
        return smoothstep(0.0, 1.0 - 0.85*clamp(joinSoft, 0.0, 1.0), max(0.0, cos(theta * density + phase)));
    }

    float reachPx(float falloff, float feather){
        return (falloff > 0.0) ? (log(1.0 / EPS_ATTEN) / falloff + feather) : INF_F;
    }

    void main(){
        if (uRayStrength <= 0.0 || uRayDensity <= 0.0 || uColor.a <= 0.0) discard;

        vec2 p = vUV * uResolution;

        vec2 bbMin = uPointAABB.xy * uResolution;
        vec2 bbMax = uPointAABB.zw * uResolution;
        vec2 ctr   = 0.5 * (bbMin + bbMax);

        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) discard;

        float dMax = reachPx(uRayFalloff, EPS_ATTEN);
        if (sdist > dMax) discard;

        /* Appearance multiplier comes straight from slot 0. Curve shape
           (linear, easeIn/Out, S-curve, etc.) is up to the upstream
           Envelope / AutoTimer easing — the shader no longer applies a
           cubic Bezier intro curve of its own. */
        float ax = uResolution.y / uResolution.x;
        vec2  va = vec2((p.x - ctr.x) * ax, (p.y - ctr.y));
        float theta = atan(va.x, va.y);

        float f = max(0.0001, uEdgeFeatherPx);
        float startRamp   = smoothstep(0.0, f, sdist);
        float radialAtten = exp(-uRayFalloff * sdist);
        /* Rotation phase = upstream signal value (radians). Wire an
           AutoTimer in 'unbounded' mode (durationMs governs speed) and
           map the controller slot 1 to whatever radian range is desired. */
        float phase = uChan1.x + TWO_PI * clamp(uRayPhaseOffsetFrac, 0.0, 1.0);
        float beam  = rayAngular(theta, uRayDensity, phase, uJoinSoftness) * uChan0.z;
        float m = uRayStrength * startRamp * radialAtten * beam;

        vec3 rgb = uColor.rgb * uColor.a * m;
        vec4 acc = vec4(rgb, uColor.a * m);
        acc *= uChan4.z;

        fragColor = clamp(acc, 0.0, 1.0);
    }
`
