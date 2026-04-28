// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(time_ms, raw, value, state). */
    uniform vec4 uChan_progress;   // z = 0..1 morph progress
    uniform vec4 uChan_intensity;  // alpha multiplier
    uniform vec4 uChan_phase;      // x = time_ms — drives noise drift

    //sdfTexture
    uniform sampler2D verticalDistanceTexture;   // RGB packed [0..1], A insideFlag
    uniform sampler2D depthTexture;
    uniform sampler2D depthRefTexture;

    uniform float uDepthSoftness;
    uniform float uDepthEnabled;

    // Полигон
    uniform vec4 uPointAABB;

    // Эффект
    uniform float uCenterTranslation;
    uniform float uEdgeFeatherPx;
    uniform float uWaveBasePx;
    uniform float uWaveAmpPx;
    uniform float uWaveWidthPx;
    uniform float uWaveSpeed;
    uniform float uAnimationSpeed;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uOpacity;
    uniform float uMaxDistancePx;
    uniform float uWave2ShiftPx;

    uniform float uNoiseScalePx;
    uniform float uNoiseAmpPx;
    uniform float uNoiseSpeed;
    uniform float uNoiseSeedOffset;

    uniform vec4  uEaseCubic;

    // --- Зубчатый профиль волны по углу вокруг центра ---
    // 0=tri-wrap, 1=saw, 2=square
    uniform float uToothShape;
    uniform float uToothMix;       // 0..1
    uniform float uToothAmpPx;     // амплитуда в px
    uniform float uToothCount;     // число зубцов по кругу
    uniform float uToothPhase;     // сдвиг [0..1]
    uniform float uToothSharp;     // для saw >=1
    uniform float uToothDuty;      // для square [0..1]
    uniform float uToothSmooth;    // для square ~0..0.49

    float saturate(float x){ return clamp(x,0.0,1.0); }

    float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = smoothstep(0.0, 1.0, f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
    }

    float fbm(vec2 p){
        float a=0.0, amp=0.5;
        for(int i=0;i<3;i++){
            a+=amp*valueNoise(p);
            p=p*2.02+17.0;
            amp*=0.5;
        }
        return a;
    }

    float jaggedNoise(vec2 p){
        float n = fbm(p);
        return 2.0*n - 1.0;
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

    // --- Угловой зубчатый профиль ---
    float toothSaw01(float x, float sharp){
        return pow(fract(x), max(sharp, 1e-3));
    }
    
    float toothTriWrap01(float x){
        float f = fract(x);
        return 1.0 - abs(2.0*f - 1.0);
    }
    
    float toothSquare01(float x, float duty, float smoothW){
        float f = fract(x);
        float e = clamp(smoothW, 1e-4, 0.49);
        duty = clamp(duty, 1e-4, 1.0 - 1e-4);
        float a = 1.0 - smoothstep(duty - e, duty + e, f);
        float b = smoothstep(1.0 - e, 1.0, f);
        return clamp(max(a, b), 0.0, 1.0);
    }
    
    float toothOffsetPx(vec2 qPx, vec2 centerPx,float apearInter){
        if (uToothMix <= 0.0 || uToothAmpPx <= 0.0 || uToothCount <= 0.0) return 0.0;
        vec2  r   = qPx - centerPx;
        float ang = atan(r.y, r.x);                         // [-pi..pi]
        float ang01 = (ang + 3.14159265) / (6.28318530);    // [0..1]
        float phase = ang01 * uToothCount + uToothPhase;

        float s01;
        if (uToothShape == 0.0)      s01 = toothTriWrap01(phase);
        else if (uToothShape == 1.0) s01 = toothSaw01(phase, max(uToothSharp,1.0));
        else                       s01 = toothSquare01(phase, uToothDuty, uToothSmooth);

        float bip = 2.0*s01 - 1.0;                          // [-1..1]
        return uToothAmpPx * bip * saturate(uToothMix) * apearInter;
    }

    float waveAlpha(
        vec2 q,
        float d,
        float centerOffsetPx,
        float halfW,
        float sc,
        vec2 drift,
        vec2 centerN,
        float seedShift,
        float profileOffsetPx // новый параметр
    ){
        float seed = fract(dot(centerN, vec2(0.3183099,0.3678794)) + seedShift);
        vec2 nP = (q + drift + vec2(131.0,59.0)*seed)/sc;

        float n = jaggedNoise(nP);
        float dNoisy = d - uNoiseAmpPx * n;

        // вычитаем зубчатый профиль
        float dProfile = dNoisy - profileOffsetPx;

        float aa = max(fwidth(dProfile), 0.75);
        float m1 = smoothstep(centerOffsetPx - halfW - aa, centerOffsetPx - halfW + aa, dProfile);
        float m2 = 1.0 - smoothstep(centerOffsetPx + halfW - aa, centerOffsetPx + halfW + aa, dProfile);
        return m1 * m2;
    }

    float unpackFloat24(vec3 rgb, float maxD){
        float n = (rgb.r * 255.0) * 65536.0 +
        (rgb.g * 255.0) * 256.0 +
        (rgb.b * 255.0);
        return (n / 16777215.0) * maxD;
    }

    void main() {
        vec2 bbMinPx = uPointAABB.xy * uResolution;
        vec2 bbMaxPx = uPointAABB.zw * uResolution;
        vec2 centerPx = 0.5 * (bbMinPx + bbMaxPx);

        vec2 p = vUV * uResolution;
        vec2 q = mix(p, centerPx, uCenterTranslation);

        float halfW = max(uWaveWidthPx, 0.0) * 0.5;

        vec4 sdfTexture = texture(verticalDistanceTexture, vUV);
        vec2 di = vec2(unpackFloat24(sdfTexture.xyz, 1200.0), sdfTexture.w);
        float d = di.x;

        if (di.y > 0.5) {
            discard;
        }

        /* Progress is the controller's authoritative driver of the morph.
           uChan_progress.z is in 0..1; uChan_phase.x is monotonic ms. */
        float tSec = uChan_phase.x * 0.001;
        float sApear = uChan_progress.z;

        vec2 c1 = uEaseCubic.xy, c2 = uEaseCubic.zw;

        float apearInter = cubicBezierEase(sApear * 2.0, c1, c2);

        float s = fract(tSec * max(uWaveSpeed, 0.0));
        
        float halfInter = (s < 0.5) ? cubicBezierEase(s * 2.0, c1, c2)
        : cubicBezierEase(2.0 - s * 2.0, c1, c2);

        float centerOffset1 = (uWaveBasePx * apearInter + uWaveAmpPx * (2.0 * halfInter - 1.0));
        float centerOffset2 = centerOffset1;
        float centerOffset3 = centerOffset1 + uWave2ShiftPx;
        float centerOffset4 = centerOffset1 + uWave2ShiftPx;

        float sc = max(uNoiseScalePx, 1e-3);
        vec2 drift  = uNoiseSpeed * tSec * vec2(0.73, -0.51);
        vec2 centerN = 0.5 * (uPointAABB.xy + uPointAABB.zw);

        // зубчатый оффсет в пикселях
        float dTooth = toothOffsetPx(q, centerPx,apearInter);

        float a1 = saturate(waveAlpha(q, d, centerOffset1, halfW,           sc, drift * 1.0, centerN, 0.00,             dTooth) * uOpacity);
        float a2 = saturate(waveAlpha(q, d, centerOffset2, halfW + 2.0,     sc, drift * 1.0, centerN, 0.00,             dTooth) * (uOpacity * 0.2));
        float a3 = saturate(waveAlpha(q, d, centerOffset3, halfW * 1.20,    sc, drift * 2.3, centerN, uNoiseSeedOffset, dTooth) * uOpacity);
        float a4 = saturate(waveAlpha(q, d, centerOffset4, halfW * 1.20+2.0,sc, drift * 2.3, centerN, uNoiseSeedOffset, dTooth) * (uOpacity * 0.2));

        float edgeMask = smoothstep(uEdgeFeatherPx - d, uEdgeFeatherPx + d, d);

        vec3 C1 = uColor1 * a1; float A1 = a1;
        vec3 C2 = vec3(0.0);    float A2 = a2;
        vec3 C3 = uColor2 * a3; float A3 = a3;
        vec3 C4 = vec3(0.0);    float A4 = a4;

        vec3 C12  = C1 + (1.0 - A1) * C2;
        float A12 = A1 + (1.0 - A1) * A2;
        vec3 C123 = C12 + (1.0 - A12) * C3;
        float A123= A12 + (1.0 - A12) * A3;
        vec3 Cp   = C123 + (1.0 - A123) * C4;
        float A   = A123 + (1.0 - A123) * A4;

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        fragColor = vec4(Cp * edgeMask * depthMask * uChan_intensity.z, A * edgeMask * depthMask * uChan_intensity.z);
    }
`
