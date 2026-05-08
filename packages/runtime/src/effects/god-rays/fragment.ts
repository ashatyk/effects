// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(drive, raw, value, state).
       Slot 0: appearance progress 0..1 — uChan0.z multiplies beam intensity.
       Slot 1: ray rotation phase (radians, slot defaults 0..2π) — uChan1.z
               is the controller-mapped value. Reading .x would bypass the
               controller's min/max.
       Slot 4: intensity multiplier on final alpha. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;

    /* Pivot in pixel space. Effect runtime falls back to contour AABB
       centre (or canvas centre) when no pivot input is wired. */
    uniform vec2  uPivot;
    // SDF wired through generic texture channel 0.
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

    /* SDF format (pipeline/passes/sdf-pure.ts): 24-bit biased =
       signed_d / MAX_D * 0.5 + 0.5. Decode to signed pixels (negative
       inside, positive outside). A is always 1 — check the sign,
       never the alpha. */
    float unpackSignedFloat24(vec3 rgb, float maxD){
        float n = (rgb.r * 255.0) * 65536.0 +
        (rgb.g * 255.0) *   256.0 +
        (rgb.b * 255.0);
        float biased = n / 16777215.0;
        return (biased * 2.0 - 1.0) * maxD;
    }

    float signedDistancePx(vec2 uv){
        return unpackSignedFloat24(texture(uTxcn0, uv).rgb, 1200.0);
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
        vec2 ctr = uPivot;

        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) discard;

        float dMax = reachPx(uRayFalloff, EPS_ATTEN);
        if (sdist > dMax) discard;

        // Appearance multiplier comes straight from slot 0; easing is upstream.
        float ax = uResolution.y / uResolution.x;
        vec2  va = vec2((p.x - ctr.x) * ax, (p.y - ctr.y));
        float theta = atan(va.x, va.y);

        float f = max(0.0001, uEdgeFeatherPx);
        float startRamp   = smoothstep(0.0, f, sdist);
        float radialAtten = exp(-uRayFalloff * sdist);
        // Rotation phase = slot-1 mapped value (radians). Wire Timer→Controller; tune durationMs.
        float phase = uChan1.z + TWO_PI * clamp(uRayPhaseOffsetFrac, 0.0, 1.0);
        float beam  = rayAngular(theta, uRayDensity, phase, uJoinSoftness) * uChan0.z;
        float m = uRayStrength * startRamp * radialAtten * beam;

        vec3 rgb = uColor.rgb * uColor.a * m;
        vec4 acc = vec4(rgb, uColor.a * m);
        acc *= uChan4.z;

        fragColor = clamp(acc, 0.0, 1.0);
    }
`
