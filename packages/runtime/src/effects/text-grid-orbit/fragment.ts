import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision highp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;
    /* Animation channels — vec4(drive, raw, value, state).
       Slot 0: scroll-time in seconds (slot default 0..6) — uChan0.z drives
               the discrete orbit-step counter.
       Slot 1: radial offset (px) — uChan1.z.
       Slot 3: glow multiplier — uChan3.z.
       Slot 4: alpha multiplier — uChan4.z. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan3;
    uniform vec4 uChan4;

    // txcn0 = scene SDF, txcn1 = glyph atlas SDF.
    uniform sampler2D uTxcn0;
    uniform sampler2D uTxcn1;

    uniform float uOrbitCenter;
    uniform float uOrbitAmplitude;
    uniform float uOrbitWidth;
    uniform float uStepInterval;

    uniform float uGridSize;
    uniform float uSegmentMargin;

    uniform vec4  uDotColor;
    uniform vec4  uGlowColor;
    uniform float uGlowSpread;
    uniform float uGlowIntensity;
    uniform float uFalloff;
    uniform float uNoiseAmount;
    uniform float uNoiseScale;
    uniform float uGlyphScale;
    uniform float uGlyphCount;

    /* SDF format (pipeline/passes/sdf-pure.ts): RGB packs 24-bit biased
       distance in [-1,+1]→[0,1]; A=1 always. Returns signed pixels —
       negative inside, positive outside. */
    float unpackSignedFloat24(vec3 rgb, float maxD) {
        float n = (rgb.r * 255.0) * 65536.0 +
                  (rgb.g * 255.0) *   256.0 +
                  (rgb.b * 255.0);
        float biased = n / 16777215.0;
        return (biased * 2.0 - 1.0) * maxD;
    }

    float signedDistancePx(vec2 uv) {
        return unpackSignedFloat24(texture(uTxcn0, uv).rgb, 1200.0);
    }

${NOISE_GLSL}

    void main() {
        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) { discard; }

        float interval = max(0.03, uStepInterval);
        /* Read slot-0 .z (controller-mapped seconds); '.x * 0.001' was a
           stale ms→sec hack from the old autoTimer. */
        float tSec = uChan0.z;
        float step = floor(tSec / interval);
        float orbit = uOrbitCenter + uOrbitAmplitude * sin(step) + uChan1.z;

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
        proximity *= exp(-uFalloff * sdfAtCell);

        if (proximity < 0.15) { discard; }

        float glyphFill = uGlyphScale;
        vec2 localUV = (vUV - cell * cellSizeUV) / cellSizeUV;
        vec2 scaledUV = (localUV - 0.5) / glyphFill + 0.5;

        float margin = uGlowSpread / (cellSizePx * glyphFill);
        if (scaledUV.x < -margin || scaledUV.x > 1.0 + margin || scaledUV.y < -margin || scaledUV.y > 1.0 + margin) { discard; }
        vec2 clampedUV = clamp(scaledUV, vec2(0.001), vec2(0.999));

        float glyphHash = hash21(cell * 13.37 + 3.71 + step * 0.17);
        float count = max(1.0, floor(uGlyphCount));
        float glyphIdx = floor(glyphHash * count);

        // Atlas is a 4x4 grid (16 glyphs).
        float col = mod(glyphIdx, 4.0);
        float row = floor(glyphIdx / 4.0);
        vec2 atlasUV = (vec2(col, row) + clampedUV) / 4.0;

        // R channel = SDF distance, 0.5 = edge, spread = 24 atlas px.
        float sd = texture(uTxcn1, atlasUV).r;
        float atlasPerScreen = 128.0 / max(cellSizePx * glyphFill, 1.0);
        float edgeWidth = atlasPerScreen / 48.0;
        float glyphMask = smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, sd);

        float distFromEdge = (sd - 0.5) * 48.0 / max(atlasPerScreen, 0.1);
        float glowFalloff = uGlowSpread * uGlowSpread * 0.5;
        float glowMask = exp(-distFromEdge * distFromEdge / max(glowFalloff, 0.1));
        glowMask *= (1.0 - glyphMask) * uGlowIntensity * uChan3.z;

        float combined = max(glyphMask, glowMask);
        if (combined < 0.001) { discard; }

        vec3 coreColor = uDotColor.rgb * glyphMask;
        vec3 glowColor = uGlowColor.rgb * glowMask;
        vec3 color = coreColor + glowColor;

        float alpha = combined * uDotColor.a * uChan4.z;
        if (alpha < 0.001) { discard; }

        fragColor = vec4(color * uChan4.z, alpha);
    }
`
