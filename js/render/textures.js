/* =====================================================================
   DinoZoo — Rendu : textures procédurales générées une seule fois
   (herbe, terre, sable, roche, dalles, eau) + utilitaires de dessin.
   ===================================================================== */
window.DZ = window.DZ || {};
DZ.R = DZ.R || {};
(function () {
  const U = DZ.util, P = DZ.CONFIG.palette;
  const R = DZ.R;

  R.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  };

  /* Sprite : canvas haute résolution + origine en coordonnées monde. */
  R.spriteScale = 2;
  R.sprite = function (w, h, ox, oy, draw, scale) {
    const S = scale || R.spriteScale;
    const c = R.canvas(w * S, h * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    g.translate(ox, oy);
    draw(g);
    return { c, w, h, ox, oy };
  };
  R.draw = function (ctx, sp, x, y) { ctx.drawImage(sp.c, x - sp.ox, y - sp.oy, sp.w, sp.h); };

  /* Courbe lissée passant par les milieux des points. */
  R.smooth = function (g, pts, closed) {
    const n = pts.length;
    if (n < 2) return;
    g.beginPath();
    if (closed) {
      const m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
      g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      g.closePath();
    } else {
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      g.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  };

  /* Dessin raccordable : répète un trait près des bords. */
  function wrap(size, x, y, r, fn) {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const px = x + ox * size, py = y + oy * size;
      if (px > -r && px < size + r && py > -r && py < size + r) fn(px, py);
    }
  }

  function noiseFill(size, seed, ramp, opt) {
    const c = R.canvas(size, size), g = c.getContext('2d');
    const img = g.createImageData(size, size), d = img.data;
    const big = U.makeFbm(seed, opt.period || 4, 4);
    const fine = U.makeFbm(seed + 13, 32, 2);
    const cols = ramp.map(U.rgb);
    const r = U.rng(seed + 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let t = U.clamp((big(u, v) - 0.5) * (opt.contrast || 2) + 0.5, 0, 0.999);
      const f = t * (cols.length - 1), i = Math.floor(f), k = f - i;
      const a = cols[i], b = cols[Math.min(cols.length - 1, i + 1)];
      const br = (fine(u, v) - 0.5) * (opt.grain || 30) + (r() - 0.5) * (opt.speck || 14);
      const o = (y * size + x) * 4;
      d[o] = a[0] + (b[0] - a[0]) * k + br;
      d[o + 1] = a[1] + (b[1] - a[1]) * k + br;
      d[o + 2] = a[2] + (b[2] - a[2]) * k + br * 0.8;
      d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function grass(size, seed, ramp, blades) {
    const c = noiseFill(size, seed, ramp, { period: 2, contrast: 1.15, grain: 22, speck: 16 });
    const g = c.getContext('2d');
    const r = U.rng(seed + 9);
    g.lineCap = 'round';
    const count = size * size / 26;
    for (let i = 0; i < count; i++) {
      const x = r() * size, y = r() * size;
      const len = 2 + r() * 4.5, ang = -Math.PI / 2 + (r() - 0.5) * 1.1;
      const col = blades[(r() * blades.length) | 0];
      const alpha = 0.35 + r() * 0.45;
      wrap(size, x, y, 8, (px, py) => {
        g.strokeStyle = U.alpha(col, alpha);
        g.lineWidth = 0.6 + r() * 0.7;
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + Math.cos(ang) * len * 0.5 + 1, py + Math.sin(ang) * len * 0.5, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
        g.stroke();
      });
    }
    // petites fleurs et trèfles discrets
    for (let i = 0; i < size / 10; i++) {
      const x = r() * size, y = r() * size;
      const col = r() < 0.5 ? '#d9d2a0' : (r() < 0.5 ? '#c99a5a' : '#9fae6a');
      wrap(size, x, y, 3, (px, py) => { g.fillStyle = U.alpha(col, 0.5); g.beginPath(); g.arc(px, py, 0.8 + r() * 0.6, 0, U.TAU); g.fill(); });
    }
    return c;
  }

  function pebbles(g, size, r, n, cols, maxR) {
    for (let i = 0; i < n; i++) {
      const x = r() * size, y = r() * size, rad = 0.6 + r() * maxR;
      const col = cols[(r() * cols.length) | 0];
      wrap(size, x, y, rad + 2, (px, py) => {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.beginPath(); g.ellipse(px + rad * 0.3, py + rad * 0.35, rad, rad * 0.75, 0, 0, U.TAU); g.fill();
        g.fillStyle = col;
        g.beginPath(); g.ellipse(px, py, rad, rad * 0.75, r() * 3, 0, U.TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.ellipse(px - rad * 0.3, py - rad * 0.3, rad * 0.45, rad * 0.3, 0, 0, U.TAU); g.fill();
      });
    }
  }

  function cracks(g, size, r, n, col, w) {
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = r() * size, y = r() * size, a = r() * U.TAU;
      g.lineWidth = w * (0.5 + r());
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * (3 + r() * 6); y += Math.sin(a) * (3 + r() * 6); pts.push([x, y]); }
      wrap(size, pts[0][0], pts[0][1], 40, (px, py) => {
        const dx = px - pts[0][0], dy = py - pts[0][1];
        g.beginPath(); g.moveTo(px, py);
        for (const p of pts) g.lineTo(p[0] + dx, p[1] + dy);
        g.stroke();
      });
    }
  }

  function dirt(size, seed, ramp) {
    const c = noiseFill(size, seed, ramp, { period: 2, contrast: 1.3, grain: 26, speck: 18 });
    const g = c.getContext('2d'), r = U.rng(seed + 4);
    pebbles(g, size, r, size / 3, ['#8f8270', '#a39684', '#6f6455', '#b5a58c'], 1.8);
    cracks(g, size, r, 10, 'rgba(50,35,20,0.25)', 0.6);
    return c;
  }

  function sand(size, seed) {
    const c = noiseFill(size, seed, ['#a99470', '#b8a27c', '#9c8866', '#c4b08a'], { period: 2, contrast: 1.1, grain: 14, speck: 18 });
    const g = c.getContext('2d'), r = U.rng(seed + 2);
    g.strokeStyle = 'rgba(120,95,60,0.12)'; g.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const y0 = r() * size, amp = 2 + r() * 2, f = 1 + ((r() * 3) | 0);
      g.beginPath();
      for (let x = 0; x <= size; x += 4) { const y = y0 + Math.sin(x / size * U.TAU * f) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    pebbles(g, size, r, size / 6, ['#a59478', '#c9b89a', '#8d7e66'], 1.1);
    return c;
  }

  function rock(size, seed) {
    const c = noiseFill(size, seed, P.rock, { period: 3, contrast: 2.8, grain: 40, speck: 16 });
    const g = c.getContext('2d'), r = U.rng(seed + 8);
    cracks(g, size, r, 26, 'rgba(30,30,30,0.35)', 0.9);
    cracks(g, size, r, 14, 'rgba(255,255,255,0.12)', 0.6);
    for (let i = 0; i < 30; i++) { // lichens
      const x = r() * size, y = r() * size, rad = 1 + r() * 3;
      wrap(size, x, y, rad, (px, py) => { g.fillStyle = r() < 0.5 ? 'rgba(120,135,70,0.35)' : 'rgba(170,165,120,0.3)'; g.beginPath(); g.arc(px, py, rad, 0, U.TAU); g.fill(); });
    }
    return c;
  }

  /* Dalles de pierre irrégulières pour les allées. */
  function paving(size, seed) {
    const c = R.canvas(size, size), g = c.getContext('2d');
    const r = U.rng(seed);
    g.fillStyle = '#5f574a'; g.fillRect(0, 0, size, size);
    const rows = 8, rh = size / rows;
    const noise = noiseFill(size, seed + 1, P.paving, { period: 8, contrast: 1.5, grain: 22, speck: 16 });
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * 0.5;
      let x = -off * (size / 6);
      while (x < size) {
        const w = size / 6 * (0.75 + r() * 0.5);
        const x0 = x + 1.2, y0 = j * rh + 1.2, x1 = x + w - 1.2, y1 = (j + 1) * rh - 1.2;
        const tint = (r() - 0.5) * 0.18;
        const draw = (dx) => {
          g.save();
          g.beginPath();
          const rr = 2.2;
          g.moveTo(x0 + dx + rr, y0); g.lineTo(x1 + dx - rr, y0); g.quadraticCurveTo(x1 + dx, y0, x1 + dx, y0 + rr);
          g.lineTo(x1 + dx, y1 - rr); g.quadraticCurveTo(x1 + dx, y1, x1 + dx - rr, y1); g.lineTo(x0 + dx + rr, y1);
          g.quadraticCurveTo(x0 + dx, y1, x0 + dx, y1 - rr); g.lineTo(x0 + dx, y0 + rr); g.quadraticCurveTo(x0 + dx, y0, x0 + dx + rr, y0);
          g.closePath(); g.clip();
          g.drawImage(noise, 0, 0);
          g.fillStyle = tint > 0 ? `rgba(255,250,235,${tint})` : `rgba(40,30,20,${-tint})`;
          g.fillRect(x0 + dx, y0, x1 - x0, y1 - y0);
          // biseau : lumière en haut à gauche, ombre en bas à droite
          g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x0 + dx, y0, x1 - x0, 1.4);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 + dx, y1 - 1.6, x1 - x0, 1.6);
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x1 + dx - 1.4, y0, 1.4, y1 - y0);
          g.restore();
        };
        draw(0);
        if (x1 > size) draw(-size);
        if (x0 < 0) draw(size);
        x += w;
      }
    }
    cracks(g, size, r, 8, 'rgba(40,30,20,0.25)', 0.5);
    // mousse dans les joints
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(90,110,50,${0.15 + r() * 0.2})`; g.beginPath(); g.arc(r() * size, Math.round(r() * rows) * rh, 0.6 + r() * 1.4, 0, U.TAU); g.fill(); }
    return c;
  }

  function planks(size, seed) {
    const c = R.canvas(size, size), g = c.getContext('2d'), r = U.rng(seed);
    const n = 8, pw = size / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = U.jitter(P.wood[i % 3], r, 0.08);
      g.fillRect(0, i * pw, size, pw);
      g.strokeStyle = 'rgba(40,25,10,0.18)'; g.lineWidth = 0.6;
      for (let k = 0; k < 4; k++) { const y = i * pw + 2 + r() * (pw - 4); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(size * 0.3, y + 1, size * 0.6, y - 1, size, y); g.stroke(); }
      g.fillStyle = 'rgba(20,10,0,0.45)'; g.fillRect(0, (i + 1) * pw - 1, size, 1);
      g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, i * pw, size, 1);
    }
    return c;
  }

  /* Reflets d'eau raccordables (calque animé). */
  function ripples(size, seed) {
    const c = R.canvas(size, size), g = c.getContext('2d'), r = U.rng(seed);
    g.lineCap = 'round';
    for (let k = 0; k < 46; k++) {
      const y0 = r() * size, x0 = r() * size, len = 10 + r() * 26, amp = 0.8 + r() * 1.2;
      const a = 0.08 + r() * 0.22;
      wrap(size, x0, y0, len + 4, (px, py) => {
        g.strokeStyle = `rgba(235,250,255,${a})`;
        g.lineWidth = 0.7 + r() * 0.9;
        g.beginPath();
        for (let t = 0; t <= 1.001; t += 0.1) {
          const x = px + t * len, y = py + Math.sin(t * Math.PI) * -amp;
          t ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      });
    }
    return c;
  }

  R.tex = {};
  R.patterns = {};
  R.generateTextures = function (seed) {
    const s = seed || 1234;
    const T = R.tex;
    T.grass = grass(256, s + 1, P.grass, P.grassBlade);
    T.grassLush = grass(256, s + 2, ['#3a5a24', '#46682c', '#557a36', '#2f4c1d', '#62873e'], ['#6f9a4a', '#2c4a1a', '#86ad5e']);
    T.grassDry = grass(256, s + 3, ['#76783e', '#86864a', '#6a6a38', '#999a58'], ['#a6a46a', '#5d5e30']);
    T.dirt = dirt(256, s + 4, P.dirt);
    T.mud = dirt(256, s + 5, ['#5e4a34', '#4e3d2a', '#6c573c', '#423322']);
    T.sand = sand(256, s + 6);
    T.rock = rock(256, s + 7);
    T.paving = paving(256, s + 8);
    T.planks = planks(128, s + 9);
    T.jungle = grass(256, s + 10, ['#1b2c15', '#22361a', '#2a4120', '#16240f'], ['#33502a', '#10200c']);
    T.ripples = ripples(256, s + 11);
    T.concrete = noiseFill(128, s + 12, P.concrete, { period: 4, contrast: 1.2, grain: 16, speck: 14 });
    // ombre douce et halo lumineux
    T.shadow = (() => {
      const c = R.canvas(128, 128), g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(10,15,5,0.62)'); gr.addColorStop(0.45, 'rgba(10,15,5,0.42)'); gr.addColorStop(1, 'rgba(10,15,5,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return c;
    })();
    T.glow = (() => {
      const c = R.canvas(128, 128), g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return c;
    })();
    T.softWhite = (() => {
      const c = R.canvas(64, 64), g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return c;
    })();
    T.fog = noiseFill(256, s + 20, ['#000000', '#ffffff'], { period: 3, contrast: 1.4, grain: 0, speck: 0 });
    // motifs alignés sur le monde (créés à la demande sur un contexte)
    R.patterns = {};
  };

  R.pattern = function (g, name) {
    // les motifs sont liés à un contexte : on les garde par contexte
    const key = name;
    g.__pat = g.__pat || {};
    if (!g.__pat[key]) g.__pat[key] = g.createPattern(R.tex[name], 'repeat');
    return g.__pat[key];
  };
})();
