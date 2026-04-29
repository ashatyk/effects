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
       Slot 4: intensity — alpha multiplier. */
    uniform vec4 uChan0;
    uniform vec4 uChan1;
    uniform vec4 uChan4;

    uniform sampler2D verticalDistanceTexture;
    uniform sampler2D uDiffuse;
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

    uniform float uRefraction;
    uniform float uFresnelPower;
    uniform float uFresnelIntensity;
    uniform float uSpecularPower;
    uniform float uSpecularIntensity;
    uniform float uEdgeSoftness;
    uniform float uFalloff;
    uniform float uNoiseAmount;
    uniform float uNoiseScale;
    uniform float uIOR;
    uniform float uAberration;
    uniform float uShadowRadius;
    uniform float uShadowOpacity;
    uniform float uRimDarkWidth;
    uniform float uRimDarkIntensity;
    uniform float uEnvIntensity;
    uniform vec4  uEnvTint;
    uniform float uEnvBlur;

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

    vec3 sampleEnv(vec3 dir) {
        float y = dir.y * 0.5 + 0.5;

        vec3 sky   = vec3(0.65, 0.75, 0.90);
        vec3 horiz = vec3(0.95, 0.93, 0.88);
        vec3 ground = vec3(0.25, 0.22, 0.20);
        vec3 grad = mix(ground, horiz, smoothstep(0.0, 0.45, y));
        grad = mix(grad, sky, smoothstep(0.55, 1.0, y));

        float win1 = smoothstep(0.92, 1.0, dot(dir, normalize(vec3(-0.3, 0.7, 0.6))));
        float win2 = smoothstep(0.94, 1.0, dot(dir, normalize(vec3( 0.5, 0.5, 0.7))));
        float win3 = smoothstep(0.96, 1.0, dot(dir, normalize(vec3(-0.6, 0.3, 0.7))));
        grad += vec3(1.0, 0.98, 0.92) * win1 * 3.0;
        grad += vec3(0.92, 0.95, 1.0)  * win2 * 2.5;
        grad += vec3(1.0, 0.95, 0.90)  * win3 * 2.0;

        float strip = smoothstep(0.48, 0.50, y) * (1.0 - smoothstep(0.50, 0.52, y));
        grad += vec3(0.9) * strip * 0.6;

        return grad;
    }

    vec3 sampleEnvBlurred(vec3 dir, float blur) {
        if (blur < 0.01) return sampleEnv(dir);
        vec3 acc = sampleEnv(dir);
        vec3 up = abs(dir.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0);
        vec3 tX = normalize(cross(up, dir));
        vec3 tY = cross(dir, tX);
        float r = blur * 0.15;
        acc += sampleEnv(normalize(dir + tX * r));
        acc += sampleEnv(normalize(dir - tX * r));
        acc += sampleEnv(normalize(dir + tY * r));
        acc += sampleEnv(normalize(dir - tY * r));
        acc += sampleEnv(normalize(dir + (tX + tY) * r * 0.7));
        acc += sampleEnv(normalize(dir - (tX + tY) * r * 0.7));
        acc += sampleEnv(normalize(dir + (tX - tY) * r * 0.7));
        acc += sampleEnv(normalize(dir - (tX - tY) * r * 0.7));
        return acc / 9.0;
    }

    struct CellInfo {
        vec2  centerUV;
        float radius;
        float t;
        float dPx;
        bool  valid;
    };

    CellInfo computeCell(vec2 cellSizeUV, float orbit) {
        CellInfo c;
        vec2 cell = floor(vUV / cellSizeUV);
        c.centerUV = (cell + 0.5) * cellSizeUV;

        float cellNoise = hash21(cell * uNoiseScale + 7.13);
        float noiseOffset = (cellNoise - 0.5) * 2.0 * uNoiseAmount;

        float sdfAtCell = signedDistancePx(c.centerUV);
        if (sdfAtCell < uSegmentMargin) { c.valid = false; return c; }

        float cellDistToOrbit = abs(sdfAtCell - (orbit + noiseOffset));
        float proximity = 1.0 - clamp(cellDistToOrbit / max(1.0, uOrbitWidth), 0.0, 1.0);

        c.radius = mix(0.0, uDotMaxRadius, proximity * proximity);
        c.radius *= exp(-uFalloff * sdfAtCell);
        c.radius = max(c.radius, 0.0);
        if (c.radius < uDotMinRadius * 0.3) { c.valid = false; return c; }

        vec2 deltaUV = vUV - c.centerUV;
        float dx = deltaUV.x * uResolution.x;
        float dy = deltaUV.y * uResolution.y;
        c.dPx = sqrt(dx * dx + dy * dy);
        c.t = c.dPx / max(c.radius, 0.1);
        c.valid = true;
        return c;
    }

    void main() {
        float sdist = signedDistancePx(vUV);
        if (sdist < 0.0) { discard; }

        float tSec = uChan0.x * 0.001;
        float orbit = uOrbitCenter + uOrbitAmplitude * sin(tSec * uOrbitSpeed) + uChan1.z;

        float cellSizePx = max(4.0, uGridSize);
        vec2 cellSizeUV = vec2(cellSizePx / uResolution.x, cellSizePx / uResolution.y);

        CellInfo ci = computeCell(cellSizeUV, orbit);
        if (!ci.valid) { discard; }

        float shadowOuter = ci.radius + uShadowRadius;
        if (ci.dPx > shadowOuter) { discard; }

        if (ci.t > 1.0) {
            float shadowT = (ci.dPx - ci.radius) / max(uShadowRadius, 0.1);
            float shadowAlpha = (1.0 - smoothstep(0.0, 1.0, shadowT)) * uShadowOpacity;
            if (shadowAlpha < 0.001) { discard; }
            fragColor = vec4(vec3(0.0), shadowAlpha);
            return;
        }

        float dropMask = 1.0 - smoothstep(1.0 - uEdgeSoftness / max(ci.radius, 1.0), 1.0, ci.t);
        if (dropMask < 0.001) { discard; }

        float z = sqrt(max(0.0, 1.0 - ci.t * ci.t));
        vec2 localN = (vUV - ci.centerUV) * uResolution / max(ci.radius, 0.1);
        vec3 normal = normalize(vec3(localN, z));
        vec3 viewDir = vec3(0.0, 0.0, 1.0);

        // --- Refraction with chromatic aberration ---
        float iorR = uIOR - uAberration;
        float iorG = uIOR;
        float iorB = uIOR + uAberration;

        vec3 refR = refract(-viewDir, normal, 1.0 / iorR);
        vec3 refG = refract(-viewDir, normal, 1.0 / iorG);
        vec3 refB = refract(-viewDir, normal, 1.0 / iorB);

        vec2 offR = refR.xy * uRefraction * ci.radius / uResolution;
        vec2 offG = refG.xy * uRefraction * ci.radius / uResolution;
        vec2 offB = refB.xy * uRefraction * ci.radius / uResolution;

        float cr = texture(uDiffuse, clamp(vUV + offR, 0.0, 1.0)).r;
        float cg = texture(uDiffuse, clamp(vUV + offG, 0.0, 1.0)).g;
        float cb = texture(uDiffuse, clamp(vUV + offB, 0.0, 1.0)).b;
        vec3 bgColor = vec3(cr, cg, cb);

        // --- Dark inner rim ---
        float rimDark = smoothstep(1.0 - uRimDarkWidth, 1.0, ci.t) * uRimDarkIntensity;
        bgColor *= (1.0 - rimDark);

        // --- Fresnel ---
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);

        // --- Environment reflection ---
        vec3 reflDir = reflect(-viewDir, normal);
        vec3 envColor = sampleEnvBlurred(reflDir, uEnvBlur) * uEnvTint.rgb;
        vec3 envContrib = envColor * fresnel * uEnvIntensity;

        // --- Fresnel bright rim ---
        vec3 rimColor = vec3(1.0) * fresnel * uFresnelIntensity;

        // --- Specular ---
        vec3 lightDir = normalize(vec3(-0.4, -0.6, 1.0));
        vec3 halfVec = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), uSpecularPower) * uSpecularIntensity;

        // --- Compose: lerp refraction ↔ env reflection by fresnel ---
        vec3 color = mix(bgColor, envColor, fresnel * uEnvIntensity);
        color += rimColor + vec3(spec);

        float depthMask = 1.0;
        if (uDepthEnabled > 0.5) {
            float depthHere = texture(depthTexture, vUV).r;
            float depthRef  = texture(depthRefTexture, vUV).r;
            depthMask = smoothstep(depthRef - uDepthSoftness, depthRef, depthHere);
        }

        float alpha = dropMask * depthMask * uChan4.z;
        if (alpha < 0.001) { discard; }

        fragColor = vec4(color * alpha, alpha);
    }
`
