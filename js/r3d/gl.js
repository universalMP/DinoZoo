/* =====================================================================
   DinoZoo 3D — Socle WebGL 2 : maths (matrices 4×4), shaders,
   maillages, instanciation, textures et tampons d'image.
   Aucune bibliothèque externe.
   ===================================================================== */
window.DZ = window.DZ || {};
DZ.G = DZ.G || {};
(function () {
  const G = DZ.G;

  /* ------------------------------------------------------------------
     Matrices 4×4 (ordre colonne, convention post-multipliée :
     m = m × T, comme les transformations d'un contexte 2D)
     ------------------------------------------------------------------ */
  const M = G.m4 = {
    create() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    ident(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    copy(a, o) { o = o || new Float32Array(16); o.set(a); return o; },
    mul(a, b, o) {
      o = o || new Float32Array(16);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        o[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        o[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        o[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        o[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
      }
      return o;
    },
    persp(fovy, aspect, near, far, o) {
      o = o || new Float32Array(16);
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      o.fill(0);
      o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
      return o;
    },
    ortho(l, r, b, t, n, f, o) {
      o = o || new Float32Array(16);
      o.fill(0);
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
      return o;
    },
    lookAt(e, c, up, o) {
      o = o || new Float32Array(16);
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
      o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
      o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
      o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
      o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
      o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
      o[15] = 1;
      return o;
    },
    translate(m, x, y, z) {
      m[12] += m[0] * x + m[4] * y + m[8] * z;
      m[13] += m[1] * x + m[5] * y + m[9] * z;
      m[14] += m[2] * x + m[6] * y + m[10] * z;
      m[15] += m[3] * x + m[7] * y + m[11] * z;
      return m;
    },
    scale(m, x, y, z) {
      for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; }
      return m;
    },
    rotX(m, a) {
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) { const y = m[4 + i], z = m[8 + i]; m[4 + i] = y * c + z * s; m[8 + i] = z * c - y * s; }
      return m;
    },
    rotY(m, a) {
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) { const x = m[i], z = m[8 + i]; m[i] = x * c - z * s; m[8 + i] = x * s + z * c; }
      return m;
    },
    rotZ(m, a) {
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * s; m[4 + i] = y * c - x * s; }
      return m;
    },
    invert(a, o) {
      o = o || new Float32Array(16);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    apply(m, x, y, z) { // point → [x, y, z, w]
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
    }
  };

  /* ------------------------------------------------------------------
     Shaders
     ------------------------------------------------------------------ */
  const NOISE = `
    float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.15; }
  `;

  const LIT_VS = (inst) => `#version 300 es
    precision highp float;
    in vec3 aPos; in vec3 aNor; in vec4 aCol;
    ${inst ? 'in vec4 iM0; in vec4 iM1; in vec4 iM2; in vec4 iM3; in vec4 iTint; in vec3 iS1; in vec3 iS2; in vec3 iS3;' : ''}
    uniform mat4 uModel, uVP, uLightVP;
    uniform float uTime, uWind;
    out vec3 vPos; out vec3 vNor; out vec4 vCol; out vec3 vLocal; out vec4 vLight;
    void main() {
      mat4 Mo = uModel;
      vec3 col = aCol.rgb;
      float mat = floor(aCol.a * 15.0 + 0.5);
      float phase = 0.0;
      ${inst ? `
      Mo = uModel * mat4(iM0, iM1, iM2, iM3);
      phase = iTint.a;
      // couleurs par instance (vêtements, peau) repérées par des teintes « marqueurs »
      if (distance(col, vec3(1.0, 0.0, 1.0)) < 0.05) col = iS1;
      else if (distance(col, vec3(0.0, 1.0, 1.0)) < 0.05) col = iS2;
      else if (distance(col, vec3(1.0, 1.0, 0.0)) < 0.05) col = iS3;
      else col *= iTint.rgb;
      ` : ''}
      vec3 p = aPos;
      if (mat == 7.0) {
        float h = max(p.y, 0.0);
        float w = uWind * h * h;
        p.x += sin(uTime * 1.3 + phase + Mo[3].x * 0.7 + p.y * 2.0) * 0.06 * w;
        p.z += cos(uTime * 1.07 + phase + Mo[3].z * 0.6) * 0.045 * w;
      }
      vec4 wp = Mo * vec4(p, 1.0);
      vPos = wp.xyz;
      vNor = mat3(Mo) * aNor;
      vCol = vec4(col, mat);
      vLocal = aPos;
      vLight = uLightVP * wp;
      gl_Position = uVP * wp;
    }`;

  const LIT_FS = `#version 300 es
    precision highp float;
    precision highp sampler2DShadow;
    in vec3 vPos; in vec3 vNor; in vec4 vCol; in vec3 vLocal; in vec4 vLight;
    uniform vec3 uSunDir, uSunCol, uSkyCol, uGroundCol, uFogCol, uCam, uLightCol, uTint;
    uniform vec2 uFog;
    uniform float uTime, uNight, uShadowOn, uAlpha, uTintAmt, uUnlit;
    uniform sampler2DShadow uShadow;
    uniform sampler2D uAtlas;
    uniform vec2 uShadowTexel;
    uniform int uNumLights;
    uniform vec4 uLights[16];
    out vec4 outColor;
    ${NOISE}
    float shadowAt(vec4 lp) {
      if (uShadowOn < 0.5) return 1.0;
      vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
      float s = 0.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
        s += texture(uShadow, vec3(p.xy + vec2(x, y) * uShadowTexel, p.z - 0.0018));
      return s / 9.0;
    }
    void main() {
      vec3 col = vCol.rgb;
      float mat = vCol.a;
      vec3 N = normalize(vNor);
      vec3 Vv = normalize(uCam - vPos);
      if (dot(N, Vv) < 0.0) N = -N;
      float spec = 0.0, shin = 24.0, emis = 0.0;
      if (mat == 13.0) { col = texture(uAtlas, vCol.rg).rgb; emis = uNight * 0.5; }
      else if (mat == 1.0) { // peau écailleuse
        vec3 q = vLocal * 26.0;
        float sc = vnoise(q) * 0.6 + vnoise(q * 2.3) * 0.4;
        float cell = abs(fract(q.x * 0.9 + vnoise(q * 0.5) * 1.5) - 0.5) + abs(fract(q.y * 0.9 + q.z * 0.4) - 0.5);
        col *= 0.82 + 0.3 * sc - 0.12 * smoothstep(0.55, 0.85, cell);
        col *= 0.9 + 0.2 * fbm(vLocal * 5.0);
        spec = 0.22; shin = 18.0;
      } else if (mat == 2.0) { // sol
        float n1 = fbm(vPos * vec3(0.9, 0.0, 0.9));
        float n2 = vnoise(vPos * 7.0);
        float n3 = vnoise(vPos * 23.0);
        col *= 0.78 + 0.38 * n1;
        col *= 0.9 + 0.2 * n2;
        col = mix(col, col * vec3(1.15, 1.1, 0.75), smoothstep(0.7, 0.95, n3) * 0.5);
        col *= 0.93 + 0.12 * step(0.82, vnoise(vPos * 41.0));
      } else if (mat == 3.0) { // pavés irréguliers (cellules de Voronoï)
        vec2 p = vPos.xz * 3.4 + vec2(vnoise(vPos * 1.7), vnoise(vPos * 1.9 + 7.0)) * 0.35;
        vec2 ip = floor(p), fp = fract(p);
        float d1 = 8.0, d2 = 8.0; vec2 id = ip;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 gg = vec2(float(i), float(j));
          vec2 o = vec2(hash3(vec3(ip + gg, 1.0)), hash3(vec3(ip + gg, 2.0))) * 0.85 + 0.075;
          vec2 rr = gg + o - fp;
          float dd = dot(rr, rr);
          if (dd < d1) { d2 = d1; d1 = dd; id = ip + gg; } else if (dd < d2) d2 = dd;
        }
        float edge = sqrt(d2) - sqrt(d1);
        col *= 0.82 + 0.3 * hash3(vec3(id, 3.0));
        col *= 0.88 + 0.2 * vnoise(vPos * 11.0);
        col = mix(col * vec3(0.55, 0.57, 0.48), col, smoothstep(0.035, 0.11, edge));
        spec = 0.07;
      } else if (mat == 4.0) { // bois
        float s = sin((vLocal.x + vLocal.z) * 60.0 + vnoise(vLocal * 9.0) * 6.0);
        col *= 0.85 + 0.12 * s + 0.1 * vnoise(vLocal * 30.0);
      } else if (mat == 5.0) { // vitre éclairée la nuit
        emis = uNight * 1.3; spec = 0.6; shin = 60.0;
      } else if (mat == 6.0) { // métal
        spec = 0.5; shin = 40.0; col *= 0.92 + 0.12 * vnoise(vLocal * 20.0);
      } else if (mat == 7.0) { // feuillage
        col *= 0.72 + 0.5 * vnoise(vLocal * 14.0 + vPos * 0.5);
        spec = 0.05;
      } else if (mat == 8.0) { // roche
        float n = fbm(vLocal * 4.0 + vPos * 0.3);
        col *= 0.7 + 0.5 * n;
        col *= 1.0 - 0.25 * smoothstep(0.45, 0.5, abs(fract(n * 6.0) - 0.5));
        col = mix(col, vec3(0.42, 0.5, 0.26), smoothstep(0.55, 0.9, N.y) * smoothstep(0.6, 0.75, vnoise(vLocal * 6.0)) * 0.6);
      } else if (mat == 9.0) { // émissif (lampes, flammes)
        emis = 0.6 + uNight * 1.6;
      } else if (mat == 10.0) { // œil
        spec = 1.2; shin = 80.0;
      } else if (mat == 11.0) { // toile, tissu
        col *= 0.92 + 0.1 * vnoise(vLocal * 40.0);
      } else if (mat == 12.0) { // verre
        spec = 1.0; shin = 90.0;
      }
      float ndl = max(dot(N, uSunDir), 0.0);
      float sh = shadowAt(vLight);
      vec3 amb = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
      float ao = mat == 2.0 ? 1.0 : 0.82 + 0.18 * clamp(vPos.y * 2.0 + 0.4, 0.0, 1.0);
      vec3 lit = col * (amb * ao + uSunCol * ndl * sh);
      vec3 V = normalize(uCam - vPos);
      vec3 H = normalize(V + uSunDir);
      lit += uSunCol * spec * pow(max(dot(N, H), 0.0), shin) * sh;
      // lumière rasante en bordure (liseré)
      lit += uSkyCol * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
      for (int i = 0; i < 16; i++) {
        if (i >= uNumLights) break;
        vec3 L = uLights[i].xyz - vPos;
        float d = length(L);
        float a = clamp(1.0 - d / uLights[i].w, 0.0, 1.0);
        lit += col * uLightCol * a * a * (0.35 + 0.65 * max(dot(N, L / d), 0.0)) * 1.6;
      }
      lit += col * emis;
      if (uUnlit > 0.5) lit = col;
      lit = mix(lit, uTint, uTintAmt);
      float f = smoothstep(uFog.x, uFog.y, length(uCam - vPos));
      lit = mix(lit, uFogCol, f);
      outColor = vec4(lit, uAlpha);
    }`;

  const DEPTH_VS = (inst) => LIT_VS(inst);
  const DEPTH_FS = `#version 300 es
    precision mediump float;
    out vec4 o;
    void main() { o = vec4(1.0); }`;

  const WATER_VS = `#version 300 es
    precision highp float;
    in vec3 aPos; in vec3 aNor; in vec4 aCol;
    uniform mat4 uVP; uniform float uTime;
    out vec3 vPos; out float vDepth;
    void main() {
      vec3 p = aPos;
      p.y += sin(p.x * 3.1 + uTime * 1.6) * 0.008 + sin(p.z * 2.3 - uTime * 1.2) * 0.008;
      vPos = p;
      vDepth = aCol.a;
      gl_Position = uVP * vec4(p, 1.0);
    }`;
  const WATER_FS = `#version 300 es
    precision highp float;
    in vec3 vPos; in float vDepth;
    uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol, uCam, uShallow, uDeep;
    uniform vec2 uFog; uniform float uTime, uNight;
    out vec4 o;
    ${NOISE}
    void main() {
      vec2 q = vPos.xz;
      float t = uTime;
      vec3 n1 = vec3(vnoise(vec3(q * 3.0 + vec2(t * 0.3, t * 0.2), t * 0.2)) - 0.5, 0.0, vnoise(vec3(q * 3.0 - vec2(t * 0.25, -t * 0.3), 3.0 + t * 0.2)) - 0.5);
      vec3 n2 = vec3(vnoise(vec3(q * 9.0 + t * 0.6, 1.0)) - 0.5, 0.0, vnoise(vec3(q * 9.0 - t * 0.5, 5.0)) - 0.5);
      vec3 N = normalize(vec3(0.0, 1.0, 0.0) + n1 * 0.35 + n2 * 0.18);
      vec3 V = normalize(uCam - vPos);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.8 + 0.08;
      float d = clamp(vDepth, 0.0, 1.0);
      vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.9, d));
      vec3 refl = mix(uSkyCol * 1.1, uFogCol, 0.3);
      vec3 col = mix(base * (0.55 + 0.45 * max(uSunDir.y, 0.0)) + base * uSkyCol * 0.3, refl, fres);
      vec3 H = normalize(V + uSunDir);
      col += uSunCol * pow(max(dot(N, H), 0.0), 140.0) * 1.4;
      // écume près des berges
      float foam = smoothstep(0.12, 0.0, d) * (0.55 + 0.45 * vnoise(vec3(q * 14.0, t)));
      col = mix(col, vec3(0.92, 0.96, 0.94) * (0.5 + 0.5 * max(uSunDir.y, 0.2)), foam * 0.7);
      float a = mix(0.55, 0.92, smoothstep(0.0, 0.6, d)) + foam * 0.2;
      float f = smoothstep(uFog.x, uFog.y, length(uCam - vPos));
      col = mix(col, uFogCol, f);
      o = vec4(col, clamp(a, 0.0, 1.0));
    }`;

  const SKY_VS = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main() { vUv = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
  const SKY_FS = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform mat4 uInvVP;
    uniform vec3 uSunDir, uZenith, uHorizon, uSunCol;
    uniform float uNight, uTime;
    out vec4 o;
    ${NOISE}
    void main() {
      vec4 a = uInvVP * vec4(vUv, -1.0, 1.0), b = uInvVP * vec4(vUv, 1.0, 1.0);
      vec3 dir = normalize(b.xyz / b.w - a.xyz / a.w);
      float h = clamp(dir.y, -0.2, 1.0);
      vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));
      float sd = max(dot(dir, uSunDir), 0.0);
      col += uSunCol * (pow(sd, 400.0) * 3.0 + pow(sd, 12.0) * 0.25) * (1.0 - uNight);
      if (uNight > 0.01) {
        vec3 s = floor(dir * 300.0);
        float st = step(0.997, hash3(s)) * smoothstep(0.0, 0.3, h);
        col += vec3(st) * uNight * (0.6 + 0.4 * sin(uTime * 3.0 + hash3(s) * 40.0));
      }
      o = vec4(col, 1.0);
    }`;

  const POINT_VS = `#version 300 es
    precision highp float;
    in vec3 aPos; in vec4 aCol; in float aSize;
    uniform mat4 uVP; uniform float uScale;
    out vec4 vCol;
    void main() {
      vec4 p = uVP * vec4(aPos, 1.0);
      gl_Position = p;
      gl_PointSize = clamp(aSize * uScale / max(p.w, 0.1), 1.0, 256.0);
      vCol = aCol;
    }`;
  const POINT_FS = `#version 300 es
    precision mediump float;
    in vec4 vCol;
    out vec4 o;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float d = dot(c, c);
      if (d > 1.0) discard;
      o = vec4(vCol.rgb, vCol.a * (1.0 - d) * (1.0 - d));
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      throw new Error('Shader : ' + log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    }
    return s;
  }

  function program(gl, vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programme : ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace('[0]', '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const ATTR = ['aPos', 'aNor', 'aCol', 'iM0', 'iM1', 'iM2', 'iM3', 'iTint', 'iS1', 'iS2', 'iS3'];

  G.createPrograms = function (gl) {
    return {
      lit: program(gl, LIT_VS(false), LIT_FS, ATTR),
      litInst: program(gl, LIT_VS(true), LIT_FS, ATTR),
      depth: program(gl, DEPTH_VS(false), DEPTH_FS, ATTR),
      depthInst: program(gl, DEPTH_VS(true), DEPTH_FS, ATTR),
      water: program(gl, WATER_VS, WATER_FS, ATTR),
      sky: program(gl, SKY_VS, SKY_FS, ['aPos']),
      points: program(gl, POINT_VS, POINT_FS, ['aPos', 'aCol', 'aSize'])
    };
  };

  /* ------------------------------------------------------------------
     Maillages sur GPU
     Format : position (3), normale (3), couleur rgba (4, a = matériau)
     ------------------------------------------------------------------ */
  G.upload = function (gl, data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
    const stride = 10 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: data.idx.length, inst: null, instBuf: null, instCount: 0, bounds: data.bounds };
  };

  /* Ajoute un tampon d'instances (matrice + teinte + 3 couleurs). */
  const INST_FLOATS = 16 + 4 + 9;
  G.INST_FLOATS = INST_FLOATS;
  G.enableInstancing = function (gl, mesh) {
    gl.bindVertexArray(mesh.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
    const stride = INST_FLOATS * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, stride, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, stride, 64); gl.vertexAttribDivisor(7, 1);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(8 + i); gl.vertexAttribPointer(8 + i, 3, gl.FLOAT, false, stride, 80 + i * 12); gl.vertexAttribDivisor(8 + i, 1); }
    gl.bindVertexArray(null);
    mesh.instBuf = buf;
    mesh.instCap = 0;
    return mesh;
  };
  /* Tampon d'instances partagé + VAO liant un maillage à ce tampon. */
  G.instBuffer = function (gl, data) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  };
  G.instVAO = function (gl, mesh, buf) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    const stride = 10 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = INST_FLOATS * 4;
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, st, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
    gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, st, 64); gl.vertexAttribDivisor(7, 1);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(8 + i); gl.vertexAttribPointer(8 + i, 3, gl.FLOAT, false, st, 80 + i * 12); gl.vertexAttribDivisor(8 + i, 1); }
    gl.bindVertexArray(null);
    return vao;
  };
  G.setInstances = function (gl, mesh, data, count) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instBuf);
    if (data.byteLength > mesh.instCap) { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); mesh.instCap = data.byteLength; }
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * INST_FLOATS);
    mesh.instCount = count;
  };
  G.free = function (gl, mesh) {
    if (!mesh) return;
    gl.deleteVertexArray(mesh.vao); gl.deleteBuffer(mesh.vbo); gl.deleteBuffer(mesh.ibo);
    if (mesh.instBuf) gl.deleteBuffer(mesh.instBuf);
  };

  /* Tampon d'ombre (texture de profondeur). */
  G.shadowTarget = function (gl, size) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, size };
  };

  /* Tampon couleur + profondeur (vignettes). */
  G.colorTarget = function (gl, w, h) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, color, depth, w, h };
  };
})();
