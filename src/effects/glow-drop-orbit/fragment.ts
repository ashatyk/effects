import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision highp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;
    /* Animation channels — vec4(time_ms, raw, value, state).
       Slot 0: scroll — uChan0.x is monotonic ms (drives orbit / pulse / colour cycle).
       Slot 1: radial — additive offset on orbit centre (px).
       Slot 2: size — multiplier on drop radius.
       Slot 3: glow — multiplier on glow intensity.
       Slot 4: intensity — alpha multiplier. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan2;
    uniform vec4 uChan3;
    uniform vec4 uChan4;

    uniform sampler2D verticalDistanceTexture;
    uniform sampler2D depthTexture;
    uniform sampler2D depthRefTexture;

    uniform float uDepthEnabled;
    uniform float uDepthSoftness;

    uniform float uOrbitCenter;
    uniform float uOrbitAmplitude;
    uniform float uOrbitSpeed;
    uniform float uOrbitWidth;

    uniform float uGridSize;
    uniform float uDropBaseRadius;
    uniform float uDropPulseAmp;
    uniform float uDropPulseFreq;
    uniform float uDropPulseSpeed;
    uniform float uDropMinRadius;
    uniform float uSegmentMargin;

    uniform vec4  uColorA;
    uniform vec4  uColorB;
    uniform float uColorFreq;
    uniform float uColorSpeed;

    uniform float uGlowSpread;
    uniform float uGlowIntensity;
    uniform float uCoreIntensity;
    uniform float uEdgeSoftness;

    uniform float uFalloff;
    uniform float uNoiseAmount;
    uniform float uNoiseScale;

    float unpackFloat24(vec3 rgb, float maxD) {
        float n = (rgb.r * 255.0) * 65536.0 +
                  (rgb.g * 255.0) *   256.0 +
                  (rgb.b * 255.0);
        return (n / 16777215.0) * maxD;
    }

    float signedDistancePx(vec2 uv) {
        vec4 t = texture(verticalDistanceTexture, uv);
        float d = unpackFloat24(t.xyz, 1200.0);
        return (t.w > 0.5) ? -d : d;
    }

${NOISE_GLSL}

    // Угол вдоль контура получаем из направления градиента SDF —
    // это наружная нормаль, вращающаяся монотонно вдоль орбиты
    // (для преимущественно выпуклой формы). Служит аналогом
    // параметра tt из канвас-референса.
    float sdfAngle(vec2 uv) {
        vec2 texel = 1.0 / uResolution;
        float sx1 = signedDistancePx(uv + vec2(texel.x, 0.0));
        float sx0 = signedDistancePx(uv - vec2(texel.x, 0.0));
        float sy1 = signedDistancePx(uv + vec2(0.0, texel.y));
        float sy0 = signedDistancePx(uv - vec2(0.0, texel.y));
        return atan(sy1 - sy0, sx1 - sx0);
    }

    void main() {
        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) { discard; }

        float tSec = uChan0.x * 0.001;
        float orbit = uOrbitCenter + uOrbitAmplitude * sin(tSec * uOrbitSpeed) + uChan1.z;

        float cellSizePx = max(4.0, uGridSize);
        vec2 cellSizeUV = vec2(cellSizePx / uResolution.x, cellSizePx / uResolution.y);

        vec2 cell = floor(vUV / cellSizeUV);
        vec2 cellCenterUV = (cell + 0.5) * cellSizeUV;

        float cellNoise = hash21(cell * uNoiseScale + 7.13);
        float noiseOffset = (cellNoise - 0.5) * 2.0 * uNoiseAmount;

        float sdfAtCell = signedDistancePx(cellCenterUV);
        if (sdfAtCell < uSegmentMargin) { discard; }

        float cellDistToOrbit = abs(sdfAtCell - (orbit + noiseOffset));
        float proximity = 1.0 - clamp(cellDistToOrbit / max(1.0, uOrbitWidth), 0.0, 1.0);
        if (proximity <= 0.0) { discard; }

        float tt = sdfAngle(cellCenterUV);

        float pulse = sin(tt * uDropPulseFreq + tSec * uDropPulseSpeed);
        float baseR = mix(0.0, uDropBaseRadius * uChan2.z, proximity * proximity);
        float radius = baseR + uDropPulseAmp * pulse;
        radius *= exp(-uFalloff * sdfAtCell);
        radius = max(radius, 0.0);
        if (radius < uDropMinRadius * 0.3) { discard; }

        vec2 deltaUV = vUV - cellCenterUV;
        float dx = deltaUV.x * uResolution.x;
        float dy = deltaUV.y * uResolution.y;
        float d  = sqrt(dx * dx + dy * dy);

        float maxExtent = radius + uGlowSpread;
        if (d > maxExtent) { discard; }

        float cmix = 0.5 + 0.5 * sin(tt * uColorFreq + tSec * uColorSpeed);
        vec3  col  = mix(uColorA.rgb, uColorB.rgb, cmix);

        float core = 1.0 - smoothstep(radius - uEdgeSoftness, radius + uEdgeSoftness, d);

        float glowDist = max(0.0, d - radius);
        float glow = exp(-glowDist * glowDist / max(uGlowSpread * uGlowSpread * 0.5, 0.1));

        float coreA = core * uCoreIntensity;
        float glowA = glow * uGlowIntensity * uChan3.z;

        float alphaLocal = clamp(coreA + glowA * (1.0 - core), 0.0, 1.0);
        if (alphaLocal < 0.001) { discard; }

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        float alpha = alphaLocal * depthMask * uChan4.z;
        if (alpha < 0.001) { discard; }

        vec3 rgb = col * alpha;
        fragColor = vec4(rgb, alpha);
    }
`
