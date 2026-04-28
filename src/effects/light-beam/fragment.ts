// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(time_ms, raw, value, state). */
    uniform vec4 uChan_progress;   // z = 0..1 appearance progress
    uniform vec4 uChan_intensity;  // alpha multiplier
    uniform vec4 uChan_phase;      // x = time_ms — drives ray phase

    uniform vec4  uPointAABB;
    uniform sampler2D verticalDistanceTexture;
    uniform sampler2D depthTexture;
    uniform sampler2D depthRefTexture;

    uniform float uDepthSoftness;
    uniform float uDepthEnabled;
    uniform float uEdgeFeatherPx;

    uniform vec4 uColor0, uColor1, uColor2;

    uniform vec3 uRayStrength3;
    uniform vec3 uRayDensity3;
    uniform vec3 uRaySpeed3;
    uniform vec3 uRayFalloff3;
    uniform vec3 uJoinSoftness3;

    uniform vec3 uRayPhaseOffsetFrac3;

    uniform vec4  uEaseCubic;
    uniform float uAnimationSpeed;

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

    vec4 layer(float theta, float d, vec4 color, float strength, float density, float speed, float falloff, float joinSoft, float phaseOffsetFrac, float inter){
        float f = max(0.0001, uEdgeFeatherPx);
        float startRamp   = smoothstep(0.0, f, d);
        float radialAtten = exp(-falloff * d);
        float phase = (uChan_phase.x * 0.001) * speed + TWO_PI * clamp(phaseOffsetFrac, 0.0, 1.0);
        float beam  = rayAngular(theta, density, phase, joinSoft) * inter;
        float m = strength * startRamp * radialAtten * beam;
        vec3 rgb = color.rgb * color.a * m;
        return vec4(rgb, color.a * m);
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
        vec2 p = vUV * uResolution;

        vec2 bbMin = uPointAABB.xy * uResolution;
        vec2 bbMax = uPointAABB.zw * uResolution;
        vec2 ctr   = 0.5 * (bbMin + bbMax);

        float sdist = signedDistancePx(vUV);

        vec2 c1 = uEaseCubic.xy, c2 = uEaseCubic.zw;
        float startS = uChan_progress.z;
        float apearInter = cubicBezierEase(startS * 2.0, c1, c2);

        bool a0 = (uRayStrength3.x > 0.0) && (uRayDensity3.x > 0.0) && (uColor0.a > 0.0);
        bool a1 = (uRayStrength3.y > 0.0) && (uRayDensity3.y > 0.0) && (uColor1.a > 0.0);
        bool a2 = (uRayStrength3.z > 0.0) && (uRayDensity3.z > 0.0) && (uColor2.a > 0.0);

        if (!(a0 || a1 || a2)) { discard; }

        float dMax = 0.0;
        if (a0) dMax = max(dMax, reachPx(uRayFalloff3.x, EPS_ATTEN));
        if (a1) dMax = max(dMax, reachPx(uRayFalloff3.y, EPS_ATTEN));
        if (a2) dMax = max(dMax, reachPx(uRayFalloff3.z, EPS_ATTEN));

        float ax = uResolution.y / uResolution.x;
        vec2  va = vec2((p.x - ctr.x) * ax, (p.y - ctr.y));
        float theta = atan(va.x, va.y);

        float d = abs(sdist);

        vec4 acc = vec4(0.0);

        if (a0) acc += layer(theta, d, uColor0, uRayStrength3.x, uRayDensity3.x, uRaySpeed3.x, uRayFalloff3.x, uJoinSoftness3.x, uRayPhaseOffsetFrac3.x, apearInter);
        if (a1) acc += layer(theta, d, uColor1, uRayStrength3.y, uRayDensity3.y, uRaySpeed3.y, uRayFalloff3.y, uJoinSoftness3.y, uRayPhaseOffsetFrac3.y, apearInter);
        if (a2) acc += layer(theta, d, uColor2, uRayStrength3.z, uRayDensity3.z, uRaySpeed3.z, uRayFalloff3.z, uJoinSoftness3.z, uRayPhaseOffsetFrac3.z, apearInter);

        if (sdist > 0.0 && uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            float depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
            acc *= depthMask;
        }
        acc *= uChan_intensity.z;

        fragColor = clamp(acc, 0.0, 1.0);
    }
`
