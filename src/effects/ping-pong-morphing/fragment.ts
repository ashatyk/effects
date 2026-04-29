import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(time_ms, raw, value, state).
       Slot 0: morph progress (0..1).
       Slot 1: wave phase — uChan1.x is monotonic ms.
       Slot 4: intensity multiplier on final colour & alpha.
       Slot 5: noise time — uChan5.x drives fbm drift independently of wave. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;
    uniform vec4 uChan5;

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
    uniform vec3 uColor;
    uniform float uOpacity;

    uniform float uNoiseScalePx;
    uniform float uNoiseAmpPx;
    uniform float uNoiseSpeed;

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

${NOISE_GLSL}

    /* Bipolar fbm in [-1, 1] used by the wave displacement. */
    float jaggedNoise(vec2 p){
        return 2.0 * fbm2D(p) - 1.0;
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

    float toothOffsetPx(vec2 qPx, vec2 centerPx, float apearInter){
        if (uToothMix <= 0.0 || uToothAmpPx <= 0.0 || uToothCount <= 0.0) return 0.0;
        vec2  r   = qPx - centerPx;
        float ang = atan(r.y, r.x);                         // [-pi..pi]
        float ang01 = (ang + 3.14159265) / (6.28318530);    // [0..1]
        float phase = ang01 * uToothCount + uToothPhase;

        float s01;
        if (uToothShape == 0.0)      s01 = toothTriWrap01(phase);
        else if (uToothShape == 1.0) s01 = toothSaw01(phase, max(uToothSharp,1.0));
        else                         s01 = toothSquare01(phase, uToothDuty, uToothSmooth);

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
        float profileOffsetPx
    ){
        float seed = fract(dot(centerN, vec2(0.3183099, 0.3678794)));
        vec2 nP = (q + drift + vec2(131.0, 59.0) * seed) / sc;

        float n = jaggedNoise(nP);
        float dNoisy = d - uNoiseAmpPx * n;
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

        /* Wave timing comes from uChan1; appearance ramp from uChan0;
           noise drift from uChan5 — fully decoupled time sources so each
           can be wired to its own animation graph. */
        float tWaveSec  = uChan1.x * 0.001;
        float tNoiseSec = uChan5.x * 0.001;
        float sApear    = uChan0.z;

        vec2 c1 = uEaseCubic.xy, c2 = uEaseCubic.zw;
        float apearInter = cubicBezierEase(sApear * 2.0, c1, c2);

        float s = fract(tWaveSec * max(uWaveSpeed, 0.0));

        float halfInter = (s < 0.5) ? cubicBezierEase(s * 2.0, c1, c2)
                                    : cubicBezierEase(2.0 - s * 2.0, c1, c2);

        float centerOffset1 = (uWaveBasePx * apearInter + uWaveAmpPx * (2.0 * halfInter - 1.0));

        float sc = max(uNoiseScalePx, 1e-3);
        vec2 drift  = uNoiseSpeed * tNoiseSec * vec2(0.73, -0.51);
        vec2 centerN = 0.5 * (uPointAABB.xy + uPointAABB.zw);

        float dTooth = toothOffsetPx(q, centerPx, apearInter);

        /* a1 = filled wave body, a2 = darker edge halo. The two-wave
           composition (filled + outline) is preserved; multi-wave looks
           are achieved by stacking another Effect node on top. */
        float a1 = saturate(waveAlpha(q, d, centerOffset1, halfW,       sc, drift, centerN, dTooth) * uOpacity);
        float a2 = saturate(waveAlpha(q, d, centerOffset1, halfW + 2.0, sc, drift, centerN, dTooth) * (uOpacity * 0.2));

        float edgeMask = smoothstep(uEdgeFeatherPx - d, uEdgeFeatherPx + d, d);

        vec3 C1 = uColor * a1; float A1 = a1;
        vec3 C2 = vec3(0.0);   float A2 = a2;

        vec3 Cp = C1 + (1.0 - A1) * C2;
        float A = A1 + (1.0 - A1) * A2;

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        fragColor = vec4(Cp * edgeMask * depthMask * uChan4.z, A * edgeMask * depthMask * uChan4.z);
    }
`
