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
       Slot 1: radial — additive offset on orbit centre (px).
       Slot 2: size — multiplier on dot radius.
       Slot 4: intensity — alpha multiplier. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan2;
    uniform vec4 uChan4;

    /* SDF wired through generic texture channel 0. */
    uniform sampler2D uTxcn0;

    uniform float uOrbitCenter;
    uniform float uOrbitAmplitude;
    uniform float uOrbitWidth;
    uniform float uStepInterval;

    uniform float uGridSize;
    uniform float uDotMaxRadius;
    uniform float uDotMinRadius;
    uniform float uSegmentMargin;

    uniform vec4  uDotColor;
    uniform float uFalloff;
    uniform float uEdgeSoftness;
    uniform float uNoiseAmount;
    uniform float uNoiseScale;

    float unpackFloat24(vec3 rgb, float maxD) {
        float n = (rgb.r * 255.0) * 65536.0 +
                  (rgb.g * 255.0) *   256.0 +
                  (rgb.b * 255.0);
        return (n / 16777215.0) * maxD;
    }

    float signedDistancePx(vec2 uv) {
        vec4 t = texture(uTxcn0, uv);
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

        float radius = mix(0.0, uDotMaxRadius * uChan2.z, proximity * proximity);
        radius *= exp(-uFalloff * sdfAtCell);

        radius = max(radius, 0.0);
        if (radius < uDotMinRadius * 0.3) { discard; }

        vec2 deltaUV = vUV - cellCenterUV;
        float dx = deltaUV.x * uResolution.x;
        float dy = deltaUV.y * uResolution.y;
        float d = sqrt(dx * dx + dy * dy);

        float dotMask = 1.0 - smoothstep(radius - uEdgeSoftness, radius + uEdgeSoftness, d);
        if (dotMask < 0.001) { discard; }

        float alpha = dotMask * uDotColor.a * uChan4.z;
        if (alpha < 0.001) { discard; }

        fragColor = vec4(uDotColor.rgb * alpha, alpha);
    }
`
