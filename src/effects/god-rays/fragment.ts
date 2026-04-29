// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(time_ms, raw, value, state).
       Slot 0: appearance progress (0..1).
       Slot 1: ray rotation phase — uChan1.x is monotonic ms.
       Slot 4: intensity multiplier on final alpha. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;

    uniform vec4  uPointAABB;
    uniform sampler2D verticalDistanceTexture;
    uniform sampler2D depthTexture;
    uniform sampler2D depthRefTexture;

    uniform float uDepthSoftness;
    uniform float uDepthEnabled;
    uniform float uEdgeFeatherPx;

    uniform vec4 uColor;
    uniform float uRayStrength;
    uniform float uRayDensity;
    uniform float uRaySpeed;
    uniform float uRayFalloff;
    uniform float uJoinSoftness;
    uniform float uRayPhaseOffsetFrac;

    uniform vec4  uEaseCubic;

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
        vec4 t = texture(verticalDistanceTexture, uv);
        float d = unpackFloat24(t.xyz, 1200.0);
        return (t.w > 0.5) ? -d : d;
    }

    float rayAngular(float theta, float density, float phase, float joinSoft){
        return smoothstep(0.0, 1.0 - 0.85*clamp(joinSoft, 0.0, 1.0), max(0.0, cos(theta * density + phase)));
    }

    float reachPx(float falloff, float feather){
        return (falloff > 0.0) ? (log(1.0 / EPS_ATTEN) / falloff + feather) : INF_F;
    }

    float bez3(float t, float p0, float p1, float p2, float p3){
        float u=1.0-t; return u*u*u*p0 + 3.0*u*u*t*p1 + 3.0*u*t*t*p2 + t*t*t*p3;
    }

    float dBez3(float t, float p0, float p1, float p2, float p3){
        float u=1.0-t;
        return 3.0*u*u*(p1-p0) + 6.0*u*t*(p2-p1) + 3.0*t*t*(p3-p2);
    }

    float cubicBezierEase(float x, vec2 p1, vec2 p2){
        float t = x;
        for(int i=0;i<5;i++){
            float x_t = bez3(t,0.0,p1.x,p2.x,1.0);
            float dx  = dBez3(t,0.0,p1.x,p2.x,1.0);
            float diff = x_t - x;
            if(abs(diff) < 1e-5) break;
            t = clamp(t - diff / max(dx,1e-5), 0.0, 1.0);
        }
        return bez3(t,0.0,p1.y,p2.y,1.0);
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

        /* Progress drives the appearance ramp; uChan0.z is 0..1. */
        float s = uChan0.z;
        vec2 c1 = uEaseCubic.xy, c2 = uEaseCubic.zw;
        float apearInter = cubicBezierEase(s * 2.0, c1, c2);

        float ax = uResolution.y / uResolution.x;
        vec2  va = vec2((p.x - ctr.x) * ax, (p.y - ctr.y));
        float theta = atan(va.x, va.y);

        float f = max(0.0001, uEdgeFeatherPx);
        float startRamp   = smoothstep(0.0, f, sdist);
        float radialAtten = exp(-uRayFalloff * sdist);
        float phase = (uChan1.x * 0.001) * uRaySpeed + TWO_PI * clamp(uRayPhaseOffsetFrac, 0.0, 1.0);
        float beam  = rayAngular(theta, uRayDensity, phase, uJoinSoftness) * apearInter;
        float m = uRayStrength * startRamp * radialAtten * beam;

        vec3 rgb = uColor.rgb * uColor.a * m;
        vec4 acc = vec4(rgb, uColor.a * m);

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }
        acc *= depthMask * uChan4.z;

        fragColor = clamp(acc, 0.0, 1.0);
    }
`
