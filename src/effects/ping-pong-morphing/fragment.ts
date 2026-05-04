import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision lowp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;

    /* Animation channels — vec4(drive, raw, value, state).
       Slot 0: appearance progress (0..1) — controls overall amplitude.
       Slot 1: ping-pong drive (0..1) — wire Timer → Interpolator with the
               'triangle' or 'bell' profile so the value oscillates 0..1..0
               over the period.
       Slot 4: intensity multiplier on final colour & alpha.
       Slot 5: noise time — uChan5.x drives fbm drift (unbounded value). */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;
    uniform vec4 uChan5;

    /* SDF wired through generic texture channel 0 (RGB packed [0..1],
       A insideFlag — see SdfFromContour processor). */
    uniform sampler2D uTxcn0;

    // Полигон
    uniform vec4 uPointAABB;

    // Эффект
    uniform float uCenterTranslation;
    uniform float uEdgeFeatherPx;
    uniform float uWaveBasePx;
    uniform float uWaveAmpPx;
    uniform float uWaveWidthPx;
    uniform vec3 uColor;
    uniform float uOpacity;

    uniform float uNoiseScalePx;
    uniform float uNoiseAmpPx;

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

        vec4 sdfTexture = texture(uTxcn0, vUV);
        vec2 di = vec2(unpackFloat24(sdfTexture.xyz, 1200.0), sdfTexture.w);
        float d = di.x;

        if (di.y > 0.5) {
            discard;
        }

        /* Appearance, wave and noise drives all come from upstream
           animation graph — the shader does no internal interpolation
           or fract-based phase generation any more.

             apear      = uChan0.z   ramped via Envelope / Interpolator easing.
             halfBipolar = uChan1.x oscillates 0..1..0 (Interpolator triangle/
                           bell profile); remap to -1..1 so the wave swings
                           symmetrically.
             noiseDrive = uChan5.x — unbounded value, used as continuous
                           drift coordinate. */
        float apearInter = uChan0.z;
        float halfBipolar = 2.0 * uChan1.x - 1.0;

        float centerOffset1 = uWaveBasePx * apearInter + uWaveAmpPx * halfBipolar;

        float sc = max(uNoiseScalePx, 1e-3);
        vec2 drift  = uChan5.x * vec2(0.73, -0.51);
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

        fragColor = vec4(Cp * edgeMask * uChan4.z, A * edgeMask * uChan4.z);
    }
`
