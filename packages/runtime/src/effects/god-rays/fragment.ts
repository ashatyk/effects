// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(drive, raw, value, state).
       Slot 0: appearance progress (0..1) — uChan0.z multiplied into beam
               intensity.
       Slot 1: ray rotation phase (radians) — uChan1.z carries the
               controller-mapped value (slot range defaultMin..defaultMax
               is in radians, defaults to 0..2π). Wire Timer (looped) →
               AnimationController and dial slot-1 min/max to set the
               sweep. The controller's mapping is what governs amplitude
               here — reading .x would bypass it.
       Slot 4: intensity multiplier on final alpha. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;

    /* Pivot point in pixel space — the rotational centre the rays fan
       around. The Effect runtime binds this for every frame: when no
       "pivot" input is wired it falls back to the contour's AABB centre
       (and to the canvas centre if there's also no contour), so the
       effect always has a sensible focal point. Wire a Contour Pivot
       node into "effect.pivot" to drive it explicitly (centroid /
       centre-of-mass / arc / aabb / min / max + offset). */
    uniform vec2  uPivot;
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

    /* SDF format (see pipeline/passes/sdf-pure.ts): RGB carries
       24-bit biased = signed_d / MAX_D * 0.5 + 0.5 in [0, 1].
       Decode to signed pixels — negative inside, positive
       outside (canonical convention). A is always 1 — never
       sample it for inside/outside; check the sign of the
       returned value instead. */
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

        /* Appearance multiplier comes straight from slot 0. Curve shape
           (linear, easeIn/Out, S-curve, etc.) is up to the upstream
           Envelope / Interpolator easing — the shader no longer applies
           a cubic Bezier intro curve of its own. */
        float ax = uResolution.y / uResolution.x;
        vec2  va = vec2((p.x - ctr.x) * ax, (p.y - ctr.y));
        float theta = atan(va.x, va.y);

        float f = max(0.0001, uEdgeFeatherPx);
        float startRamp   = smoothstep(0.0, f, sdist);
        float radialAtten = exp(-uRayFalloff * sdist);
        /* Rotation phase comes from the controller-mapped value of slot 1
           (radians; slot defaults to 0..2π). Wire a Timer (looped) →
           AnimationController and tune Timer.durationMs for speed. */
        float phase = uChan1.z + TWO_PI * clamp(uRayPhaseOffsetFrac, 0.0, 1.0);
        float beam  = rayAngular(theta, uRayDensity, phase, uJoinSoftness) * uChan0.z;
        float m = uRayStrength * startRamp * radialAtten * beam;

        vec3 rgb = uColor.rgb * uColor.a * m;
        vec4 acc = vec4(rgb, uColor.a * m);
        acc *= uChan4.z;

        fragColor = clamp(acc, 0.0, 1.0);
    }
`
