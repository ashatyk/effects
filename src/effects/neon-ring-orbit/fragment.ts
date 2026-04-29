import { NOISE_GLSL } from '../../pipeline/noise.glsl'

// language=GLSL
export default `
    #version 300 es
    precision highp float;

    in vec2 vUV;
    out vec4 fragColor;

    uniform vec2  uResolution;
    /* Animation channels — vec4(time_ms, raw, value, state).
       Slot 0: scroll — uChan0.x is monotonic ms (drives orbit cycle).
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

    uniform float uDepthEnabled;
    uniform float uDepthSoftness;

    uniform float uOrbitCenter;
    uniform float uOrbitAmplitude;
    uniform float uOrbitSpeed;
    uniform float uOrbitWidth;

    uniform float uGridSize;
    uniform float uDotMaxRadius;
    uniform float uDotMinRadius;
    uniform float uSegmentMargin;

    uniform float uRingThickness;
    uniform float uGlowSpread;
    uniform float uGlowIntensity;
    uniform vec4  uRingColor;
    uniform vec4  uGlowColor;
    uniform float uLineWidth;
    uniform float uLineGlow;
    uniform float uLineIntensity;

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

    float cellRadius(vec2 cellIdx, vec2 cellSizeUV, float orbit) {
        vec2 centerUV = (cellIdx + 0.5) * cellSizeUV;
        float sdf = signedDistancePx(centerUV);
        if (sdf < uSegmentMargin) return 0.0;
        float noise = hash21(cellIdx * uNoiseScale + 7.13);
        float noiseOff = (noise - 0.5) * 2.0 * uNoiseAmount;
        float dist = abs(sdf - (orbit + noiseOff));
        float prox = 1.0 - clamp(dist / max(1.0, uOrbitWidth), 0.0, 1.0);
        float r = mix(0.0, uDotMaxRadius, prox * prox);
        r *= exp(-uFalloff * sdf);
        return max(r, 0.0);
    }

    float distToSegment(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float len2 = dot(ab, ab);
        if (len2 < 0.001) return length(p - a);
        float t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
        vec2 proj = a + t * ab;
        return length(p - proj);
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

        float radius = cellRadius(cell, cellSizeUV, orbit);

        // --- Filled square rendering (Chebyshev distance) ---
        vec2 deltaUV = vUV - cellCenterUV;
        float dx = deltaUV.x * uResolution.x;
        float dy = deltaUV.y * uResolution.y;
        float d = max(abs(dx), abs(dy));

        float fillMask = 0.0;
        float glowMask = 0.0;

        bool ringActive = radius >= uDotMinRadius * 0.3;
        if (ringActive) {
            float maxExtent = radius + uGlowSpread;
            if (d <= maxExtent) {
                fillMask = 1.0 - smoothstep(radius - 0.8, radius + 0.8, d);
                float glowDist = max(0.0, d - radius);
                glowMask = exp(-glowDist * glowDist / max(uGlowSpread * uGlowSpread * 0.5, 0.1));
            }
        }

        // --- Constellation lines ---
        float lineMask = 0.0;
        if (uLineIntensity > 0.001) {
            vec2 pixelPos = vUV * uResolution;
            vec2 curCenterPx = cellCenterUV * uResolution;
            float minR = uDotMinRadius * 0.3;

            vec2 offsets[8];
            offsets[0] = vec2( 1.0,  0.0);
            offsets[1] = vec2(-1.0,  0.0);
            offsets[2] = vec2( 0.0,  1.0);
            offsets[3] = vec2( 0.0, -1.0);
            offsets[4] = vec2( 1.0,  1.0);
            offsets[5] = vec2(-1.0, -1.0);
            offsets[6] = vec2(-1.0,  1.0);
            offsets[7] = vec2( 1.0, -1.0);

            float nRads[8];
            for (int i = 0; i < 8; i++) {
                nRads[i] = cellRadius(cell + offsets[i], cellSizeUV, orbit);
            }

            for (int i = 0; i < 8; i++) {
                if (radius < minR || nRads[i] < minR) continue;

                // For diagonals: pick one per 2x2 block to avoid X crossings
                if (i >= 4) {
                    vec2 off = offsets[i];
                    vec2 blk = cell + vec2(min(0.0, off.x), min(0.0, off.y));
                    bool isBack = off.x * off.y > 0.0;
                    bool pickBack = hash21(blk * 31.17 + 99.41) > 0.5;
                    if (isBack != pickBack) continue;
                }

                vec2 nCenterPx = (cell + offsets[i] + 0.5) * cellSizeUV * uResolution;
                float seg = distToSegment(pixelPos, curCenterPx, nCenterPx);

                float halfW = uLineWidth * 0.5;
                float core = 1.0 - smoothstep(halfW - 0.4, halfW + 0.4, seg);
                float glow = exp(-seg * seg / max(uLineGlow * uLineGlow * 0.5, 0.1));

                float strength = min(radius, nRads[i]) / max(uDotMaxRadius, 0.1);
                lineMask = max(lineMask, (core + glow) * strength);
            }

            // Cross-diagonals: lines between orthogonal neighbors passing through this cell
            // right↔up, right↔down, left↔up, left↔down  (indices: 0↔3, 0↔2, 1↔3, 1↔2)
            int cA[4]; int cB[4];
            cA[0] = 0; cB[0] = 3;
            cA[1] = 0; cB[1] = 2;
            cA[2] = 1; cB[2] = 3;
            cA[3] = 1; cB[3] = 2;

            for (int i = 0; i < 4; i++) {
                float rA = nRads[cA[i]];
                float rB = nRads[cB[i]];
                if (rA < minR || rB < minR) continue;

                vec2 cellA = cell + offsets[cA[i]];
                vec2 cellB = cell + offsets[cB[i]];
                vec2 diff = cellB - cellA;
                vec2 blk = vec2(min(cellA.x, cellB.x), min(cellA.y, cellB.y));
                bool isBack = diff.x * diff.y > 0.0;
                bool pickBack = hash21(blk * 31.17 + 99.41) > 0.5;
                if (isBack != pickBack) continue;

                vec2 centerA = (cellA + 0.5) * cellSizeUV * uResolution;
                vec2 centerB = (cellB + 0.5) * cellSizeUV * uResolution;
                float seg = distToSegment(pixelPos, centerA, centerB);

                float halfW = uLineWidth * 0.5;
                float core = 1.0 - smoothstep(halfW - 0.4, halfW + 0.4, seg);
                float glow = exp(-seg * seg / max(uLineGlow * uLineGlow * 0.5, 0.1));

                float strength = min(rA, rB) / max(uDotMaxRadius, 0.1);
                lineMask = max(lineMask, (core + glow) * strength);
            }

            // Suppress lines inside squares so they stop at the edge
            if (ringActive) {
                lineMask *= smoothstep(radius - 2.0, radius, d);
            }
            for (int i = 0; i < 8; i++) {
                if (nRads[i] < minR) continue;
                vec2 nCenterPx = (cell + offsets[i] + 0.5) * cellSizeUV * uResolution;
                vec2 nDelta = pixelPos - nCenterPx;
                float nDist = max(abs(nDelta.x), abs(nDelta.y));
                lineMask *= smoothstep(nRads[i] - 2.0, nRads[i], nDist);
            }

            lineMask *= uLineIntensity;
        }

        float totalFill = fillMask * uRingColor.a;
        float totalGlow = glowMask * uGlowIntensity * uChan3.z;

        float combined = max(totalFill, max(totalGlow, lineMask));
        if (combined < 0.001) { discard; }

        vec3 fillC = uRingColor.rgb * totalFill;
        vec3 glowC = uGlowColor.rgb * totalGlow;
        vec3 lineC = uGlowColor.rgb * lineMask;
        vec3 color = fillC + glowC + lineC;

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        float alpha = combined * depthMask * uChan4.z;
        if (alpha < 0.001) { discard; }

        fragColor = vec4(color * depthMask * uChan4.z, alpha);
    }
`
