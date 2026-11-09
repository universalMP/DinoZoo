/* =====================================================================
   DinoZoo — Rendu : végétation préhistorique et rochers.
   Chaque arbre est mis en cache en deux pièces (tronc + feuillage)
   pour que le feuillage puisse osciller dans le vent.
   ===================================================================== */
(function () {
  const U = DZ.util, P = DZ.CONFIG.palette, R = DZ.R;

  /* Amas de feuilles : base sombre puis petites taches de plus en plus claires
     vers la lumière (haut-gauche), pour un volume « peint ». */
  function clump(g, x, y, rx, ry, r, opts) {
    const cols = opts && opts.cols || P.foliage;
    const dark = cols[0], light = cols[cols.length - 1];
    g.fillStyle = U.alpha(dark, 0.95);
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, U.TAU); g.fill();
    const n = Math.max(8, (rx * ry) / ((opts && opts.leaf) || 7));
    const leaf = (opts && opts.leafSize) || 3.2;
    for (let i = 0; i < n; i++) {
      const a = r() * U.TAU, d = Math.sqrt(r());
      const px = x + Math.cos(a) * rx * d * 0.95, py = y + Math.sin(a) * ry * d * 0.95;
      // éclairage : -1 (ombre, bas droite) → 1 (lumière, haut gauche)
      const lit = U.clamp((-(px - x) / rx - (py - y) / ry) * 0.6 + 0.2 + (r() - 0.5) * 0.5, -1, 1);
      const ci = Math.round(U.clamp((lit + 1) / 2, 0, 1) * (cols.length - 1));
      g.fillStyle = cols[ci];
      const s = leaf * (0.6 + r() * 0.8);
      g.beginPath(); g.ellipse(px, py, s, s * 0.7, r() * 3, 0, U.TAU); g.fill();
    }
    // reflets
    for (let i = 0; i < n * 0.15; i++) {
      const a = Math.PI * 1.25 + (r() - 0.5) * 1.4, d = 0.3 + r() * 0.6;
      g.fillStyle = U.alpha(light, 0.5);
      g.beginPath(); g.arc(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, leaf * 0.5, 0, U.TAU); g.fill();
    }
  }
  R.clump = clump;

  function trunk(g, x0, y0, x1, y1, w0, w1, cols, rings) {
    const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const gr = g.createLinearGradient(x0 - cx * w0, y0 - cy * w0, x0 + cx * w0, y0 + cy * w0);
    gr.addColorStop(0, U.shade(cols[1], 0.18)); gr.addColorStop(0.45, cols[0]); gr.addColorStop(1, U.shade(cols[2], -0.35));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - cx * w0, y0 - cy * w0);
    g.quadraticCurveTo((x0 + x1) / 2 - cx * w0 * 0.8, (y0 + y1) / 2 - cy * w0, x1 - cx * w1, y1 - cy * w1);
    g.lineTo(x1 + cx * w1, y1 + cy * w1);
    g.quadraticCurveTo((x0 + x1) / 2 + cx * w0 * 0.8, (y0 + y1) / 2 + cy * w0, x0 + cx * w0, y0 + cy * w0);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,18,8,0.35)'; g.lineWidth = 0.5;
    const n = rings || 6;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = U.lerp(x0, x1, t), y = U.lerp(y0, y1, t), w = U.lerp(w0, w1, t);
      g.beginPath(); g.moveTo(x - cx * w, y - cy * w); g.quadraticCurveTo(x, y + 1.2, x + cx * w, y + cy * w); g.stroke();
    }
  }

  /* Fronde (palmier, cycas, fougère) : rachis + folioles. */
  function frond(g, x, y, ang, len, droop, width, col, r, density) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len + droop;
    const mx = x + Math.cos(ang) * len * 0.5, my = y + Math.sin(ang) * len * 0.5 - droop * 0.3;
    const steps = Math.max(6, Math.round(len / (density || 2.2)));
    g.lineCap = 'round';
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex;
      const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey;
      const tx = 2 * (1 - t) * (mx - x) + 2 * t * (ex - mx), ty = 2 * (1 - t) * (my - y) + 2 * t * (ey - my);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const l = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.75 + r() * 0.35);
      const shade = t < 0.5 ? -0.15 + t * 0.4 : 0.05;
      g.strokeStyle = U.shade(col, shade + (r() - 0.5) * 0.12);
      g.lineWidth = 0.9 + (1 - t) * 0.6;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + nx * l * s * 0.6 + tx / tl * l * 0.3, py + ny * l * s * 0.6 + 0.8, px + nx * l * s + tx / tl * l * 0.5, py + ny * l * s + l * 0.35);
        g.stroke();
      }
    }
    g.strokeStyle = U.shade(col, -0.3); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  }
  R.frond = frond;

  const builders = {
    araucaria(r) {
      const h = 78 + r() * 22, tw = 3.2;
      const crownY = -h;
      const trunkSp = R.sprite(20, h + 6, 10, h, (g) => trunk(g, 0, 0, 0, -h + 18, tw, 1.6, P.trunk, 10));
      const crown = R.sprite(90, 70, 45, 45, (g) => {
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const yy = -30 + i * 11, rx = 14 + i * 6.5, ry = 6 + i * 1.6;
          for (const s of [-1, 1]) clump(g, s * rx * 0.55, yy, rx * 0.62, ry, r, { leaf: 6, leafSize: 2.4 });
          clump(g, 0, yy - 2, rx * 0.5, ry * 0.9, r, { leaf: 6, leafSize: 2.4 });
        }
        clump(g, 0, -36, 7, 6, r, { leaf: 5, leafSize: 2.2 });
      });
      return { trunk: trunkSp, crown, crownX: 0, crownY: crownY + 20, shadowR: 24, height: h };
    },
    palmier(r) {
      const h = 58 + r() * 18, bend = (r() - 0.5) * 16;
      const trunkSp = R.sprite(40, h + 6, 20, h, (g) => {
        const pts = 10;
        for (let i = 0; i < pts; i++) {
          const t0 = i / pts, t1 = (i + 1) / pts;
          const x0 = bend * t0 * t0, x1 = bend * t1 * t1;
          trunk(g, x0, -h * t0, x1, -h * t1, 3.2 - t0 * 0.8, 3.2 - t1 * 0.8, ['#7a6248', '#94795a', '#5a4632'], 1);
          g.fillStyle = 'rgba(40,28,15,0.35)';
          g.beginPath(); g.ellipse(x1, -h * t1, 3.4 - t1, 1.1, 0, 0, U.TAU); g.fill();
        }
      });
      const crown = R.sprite(110, 70, 55, 35, (g) => {
        const n = 9 + ((r() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 2.1 + (r() - 0.5) * 0.2;
          const back = Math.sin(a) < -0.2;
          frond(g, 0, 0, a, 26 + r() * 12, 10 + r() * 8, 7, back ? P.foliage[2] : P.foliage[3 + ((r() * 2) | 0)], r, 2);
        }
        g.fillStyle = '#5c4a2f'; g.beginPath(); g.arc(0, 1, 3.2, 0, U.TAU); g.fill();
        for (let i = 0; i < 3; i++) { g.fillStyle = '#6b5a34'; g.beginPath(); g.arc(-2 + i * 2, 3, 1.6, 0, U.TAU); g.fill(); }
      });
      return { trunk: trunkSp, crown, crownX: bend, crownY: -h, shadowR: 22, height: h };
    },
    cycas(r) {
      const h = 14 + r() * 8;
      const trunkSp = R.sprite(24, h + 4, 12, h, (g) => {
        trunk(g, 0, 0, 0, -h, 5, 4.2, ['#6a5638', '#8a7048', '#4a3a24'], 4);
        g.fillStyle = 'rgba(60,45,25,0.5)';
        for (let y = -2; y > -h; y -= 2.6) for (let x = -4; x <= 4; x += 2.6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.3, y - 1.6); g.lineTo(x + 2.6, y); g.fill(); }
      });
      const crown = R.sprite(80, 50, 40, 30, (g) => {
        const n = 12;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.9;
          frond(g, 0, 0, a, 17 + r() * 7, 4 + r() * 4, 5, Math.sin(a) < -0.5 ? P.foliage[4] : P.foliage[2 + ((r() * 2) | 0)], r, 1.6);
        }
      });
      return { trunk: trunkSp, crown, crownX: 0, crownY: -h, shadowR: 16, height: h };
    },
    ginkgo(r) {
      const h = 46 + r() * 14;
      const cols = ['#33501f', '#456a28', '#5a8032', '#76983e', '#93ad52'];
      const trunkSp = R.sprite(40, h + 4, 20, h, (g) => {
        trunk(g, 0, 0, 0, -h + 6, 3.4, 2, P.trunk, 8);
        trunk(g, 0, -h * 0.5, -10, -h * 0.85, 1.6, 0.8, P.trunk, 3);
        trunk(g, 0, -h * 0.55, 9, -h * 0.9, 1.5, 0.8, P.trunk, 3);
      });
      const crown = R.sprite(84, 70, 42, 46, (g) => {
        clump(g, -12, -8, 15, 12, r, { cols, leaf: 5 });
        clump(g, 12, -10, 16, 12, r, { cols, leaf: 5 });
        clump(g, 0, -24, 18, 13, r, { cols, leaf: 5 });
        clump(g, -2, 2, 16, 9, r, { cols, leaf: 5 });
      });
      return { trunk: trunkSp, crown, crownX: 0, crownY: -h + 14, shadowR: 24, height: h };
    },
    fougere(r) {
      const whole = R.sprite(64, 40, 32, 34, (g) => {
        const n = 11 + ((r() * 4) | 0);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.6 + (r() - 0.5) * 0.2;
          frond(g, 0, 0, a, 14 + r() * 9, 8 + r() * 5, 4.2, P.foliage[2 + ((r() * 3) | 0)], r, 1.5);
        }
      });
      return { whole, shadowR: 13, height: 18 };
    },
    buisson(r) {
      const whole = R.sprite(56, 40, 28, 32, (g) => {
        clump(g, -8, -8, 11, 8, r, { leaf: 5 });
        clump(g, 8, -9, 12, 9, r, { leaf: 5 });
        clump(g, 0, -15, 12, 9, r, { leaf: 5 });
        // baies
        for (let i = 0; i < 5; i++) { g.fillStyle = r() < 0.5 ? '#8a3a2a' : '#c47a3a'; g.beginPath(); g.arc((r() - 0.5) * 22, -6 - r() * 14, 1, 0, U.TAU); g.fill(); }
      });
      return { whole, shadowR: 15, height: 16 };
    },
    arbremort(r) {
      const h = 40 + r() * 10;
      const whole = R.sprite(60, h + 6, 30, h, (g) => {
        trunk(g, 0, 0, 2, -h, 3.2, 1.2, ['#7a6a58', '#9a8a76', '#4a4036'], 6);
        trunk(g, 1, -h * 0.55, -14, -h * 0.85, 1.6, 0.6, ['#7a6a58', '#9a8a76', '#4a4036'], 2);
        trunk(g, 2, -h * 0.7, 13, -h * 0.95, 1.4, 0.6, ['#7a6a58', '#9a8a76', '#4a4036'], 2);
      });
      return { whole, shadowR: 12, height: h };
    }
  };

  const treeCache = {};
  R.treeSprite = function (kind, seed) {
    const variant = seed % 3;
    const key = kind + variant;
    if (!treeCache[key]) treeCache[key] = builders[kind](U.rng(seed % 3 * 7919 + kind.length * 31 + 5));
    return treeCache[key];
  };
  R.clearNature = function () { for (const k in treeCache) delete treeCache[k]; for (const k in rockCache) delete rockCache[k]; };

  /* ---------- Rochers ---------- */
  const rockCache = {};
  R.rockSprite = function (size, seed) {
    const key = size + '_' + (seed % 4);
    if (rockCache[key]) return rockCache[key];
    const r = U.rng(seed % 4 * 131 + size * 7);
    const s = size === 'L' ? 22 : size === 'M' ? 14 : 8;
    const sp = R.sprite(s * 3, s * 2.4, s * 1.5, s * 1.7, (g) => {
      const pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI;
        const rad = s * (0.75 + r() * 0.35);
        pts.push([Math.cos(a) * rad * 1.2, Math.sin(a) * rad * 0.95]);
      }
      pts.push([s * 1.1, s * 0.15], [s * 0.4, s * 0.35], [-s * 0.5, s * 0.33], [-s * 1.15, s * 0.12]);
      R.smooth(g, pts, true);
      g.save(); g.clip();
      g.fillStyle = R.pattern(g, 'rock'); g.fillRect(-s * 2, -s * 2, s * 4, s * 3);
      const gr = g.createLinearGradient(-s, -s, s, s * 0.4);
      gr.addColorStop(0, 'rgba(255,250,235,0.32)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,10,20,0.45)');
      g.fillStyle = gr; g.fillRect(-s * 2, -s * 2, s * 4, s * 3);
      // mousse sur le dessus
      for (let i = 0; i < s * 0.8; i++) { g.fillStyle = `rgba(${90 + r() * 30},${110 + r() * 30},${50},${0.35})`; g.beginPath(); g.arc((r() - 0.6) * s * 1.4, -s * 0.6 - r() * s * 0.3, 1 + r() * 1.6, 0, U.TAU); g.fill(); }
      // occlusion à la base
      const ao = g.createLinearGradient(0, 0, 0, s * 0.4);
      ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.4)');
      g.fillStyle = ao; g.fillRect(-s * 2, 0, s * 4, s);
      g.restore();
      g.strokeStyle = 'rgba(30,28,25,0.5)'; g.lineWidth = 0.6;
      R.smooth(g, pts, true); g.stroke();
    });
    sp.r = s;
    rockCache[key] = sp;
    return sp;
  };
})();
