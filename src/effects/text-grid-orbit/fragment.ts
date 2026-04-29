import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision highp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;
    /* Animation channels — vec4(time_ms, raw, value, state).
       Slot 0: scroll — uChan0.x is monotonic ms (drives orbit stepping).
       Slot 1: radial — additive orbit offset (px).
       Slot 3: glow — multiplier on glow intensity.
       Slot 4: intensity — alpha multiplier. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan3;
    uniform vec4 uChan4;

    uniform sampler2D verticalDistanceTexture;
    uniform sampler2D depthTexture;
    uniform sampler2D depthRefTexture;
    uniform sampler2D uAtlas;

    uniform float uDepthEnabled;
    uniform float uDepthSoftness;

    uniform float uOrbitCenter;
    uniform float uOrbitAmplitude;
    uniform float uOrbitSpeed;
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

    void main() {
        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) { discard; }

        float interval = max(0.03, uStepInterval);
        float tSec = uChan0.x * 0.001;
        float step = floor(tSec / interval);
        float orbit = uOrbitCenter + uOrbitAmplitude * sin(step * uOrbitSpeed) + uChan1.z;

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

        // Binary visibility: cell is either on or off
        if (proximity < 0.15) { discard; }

        // Fixed glyph size within cell
        float glyphFill = uGlyphScale;
        vec2 localUV = (vUV - cell * cellSizeUV) / cellSizeUV;
        vec2 scaledUV = (localUV - 0.5) / glyphFill + 0.5;

        // Outside glyph bounding box (with margin for glow)
        float margin = uGlowSpread / (cellSizePx * glyphFill);
        if (scaledUV.x < -margin || scaledUV.x > 1.0 + margin || scaledUV.y < -margin || scaledUV.y > 1.0 + margin) { discard; }
        vec2 clampedUV = clamp(scaledUV, vec2(0.001), vec2(0.999));

        // Pick glyph index from cell + step hash (changes each discrete step)
        float glyphHash = hash21(cell * 13.37 + 3.71 + step * 0.17);
        float count = max(1.0, floor(uGlyphCount));
        float glyphIdx = floor(glyphHash * count);

        // Atlas UV: 4x4 grid
        float col = mod(glyphIdx, 4.0);
        float row = floor(glyphIdx / 4.0);
        vec2 atlasUV = (vec2(col, row) + clampedUV) / 4.0;

        // SDF sampling: R channel contains the distance (0.5 = edge, spread = 24 atlas px)
        float sd = texture(uAtlas, atlasUV).r;
        float atlasPerScreen = 128.0 / max(cellSizePx * glyphFill, 1.0);
        float edgeWidth = atlasPerScreen / 48.0;
        float glyphMask = smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, sd);

        // Neon glow: use SDF distance from edge for soft outer glow
        float distFromEdge = (sd - 0.5) * 48.0 / max(atlasPerScreen, 0.1);
        float glowFalloff = uGlowSpread * uGlowSpread * 0.5;
        float glowMask = exp(-distFromEdge * distFromEdge / max(glowFalloff, 0.1));
        glowMask *= (1.0 - glyphMask) * uGlowIntensity * uChan3.z;

        float combined = max(glyphMask, glowMask);
        if (combined < 0.001) { discard; }

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        vec3 coreColor = uDotColor.rgb * glyphMask;
        vec3 glowColor = uGlowColor.rgb * glowMask;
        vec3 color = coreColor + glowColor;

        float alpha = combined * uDotColor.a * depthMask * uChan4.z;
        if (alpha < 0.001) { discard; }

        fragColor = vec4(color * depthMask * uChan4.z, alpha);
    }
`
