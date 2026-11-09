/* DinoZoo — Outils partagés (aléatoire, bruit, couleurs, formats). */
window.DZ = window.DZ || {};
(function () {
  const U = DZ.util = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.TAU = Math.PI * 2;

  /* Générateur pseudo-aléatoire reproductible (mulberry32). */
  U.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Hachage déterministe d'une case. */
  U.hash = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };

  U.pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  U.range = (r, a, b) => a + (b - a) * r();
  U.weighted = function (r, entries) { // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let x = r() * total;
    for (const e of entries) { x -= e[1]; if (x <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  };

  /* Bruit de valeur périodique (pour textures raccordables). */
  U.makeNoise = function (seed, period) {
    const r = U.rng(seed);
    const n = period * period;
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = r();
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
      const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      const a = v[y0 * period + x0], b = v[y0 * period + x1];
      const c = v[y1 * period + x0], d = v[y1 * period + x1];
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    };
  };

  /* Somme d'octaves de bruits périodiques : chaque octave double la fréquence. */
  U.makeFbm = function (seed, basePeriod, octaves) {
    const layers = [];
    for (let o = 0; o < octaves; o++) layers.push(U.makeNoise(seed + o * 101, basePeriod << o));
    return function (x, y) { // x, y en [0,1)
      let sum = 0, amp = 1, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const p = basePeriod << o;
        sum += layers[o](x * p, y * p) * amp;
        norm += amp; amp *= 0.5;
      }
      return sum / norm;
    };
  };

  /* ---------- Couleurs ---------- */
  const cache = {};
  U.rgb = function (hex) {
    if (Array.isArray(hex)) return hex;
    let c = cache[hex];
    if (c) return c;
    if (hex[0] === 'r') { // rgb(...) / rgba(...)
      const m = hex.match(/[\d.]+/g).map(Number);
      c = [m[0], m[1], m[2]];
      cache[hex] = c;
      return c;
    }
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    cache[hex] = c;
    return c;
  };
  U.css = (c, a) => (a === undefined || a >= 1)
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  U.mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  U.mix = (a, b, t, alpha) => U.css(U.mixRgb(U.rgb(a), U.rgb(b), t), alpha);
  /* amt > 0 éclaircit, amt < 0 assombrit */
  U.shade = function (hex, amt, alpha) {
    const c = U.rgb(hex);
    const t = amt >= 0 ? [255, 255, 255] : [0, 0, 0];
    return U.css(U.mixRgb(c, t, Math.abs(amt)), alpha);
  };
  U.alpha = (hex, a) => U.css(U.rgb(hex), a);
  U.jitter = function (hex, r, amt) {
    const c = U.rgb(hex);
    const d = (r() - 0.5) * 2 * amt * 255;
    return U.css([c[0] + d, c[1] + d * 0.9, c[2] + d * 0.7]);
  };

  /* ---------- Formats ---------- */
  U.fmt = function (n) {
    const neg = n < 0;
    const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + s;
  };
  U.money = (n) => U.fmt(n) + ' €';
  U.hourStr = function (h) {
    const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60);
    return String(hh).padStart(2, '0') + ':' + String(Math.floor(mm / 10) * 10).padStart(2, '0');
  };
  /* Petit système d'événements. */
  U.Emitter = class {
    constructor() { this._h = {}; }
    on(t, f) { (this._h[t] = this._h[t] || []).push(f); return f; }
    off(t, f) { const a = this._h[t]; if (a) this._h[t] = a.filter((x) => x !== f); }
    emit(t, d) {
      const a = this._h[t]; if (a) for (const f of a.slice()) f(d);
      const all = this._h['*']; if (all) for (const f of all) f(t, d);
    }
  };
})();
