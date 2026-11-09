/* =====================================================================
   DinoZoo — Rendu des dinosaures.
   Chaque espèce est un « pantin » : corps, cou, tête, mâchoire,
   segments de queue, cuisses, jambes et pieds sont dessinés une fois
   (peau texturée, motifs, lumière) dans des sprites mis en cache,
   puis assemblés et animés indépendamment à chaque image.
   Vue latérale pour les espèces terrestres, vue du dessus pour les
   reptiles volants et marins.
   ===================================================================== */
(function () {
  const U = DZ.util, R = DZ.R;
  const TAU = U.TAU;

  /* ------------------------------------------------------------------
     Peau
     ------------------------------------------------------------------ */
  function bounds(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function darkSkin(skin, amt) {
    const o = {};
    for (const k in skin) o[k] = typeof skin[k] === 'string' && skin[k][0] === '#' ? U.css(U.mixRgb(U.rgb(skin[k]), [34, 26, 18], amt)) : skin[k];
    return o;
  }

  function paintSkin(g, pts, skin, r, opt) {
    opt = opt || {};
    const b = bounds(pts);
    R.smooth(g, pts, true);
    g.save();
    g.clip();
    const gr = g.createLinearGradient(0, b.y0, 0, b.y1);
    gr.addColorStop(0, skin.top);
    gr.addColorStop(0.5, skin.base);
    gr.addColorStop(1, opt.noBelly ? U.shade(skin.base, -0.2) : skin.belly);
    g.fillStyle = gr;
    g.fillRect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h + 4);
    // motif
    const pc = skin.pcol || U.shade(skin.base, -0.35);
    const pscale = opt.pscale || 1;
    if (skin.pattern === 'stripes' || skin.pattern === 'bands') {
      const step = (skin.pattern === 'bands' ? 9 : 5.5) * pscale;
      const wdt = (skin.pattern === 'bands' ? 3.6 : 1.8) * pscale;
      g.fillStyle = U.alpha(pc, skin.palpha || 0.5);
      for (let x = b.x0 - b.h; x < b.x1 + step; x += step * (0.8 + r() * 0.4)) {
        g.beginPath();
        g.moveTo(x, b.y0 - 1);
        g.quadraticCurveTo(x + wdt + r() * 2, b.y0 + b.h * 0.35, x + 1 + r() * 2, b.y0 + b.h * (0.55 + r() * 0.2));
        g.lineTo(x + wdt * 0.4, b.y0 + b.h * 0.5);
        g.quadraticCurveTo(x - wdt * 0.5, b.y0 + b.h * 0.3, x - wdt, b.y0 - 1);
        g.fill();
      }
    } else if (skin.pattern === 'spots') {
      g.fillStyle = U.alpha(pc, skin.palpha || 0.5);
      const n = b.w * b.h / (14 * pscale * pscale);
      for (let i = 0; i < n; i++) {
        const x = b.x0 + r() * b.w, y = b.y0 + Math.pow(r(), 1.5) * b.h * 0.75, rad = (0.6 + r() * 1.4) * pscale;
        g.beginPath(); g.ellipse(x, y, rad * 1.3, rad, r() * 3, 0, TAU); g.fill();
      }
    } else if (skin.pattern === 'mottle') {
      const n = b.w * b.h / (10 * pscale * pscale);
      for (let i = 0; i < n; i++) {
        const x = b.x0 + r() * b.w, y = b.y0 + r() * b.h * 0.8, rad = (1 + r() * 2.5) * pscale;
        g.fillStyle = r() < 0.6 ? U.alpha(pc, 0.15) : 'rgba(255,245,220,0.07)';
        g.beginPath(); g.ellipse(x, y, rad * 1.4, rad, r() * 3, 0, TAU); g.fill();
      }
    }
    // écailles
    if (!opt.noScales) {
      const sc = (skin.scale || 1.6) * (opt.scaleMul || 1);
      g.lineWidth = 0.28;
      for (let y = b.y0; y < b.y1; y += sc * 0.8) {
        const off = (Math.round((y - b.y0) / (sc * 0.8)) % 2) * sc * 0.5;
        for (let x = b.x0 + off; x < b.x1; x += sc) {
          g.strokeStyle = r() < 0.5 ? 'rgba(20,15,5,0.16)' : 'rgba(255,250,230,0.08)';
          g.beginPath(); g.arc(x, y, sc * 0.42, 0.2, Math.PI - 0.2); g.stroke();
        }
      }
    }
    // plis de peau
    if (skin.wrinkles || opt.wrinkles) {
      g.strokeStyle = 'rgba(20,15,10,0.18)'; g.lineWidth = 0.5;
      for (let x = b.x0 + 3; x < b.x1; x += 3 + r() * 3) {
        g.beginPath(); g.moveTo(x, b.y0 + b.h * 0.3); g.quadraticCurveTo(x + 1.5, b.y0 + b.h * 0.6, x - 0.5, b.y1); g.stroke();
      }
    }
    if (opt.inner) opt.inner(g, b);
    // lumière (haut gauche) et ombre de volume
    const hl = g.createRadialGradient(b.x0 + b.w * 0.38, b.y0 + b.h * 0.12, 0, b.x0 + b.w * 0.38, b.y0 + b.h * 0.12, Math.max(b.w, b.h) * 0.75);
    hl.addColorStop(0, 'rgba(255,248,225,0.30)'); hl.addColorStop(0.6, 'rgba(255,248,225,0.06)'); hl.addColorStop(1, 'rgba(255,248,225,0)');
    g.fillStyle = hl; g.fillRect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h + 4);
    const sh = g.createLinearGradient(0, b.y0 + b.h * 0.45, 0, b.y1);
    sh.addColorStop(0, 'rgba(15,10,5,0)'); sh.addColorStop(1, 'rgba(15,10,5,0.38)');
    g.fillStyle = sh; g.fillRect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h + 4);
    g.restore();
    // contour et liseré lumineux sur le dos
    if (opt.noOutline) return;
    g.strokeStyle = U.shade(skin.base, -0.55, 0.42);
    g.lineWidth = opt.line || 0.5;
    R.smooth(g, pts, true); g.stroke();
    g.save();
    g.beginPath(); g.rect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h * 0.4 + 2); g.clip();
    g.translate(0, 0.45);
    g.strokeStyle = 'rgba(255,245,215,0.28)'; g.lineWidth = 0.6;
    R.smooth(g, pts, true); g.stroke();
    g.restore();
  }

  function part(pts, skin, seed, opt) {
    opt = opt || {};
    const b = bounds(pts.concat(opt.extraBounds || []));
    const pad = (opt.pad || 2) + 1;
    const r = U.rng(seed);
    return R.sprite(b.w + pad * 2, b.h + pad * 2, -b.x0 + pad, -b.y0 + pad, (g) => {
      if (opt.pre) opt.pre(g, U.rng(seed + 1));
      paintSkin(g, pts, skin, r, opt);
      if (opt.post) opt.post(g, U.rng(seed + 2));
    });
  }

  function drawEye(g, x, y, rad, skin) {
    g.fillStyle = 'rgba(20,12,6,0.7)';
    g.beginPath(); g.ellipse(x, y, rad * 1.45, rad * 1.2, 0, 0, TAU); g.fill();
    const ir = g.createRadialGradient(x - rad * 0.2, y - rad * 0.2, 0, x, y, rad);
    ir.addColorStop(0, U.shade(skin.eye || '#d9a228', 0.35)); ir.addColorStop(0.7, skin.eye || '#d9a228'); ir.addColorStop(1, U.shade(skin.eye || '#d9a228', -0.5));
    g.fillStyle = ir;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    g.fillStyle = '#0c0805';
    g.beginPath(); g.ellipse(x + rad * 0.08, y, rad * 0.28, rad * 0.8, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(x - rad * 0.35, y - rad * 0.4, rad * 0.28, 0, TAU); g.fill();
    // arcade sourcilière
    g.strokeStyle = U.shade(skin.top, -0.4, 0.8); g.lineWidth = rad * 0.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - rad * 1.5, y - rad * 1.2); g.quadraticCurveTo(x, y - rad * 1.9, x + rad * 1.6, y - rad * 1.1); g.stroke();
  }

  function teeth(g, x0, x1, y, n, size, down) {
    g.fillStyle = '#efe6cc';
    g.strokeStyle = 'rgba(60,50,30,0.5)'; g.lineWidth = 0.2;
    for (let i = 0; i < n; i++) {
      const x = U.lerp(x0, x1, (i + 0.5) / n), s = size * (0.7 + 0.3 * Math.sin(i * 1.7) ** 2);
      g.beginPath(); g.moveTo(x - s * 0.4, y); g.lineTo(x + s * 0.1, y + (down ? s : -s)); g.lineTo(x + s * 0.4, y); g.closePath(); g.fill(); g.stroke();
    }
  }

  function claw(g, x, y, len, ang) {
    g.fillStyle = '#2a2018';
    g.beginPath(); g.moveTo(x, y - len * 0.25); g.quadraticCurveTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.lineTo(x, y + len * 0.25); g.fill();
  }

  function feathers(g, pts, col, len, r, dir) {
    g.lineCap = 'round';
    for (const p of pts) {
      g.strokeStyle = U.shade(col, (r() - 0.5) * 0.3, 0.9);
      g.lineWidth = 0.9;
      const a = dir + (r() - 0.5) * 0.4;
      g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + Math.cos(a) * len * 0.5 + 0.5, p[1] + Math.sin(a) * len * 0.5, p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len); g.stroke();
    }
  }

  /* ------------------------------------------------------------------
     Formes génériques
     ------------------------------------------------------------------ */
  const shapes = {
    theroBody(L, H) {
      return [[-0.58 * L, -0.06 * H], [-0.38 * L, -0.44 * H], [0.08 * L, -0.56 * H], [0.55 * L, -0.46 * H], [0.95 * L, -0.24 * H], [1.08 * L, 0.12 * H],
        [0.8 * L, 0.46 * H], [0.28 * L, 0.56 * H], [-0.22 * L, 0.44 * H], [-0.52 * L, 0.24 * H]];
    },
    quadBody(L, H, hump) {
      const k = hump || 0;
      return [[-0.42 * L, 0.02 * H], [-0.34 * L, -(0.38 + k * 0.2) * H], [0.05 * L, -(0.56 + k * 0.4) * H], [0.5 * L, -(0.52 + k * 0.1) * H], [0.88 * L, -0.36 * H], [1.06 * L, -0.08 * H],
        [0.98 * L, 0.3 * H], [0.62 * L, 0.5 * H], [0.15 * L, 0.54 * H], [-0.26 * L, 0.4 * H]];
    },
    tailSeg(len, w0, w1, up) {
      const u = up || 0;
      return [[w0 * 0.3, -w0 * 0.5], [-len * 0.5, -(w0 + w1) * 0.27 - u], [-len - w1 * 0.3, -w1 * 0.5], [-len - w1 * 0.6, 0], [-len - w1 * 0.3, w1 * 0.5], [-len * 0.5, (w0 + w1) * 0.25], [w0 * 0.3, w0 * 0.5]];
    },
    neckSeg(len, w0, w1) {
      return [[-w0 * 0.35, -w0 * 0.48], [len * 0.5, -(w0 + w1) * 0.24], [len + w1 * 0.35, -w1 * 0.48], [len + w1 * 0.5, 0], [len + w1 * 0.35, w1 * 0.52], [len * 0.5, (w0 + w1) * 0.28], [-w0 * 0.35, w0 * 0.55]];
    },
    thigh(len, w) {
      return [[-w * 0.55, -w * 0.4], [w * 0.5, -w * 0.5], [w * 0.55, len * 0.3], [w * 0.28, len * 0.85], [w * 0.2, len * 1.04], [-w * 0.22, len * 1.04], [-w * 0.42, len * 0.55]];
    },
    shin(len, w) {
      return [[-w * 0.5, -w * 0.25], [w * 0.5, -w * 0.25], [w * 0.34, len * 0.7], [w * 0.28, len * 1.02], [-w * 0.28, len * 1.02], [-w * 0.38, len * 0.45]];
    },
    pillar(len, w0, w1) {
      return [[-w0 * 0.5, -w0 * 0.3], [w0 * 0.5, -w0 * 0.3], [w1 * 0.55, len * 0.6], [w1 * 0.5, len * 1.03], [-w1 * 0.5, len * 1.03], [-w1 * 0.55, len * 0.5]];
    },
    theroFoot(fl, fh) {
      return [[-fh * 0.7, -fh * 0.6], [fh * 0.4, -fh * 0.7], [fl * 0.82, -fh * 0.2], [fl, fh * 0.45], [fl * 0.15, fh * 0.6], [-fh * 0.8, fh * 0.4]];
    },
    padFoot(fw, fh) {
      return [[-fw * 0.55, -fh * 0.5], [fw * 0.55, -fh * 0.5], [fw * 0.78, fh * 0.55], [fw * 0.5, fh * 0.65], [-fw * 0.6, fh * 0.65], [-fw * 0.78, fh * 0.5]];
    }
  };

  /* Têtes : renvoient { pts, jaw, hinge, eye, pre, post } en coordonnées
     locales (origine à l'articulation avec le cou, tête vers +x). */
  const heads = {
    thero(hl, hh, o) {
      o = o || {};
      const pts = [[-0.12 * hl, -0.5 * hh], [0.22 * hl, -0.66 * hh], [0.52 * hl, -0.55 * hh], [0.82 * hl, -0.36 * hh], [1.0 * hl, -0.12 * hh], [1.02 * hl, 0.06 * hh], [0.86 * hl, 0.14 * hh], [0.3 * hl, 0.2 * hh], [-0.1 * hl, 0.22 * hh]];
      const hinge = [0.02 * hl, 0.12 * hh];
      const jaw = [[-0.04 * hl, -0.02 * hh], [0.88 * hl, 0.02 * hh], [0.92 * hl, 0.12 * hh], [0.55 * hl, 0.3 * hh], [0.08 * hl, 0.38 * hh], [-0.08 * hl, 0.2 * hh]];
      return {
        pts, jaw, hinge, eye: [0.3 * hl, -0.3 * hh, hh * (o.eye || 0.1)],
        post(g, r, skin) {
          teeth(g, 0.3 * hl, 0.92 * hl, 0.15 * hh, o.teeth || 9, hh * 0.13, true);
          g.fillStyle = 'rgba(25,15,8,0.6)';
          g.beginPath(); g.ellipse(0.9 * hl, -0.14 * hh, hh * 0.05, hh * 0.035, 0.3, 0, TAU); g.fill();
          // fenêtre antorbitaire suggérée
          g.strokeStyle = 'rgba(20,12,6,0.25)'; g.lineWidth = 0.5;
          g.beginPath(); g.ellipse(0.58 * hl, -0.18 * hh, hl * 0.12, hh * 0.1, -0.15, 0, TAU); g.stroke();
          // lèvres
          g.strokeStyle = U.shade(skin.base, -0.55, 0.8); g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(0.05 * hl, 0.15 * hh); g.quadraticCurveTo(0.5 * hl, 0.22 * hh, 0.95 * hl, 0.1 * hh); g.stroke();
        },
        jawPost(g) { teeth(g, 0.3 * hl, 0.86 * hl, 0.03 * hh, (o.teeth || 9) - 1, hh * 0.11, false); }
      };
    },
    trex(hl, hh) {
      const h = heads.thero(hl, hh, { teeth: 10, eye: 0.085 });
      h.pts = [[-0.14 * hl, -0.55 * hh], [0.15 * hl, -0.7 * hh], [0.45 * hl, -0.62 * hh], [0.78 * hl, -0.45 * hh], [0.98 * hl, -0.2 * hh], [1.02 * hl, 0.04 * hh], [0.86 * hl, 0.16 * hh], [0.3 * hl, 0.22 * hh], [-0.12 * hl, 0.28 * hh]];
      h.jaw = [[-0.06 * hl, -0.04 * hh], [0.86 * hl, 0.02 * hh], [0.9 * hl, 0.14 * hh], [0.6 * hl, 0.36 * hh], [0.1 * hl, 0.5 * hh], [-0.1 * hl, 0.3 * hh]];
      h.eye = [0.22 * hl, -0.36 * hh, hh * 0.085];
      return h;
    },
    croc(hl, hh) {
      const pts = [[-0.08 * hl, -0.5 * hh], [0.18 * hl, -0.62 * hh], [0.36 * hl, -0.45 * hh], [0.7 * hl, -0.22 * hh], [1.0 * hl, -0.14 * hh], [1.06 * hl, 0.04 * hh], [0.9 * hl, 0.12 * hh], [0.25 * hl, 0.22 * hh], [-0.08 * hl, 0.24 * hh]];
      const jaw = [[-0.04 * hl, -0.02 * hh], [0.95 * hl, 0.04 * hh], [1.0 * hl, 0.14 * hh], [0.6 * hl, 0.26 * hh], [0.1 * hl, 0.36 * hh], [-0.06 * hl, 0.2 * hh]];
      return {
        pts, jaw, hinge: [0.02 * hl, 0.12 * hh], eye: [0.2 * hl, -0.32 * hh, hh * 0.1],
        post(g) { teeth(g, 0.3 * hl, 1.0 * hl, 0.14 * hh, 14, hh * 0.12, true); g.fillStyle = 'rgba(25,15,8,0.6)'; g.beginPath(); g.arc(0.55 * hl, -0.32 * hh, hh * 0.04, 0, TAU); g.fill(); },
        jawPost(g) { teeth(g, 0.3 * hl, 0.95 * hl, 0.05 * hh, 13, hh * 0.1, false); }
      };
    },
    beak(hl, hh, o) {
      o = o || {};
      const pts = [[-0.1 * hl, -0.48 * hh], [0.25 * hl, -0.62 * hh], [0.55 * hl, -0.5 * hh], [0.85 * hl, -0.26 * hh], [1.04 * hl, -0.02 * hh], [0.98 * hl, 0.14 * hh], [0.7 * hl, 0.22 * hh], [0.2 * hl, 0.26 * hh], [-0.1 * hl, 0.22 * hh]];
      const jaw = [[-0.04 * hl, -0.02 * hh], [0.85 * hl, 0.06 * hh], [0.9 * hl, 0.16 * hh], [0.55 * hl, 0.3 * hh], [0.1 * hl, 0.36 * hh], [-0.08 * hl, 0.2 * hh]];
      return {
        pts, jaw, hinge: [0.02 * hl, 0.14 * hh], eye: [0.32 * hl, -0.28 * hh, hh * (o.eye || 0.12)],
        post(g) {
          g.fillStyle = 'rgba(55,45,30,0.75)';
          g.beginPath(); g.moveTo(0.78 * hl, -0.3 * hh); g.quadraticCurveTo(1.08 * hl, -0.06 * hh, 0.98 * hl, 0.15 * hh); g.lineTo(0.8 * hl, 0.12 * hh); g.closePath(); g.fill();
          g.fillStyle = 'rgba(25,15,8,0.55)'; g.beginPath(); g.ellipse(0.8 * hl, -0.2 * hh, hh * 0.05, hh * 0.035, 0.4, 0, TAU); g.fill();
        },
        jawPost(g) { g.fillStyle = 'rgba(55,45,30,0.75)'; g.beginPath(); g.moveTo(0.7 * hl, 0.04 * hh); g.lineTo(0.9 * hl, 0.12 * hh); g.lineTo(0.72 * hl, 0.24 * hh); g.fill(); }
      };
    },
    parrot(hl, hh) {
      const pts = [[-0.1 * hl, -0.5 * hh], [0.3 * hl, -0.68 * hh], [0.7 * hl, -0.55 * hh], [0.98 * hl, -0.25 * hh], [1.02 * hl, 0.12 * hh], [0.86 * hl, 0.34 * hh], [0.8 * hl, 0.12 * hh], [0.3 * hl, 0.22 * hh], [-0.1 * hl, 0.25 * hh]];
      const h = heads.beak(hl, hh, { eye: 0.13 });
      h.pts = pts;
      h.post = (g) => {
        g.fillStyle = 'rgba(70,55,35,0.85)';
        g.beginPath(); g.moveTo(0.72 * hl, -0.42 * hh); g.quadraticCurveTo(1.06 * hl, -0.2 * hh, 0.88 * hl, 0.34 * hh); g.lineTo(0.78 * hl, 0.14 * hh); g.closePath(); g.fill();
        // cornes de joue
        g.fillStyle = 'rgba(80,60,40,0.6)'; g.beginPath(); g.moveTo(0.2 * hl, 0.05 * hh); g.lineTo(0.05 * hl, 0.35 * hh); g.lineTo(0.3 * hl, 0.15 * hh); g.fill();
      };
      return h;
    },
    sauro(hl, hh, arch) {
      const pts = [[-0.1 * hl, -0.45 * hh], [0.2 * hl, -(0.6 + (arch || 0)) * hh], [0.45 * hl, -(0.58 + (arch || 0) * 0.6) * hh], [0.7 * hl, -0.32 * hh], [1.0 * hl, -0.14 * hh], [1.02 * hl, 0.1 * hh], [0.7 * hl, 0.22 * hh], [0.2 * hl, 0.26 * hh], [-0.1 * hl, 0.22 * hh]];
      const jaw = [[-0.04 * hl, -0.02 * hh], [0.9 * hl, 0.06 * hh], [0.94 * hl, 0.16 * hh], [0.5 * hl, 0.3 * hh], [0.1 * hl, 0.34 * hh], [-0.08 * hl, 0.2 * hh]];
      return {
        pts, jaw, hinge: [0.02 * hl, 0.14 * hh], eye: [0.34 * hl, -0.22 * hh, hh * 0.12],
        post(g) { g.fillStyle = 'rgba(25,15,8,0.5)'; g.beginPath(); g.ellipse(0.32 * hl, -(0.52 + (arch || 0) * 0.7) * hh, hh * 0.08, hh * 0.05, 0, 0, TAU); g.fill(); teeth(g, 0.75 * hl, 0.98 * hl, 0.14 * hh, 4, hh * 0.08, true); }
      };
    }
  };

  /* ------------------------------------------------------------------
     Définitions des espèces (formes, couleurs, attributs)
     ------------------------------------------------------------------ */
  const SK = (base, belly, top, pattern, pcol, extra) => Object.assign({ base, belly, top, pattern, pcol, eye: '#d4a02a' }, extra || {});

  const ART = {
    compsognathus: { plan: 'thero', L: 7.5, H: 4.6, leg: 10, neck: [6, 2.6, 1.8], neckAng: -0.85, head: ['thero', 6.5, 3.6, { teeth: 6, eye: 0.13 }], headRel: 0.8, tail: [13, 2.4], tailAng: 0.05, arm: 3.5,
      skin: SK('#7d8248', '#cdc48e', '#4f5a2e', 'stripes', '#3a4222', { scale: 0.9 }) },
    dryosaurus: { plan: 'thero', L: 10.5, H: 6.6, leg: 14, neck: [7, 4, 2.8], neckAng: -0.95, head: ['beak', 7.5, 4.6], headRel: 0.95, tail: [17, 3.6], tailAng: 0.05, arm: 4,
      skin: SK('#8a7a52', '#d4c89c', '#5f5236', 'spots', '#4a3e26', { scale: 1 }) },
    psittacosaurus: { plan: 'thero', L: 11, H: 7.6, leg: 11, neck: [4.5, 5, 4], neckAng: -0.7, head: ['parrot', 7, 6], headRel: 0.75, tail: [13, 4], tailAng: 0.1, arm: 5,
      skin: SK('#9a7a4c', '#dcc8a0', '#6a5030', 'mottle', '#5a3e22', { scale: 1 }) },
    pachycephalosaurus: { plan: 'thero', L: 16, H: 11.5, leg: 18, neck: [6, 7, 5.5], neckAng: -0.75, head: ['beak', 10, 8], headRel: 0.85, dome: true, tail: [21, 6], tailAng: 0.05, arm: 6,
      skin: SK('#8a6c54', '#cfbb9c', '#5e4636', 'bands', '#4a3426', { scale: 1.3, accent: '#b8a280' }) },
    parasaurolophus: { plan: 'thero', L: 24, H: 19, leg: 26, neck: [13, 9, 6.5], neckAng: -0.95, head: ['beak', 13, 8], headRel: 1.0, crestTube: true, tail: [30, 9], tailAng: 0.05, arm: 10, herbivoreArm: true,
      skin: SK('#6f7d58', '#d2caa2', '#4a5638', 'stripes', '#3a442a', { scale: 1.6, accent: '#a8643a' }) },
    triceratops: { plan: 'quad', L: 38, H: 27, legB: 21, neck: [7, 15, 13], neckAng: 0.05, head: ['beak', 26, 17, { eye: 0.08 }], headRel: 0.12, trike: true, tail: [26, 12], tailAng: 0.02, hump: 0.1,
      skin: SK('#8d6e4c', '#c8b28c', '#5e4a34', 'mottle', '#4a3826', { scale: 2, wrinkles: true, accent: '#9a5434', acc2: '#dcb880' }) },
    stegosaurus: { plan: 'quad', L: 42, H: 26, legB: 25, legFrontShort: true, neck: [11, 9, 6], neckAng: 0.45, head: ['beak', 11, 6.5], headRel: 0.1, plates: true, tail: [36, 12], tailAng: -0.12, hump: 0.55, tilt: 0.18,
      skin: SK('#7f7850', '#cac092', '#59553a', 'bands', '#454228', { scale: 1.8, accent: '#8a5a3c', acc2: '#b08a5a' }) },
    ankylosaurus: { plan: 'quad', L: 38, H: 18, legB: 12, neck: [6, 12, 10], neckAng: 0.15, head: ['beak', 12, 9], headRel: 0.05, armor: true, tail: [28, 9], tailAng: -0.02, club: true, hump: 0.15,
      skin: SK('#7a6c58', '#bcac8c', '#534838', 'none', null, { scale: 1.6, accent: '#9a8a6c' }) },
    diplodocus: { plan: 'quad', L: 42, H: 26, legB: 30, neck: [17, 16, 7], neckSegs: 3, neckAng: -0.3, head: ['sauro', 10, 5.5, 0], headRel: 0.6, tail: [24, 13], tailSegs: 4, tailAng: -0.08, whip: true, hump: 0.2,
      skin: SK('#8a8470', '#d0c8ac', '#5f5a4a', 'stripes', '#4c473a', { scale: 2, wrinkles: true, palpha: 0.3 }) },
    brachiosaurus: { plan: 'quad', L: 46, H: 30, legB: 40, neck: [21, 19, 9], neckSegs: 3, neckAng: -1.1, head: ['sauro', 12, 7, 0.45], headRel: 1.25, tail: [16, 11], tailSegs: 3, tailAng: 0.1, hump: 0, tilt: -0.24,
      skin: SK('#7f8a7a', '#cbcdb8', '#56604f', 'mottle', '#3e4638', { scale: 2, wrinkles: true }) },
    velociraptor: { plan: 'thero', L: 11, H: 7.4, leg: 15, neck: [8, 4.5, 3], neckAng: -1.0, head: ['thero', 10, 5, { teeth: 8, eye: 0.12 }], headRel: 1.0, tail: [18, 3.4], tailAng: -0.05, arm: 7, feathers: true, sickle: true,
      skin: SK('#9a7a4a', '#d8c69c', '#5d4526', 'stripes', '#3e2c18', { scale: 0.9, accent: '#6a4a2a', acc2: '#5e4a34' }) },
    dilophosaurus: { plan: 'thero', L: 18, H: 12, leg: 23, neck: [12, 6.5, 4.5], neckAng: -0.9, head: ['thero', 16, 8, { teeth: 9 }], headRel: 0.9, crests: true, tail: [28, 6], tailAng: 0, arm: 8,
      skin: SK('#7d8a4a', '#d4cc94', '#4d5a2c', 'spots', '#3a4222', { scale: 1.3, accent: '#b8502a', acc2: '#e0b050' }) },
    allosaurus: { plan: 'thero', L: 27, H: 22, leg: 31, neck: [13, 12, 9], neckAng: -0.75, head: ['thero', 22, 12, { teeth: 11 }], headRel: 0.75, alloHorns: true, tail: [38, 11], tailAng: 0, arm: 10,
      skin: SK('#8a5f45', '#d2b28c', '#5c3c2a', 'stripes', '#3e2618', { scale: 1.6, accent: '#8a3a26' }) },
    carnotaurus: { plan: 'thero', L: 25, H: 20, leg: 31, neck: [11, 11, 8.5], neckAng: -0.75, head: ['thero', 16, 12, { teeth: 9 }], headRel: 0.78, carnoHorns: true, tail: [34, 10], tailAng: 0, arm: 4, bumps: true,
      skin: SK('#8e4f3e', '#ccA686', '#5e2e24', 'mottle', '#4a2018', { scale: 1.6, accent: '#3a2a22' }) },
    spinosaurus: { plan: 'thero', L: 34, H: 24, leg: 27, neck: [16, 12, 9], neckAng: -0.65, head: ['croc', 32, 10], headRel: 0.75, sail: true, tail: [46, 12], tailAng: 0.02, paddle: true, arm: 12,
      skin: SK('#6e6a52', '#cac0a2', '#4a4636', 'mottle', '#3a3628', { scale: 1.8, accent: '#8e5a40', acc2: '#c8a070' }) },
    trex: { plan: 'thero', L: 36, H: 31, leg: 40, neck: [14, 18, 15], neckAng: -0.7, head: ['trex', 32, 17], headRel: 0.72, tail: [42, 15], tailAng: 0.02, arm: 7, tiny: true,
      skin: SK('#6a5a44', '#c2b090', '#44382a', 'mottle', '#30261a', { scale: 2.2, wrinkles: true, eye: '#c88a1a' }) },
    pteranodon: { plan: 'ptero', span: 34, body: 12, head: 15, crest: 12,
      skin: SK('#a6845c', '#e0d0b0', '#6e5638', 'none', null, { membrane: '#8a5a40', accent: '#c0602a' }) },
    quetzalcoatlus: { plan: 'ptero', span: 54, body: 18, head: 26, crest: 8, neck: 12,
      skin: SK('#9a6a5a', '#e2c8b0', '#664036', 'none', null, { membrane: '#7a4a3a', accent: '#b8402a', beak: '#d8c070' }) },
    plesiosaurus: { plan: 'plesio', body: 26, bw: 15, neck: 30, head: 7,
      skin: SK('#4f6f72', '#c8d4c8', '#2e4a50', 'spots', '#24383c', { scale: 1.6 }) },
    mosasaurus: { plan: 'mosa', len: 110, w: 16, head: 26,
      skin: SK('#3f5a64', '#d2dad2', '#24363e', 'stripes', '#1c2a30', { scale: 1.8, palpha: 0.35 }) }
  };
  DZ.DINO_ART = ART;

  /* ------------------------------------------------------------------
     Construction des pantins (vue latérale)
     ------------------------------------------------------------------ */
  function legGeom(totalLen, thighW, shinW, isQuad, front) {
    const a = isQuad ? (front ? -0.04 : 0.1) : 0.34;
    const s = isQuad ? (front ? 0.08 : -0.18) : -0.72;
    const l1 = totalLen * (isQuad ? 0.5 : 0.47), l2 = totalLen * (isQuad ? 0.46 : 0.62);
    return { a, s, l1, l2, thighW, shinW };
  }
  function legReach(lg, footH) { return lg.l1 * Math.cos(lg.a) + lg.l2 * Math.cos(lg.a + lg.s) + footH; }

  function buildSide(id, A, seed) {
    const skin = A.skin, far = darkSkin(skin, 0.32);
    const isQuad = A.plan === 'quad';
    const L = A.L, H = A.H;
    const rig = { id, quad: isQuad, parts: {} };
    const P = rig.parts;
    let sd = seed;
    const nx = () => (sd += 17);

    /* --- corps --- */
    let bodyPts = isQuad ? shapes.quadBody(L, H, A.hump) : shapes.theroBody(L, H);
    const tilt = A.tilt || 0;
    if (tilt) bodyPts = bodyPts.map(([x, y]) => [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
    const rot = (p) => tilt ? [p[0] * Math.cos(tilt) - p[1] * Math.sin(tilt), p[0] * Math.sin(tilt) + p[1] * Math.cos(tilt)] : p;
    const top = Math.min(...bodyPts.map((p) => p[1]));
    let pre = null, post = null, extra = [];
    if (A.sail) {
      const sailH = H * 1.0;
      extra = [[-0.3 * L, top - sailH], [0.8 * L, top - sailH]];
      pre = (g, r) => {
        const pts = [[-0.45 * L, -0.3 * H], [-0.25 * L, top - sailH * 0.75], [0.15 * L, top - sailH], [0.55 * L, top - sailH * 0.8], [0.85 * L, -0.4 * H], [0.3 * L, -0.4 * H]];
        paintSkin(g, pts, Object.assign({}, skin, { top: skin.accent, base: U.shade(skin.accent, -0.1), belly: skin.base, pattern: 'stripes', pcol: skin.acc2, palpha: 0.35 }), r, { noScales: true, pscale: 1.6 });
        g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 0.7;
        for (let i = 0; i <= 10; i++) { const x = U.lerp(-0.38 * L, 0.78 * L, i / 10); const h = Math.sin(Math.PI * (i / 10) * 0.95 + 0.1) * sailH; g.beginPath(); g.moveTo(x, -0.35 * H); g.lineTo(x + 1, top - h * 0.95); g.stroke(); }
      };
    }
    if (A.plates) {
      extra = [[-0.4 * L, top - H * 0.6], [0.9 * L, top - H * 0.5]];
      pre = (g, r) => {
        const n = 9;
        for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
          const t = (i + row * 0.5) / n;
          const x = U.lerp(-0.3 * L, 0.78 * L, t);
          const yTop = U.lerp(-0.42, -0.9, Math.sin(Math.PI * U.clamp(t + 0.05, 0, 1))) * H + (tilt ? x * Math.sin(tilt) : 0);
          const ph = H * (0.22 + 0.42 * Math.sin(Math.PI * U.clamp(t * 1.05, 0, 1)));
          const pw = ph * 0.75;
          const pts = [[x - pw * 0.5, yTop + ph * 0.5], [x - pw * 0.3, yTop - ph * 0.35], [x + pw * 0.1, yTop - ph * 0.7], [x + pw * 0.45, yTop - ph * 0.2], [x + pw * 0.5, yTop + ph * 0.5]];
          const sk = Object.assign({}, row ? skin : far, { top: row ? skin.accent : U.shade(skin.accent, -0.25), base: row ? skin.acc2 : U.shade(skin.acc2, -0.25), belly: skin.base, pattern: 'none' });
          paintSkin(g, pts, sk, r, { noScales: true });
          g.strokeStyle = 'rgba(60,30,15,0.3)'; g.lineWidth = 0.35;
          for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x, yTop + ph * 0.4); g.lineTo(x - pw * 0.3 + k * pw * 0.3, yTop - ph * 0.3); g.stroke(); }
        }
      };
    }
    post = (g, r) => {
      if (A.armor) {
        for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) {
          const x = U.lerp(-0.3 * L, 0.95 * L, (i + (row % 2) * 0.5) / 9), y = -0.42 * H + row * H * 0.2 + Math.abs(x - 0.35 * L) * 0.004 * H;
          const rr = H * (0.1 - row * 0.012);
          const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.4, 0, x, y, rr * 1.2);
          gr.addColorStop(0, U.shade(skin.accent, 0.35)); gr.addColorStop(1, U.shade(skin.accent, -0.4));
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rr * 1.3, rr, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(30,20,10,0.3)'; g.beginPath(); g.ellipse(x + rr * 0.2, y + rr * 0.3, rr * 0.5, rr * 0.3, 0, 0, TAU); g.fill();
        }
        for (let i = 0; i < 6; i++) { // pointes latérales
          const x = U.lerp(-0.25 * L, 0.9 * L, i / 5), y = 0.15 * H;
          g.fillStyle = U.shade(skin.accent, -0.1); g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 1, y + H * 0.22); g.lineTo(x + 3, y); g.fill();
        }
      }
      if (A.bumps) {
        for (let i = 0; i < 26; i++) { const x = U.lerp(-0.4 * L, 0.95 * L, r()), y = -0.45 * H + r() * H * 0.45; g.fillStyle = 'rgba(40,20,15,0.35)'; g.beginPath(); g.arc(x, y, 0.6 + r() * 0.8, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,230,200,0.15)'; g.beginPath(); g.arc(x - 0.3, y - 0.3, 0.4, 0, TAU); g.fill(); }
      }
      if (A.feathers) {
        const pts = [];
        for (let i = 0; i < 18; i++) pts.push([U.lerp(-0.5 * L, 0.9 * L, i / 17), U.lerp(-0.4, -0.5, Math.sin(i / 17 * Math.PI)) * H]);
        feathers(g, pts, skin.accent, 3, r, -Math.PI * 0.85);
      }
    };
    P.body = part(bodyPts, skin, nx(), { pre, post, extraBounds: extra, pad: 3, scaleMul: 1 });
    P.bodyFar = null;

    /* --- attaches --- */
    const shoulder = rot(isQuad ? [0.92 * L, -0.12 * H] : [0.94 * L, -0.14 * H]);
    const tailBase = rot(isQuad ? [-0.36 * L, -0.12 * H] : [-0.52 * L, -0.04 * H]);
    rig.shoulder = shoulder; rig.tailBase = tailBase;

    /* --- jambes --- */
    const footH = isQuad ? H * 0.08 : A.leg * 0.06;
    const back = legGeom(isQuad ? A.legB : A.leg, isQuad ? H * 0.46 : H * 0.62, isQuad ? H * 0.3 : H * 0.22, isQuad, false);
    rig.hipH = legReach(back, footH);
    const legs = [];
    const mkLeg = (lg, at, front) => {
      const thighPts = isQuad ? shapes.pillar(lg.l1, lg.thighW, lg.thighW * 0.75) : shapes.thigh(lg.l1, lg.thighW);
      const shinPts = isQuad ? shapes.pillar(lg.l2, lg.shinW * 1.15, lg.shinW) : shapes.shin(lg.l2, lg.shinW);
      const footPts = isQuad ? shapes.padFoot(lg.shinW * 1.25, footH * 1.4) : shapes.theroFoot(A.leg * 0.3, footH * 1.4);
      const footPost = (g) => {
        if (isQuad) { for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(230,220,190,0.55)'; g.beginPath(); g.ellipse(lg.shinW * (0.1 + i * 0.22), footH * 0.75, lg.shinW * 0.09, footH * 0.25, 0, 0, TAU); g.fill(); } }
        else { claw(g, A.leg * 0.3, footH * 0.3, A.leg * 0.06, 0.9); claw(g, A.leg * 0.22, footH * 0.5, A.leg * 0.05, 0.9); if (A.sickle) claw(g, A.leg * 0.05, -footH * 0.2, A.leg * 0.1, -0.6); }
      };
      const mk = (sk, s) => ({
        thigh: part(thighPts, sk, s, { noBelly: true, scaleMul: 0.8, noOutline: true }),
        shin: part(shinPts, sk, s + 1, { noBelly: true, scaleMul: 0.7, noOutline: true }),
        foot: part(footPts, sk, s + 2, { noBelly: true, scaleMul: 0.6, post: footPost, noOutline: true })
      });
      const s0 = nx();
      return Object.assign({ at, front, near: mk(skin, s0), far: mk(far, s0) }, lg);
    };
    const hipAt = isQuad ? [0, 0.12 * H] : [0, 0.08 * H];
    legs.push(mkLeg(back, hipAt, false));
    if (isQuad) {
      const fat = rot([0.82 * L, 0.18 * H]);
      const need = rig.hipH - fat[1] - footH;
      const lg = legGeom(1, H * 0.36, H * 0.26, true, true);
      const per = need / (0.5 * Math.cos(lg.a) + 0.46 * Math.cos(lg.a + lg.s));
      legs.push(mkLeg(legGeom(per, H * 0.36, H * 0.26, true, true), fat, true));
    }
    rig.legs = legs;
    rig.footH = footH;

    /* --- bras (théropodes) --- */
    if (!isQuad && A.arm) {
      const al = A.arm, aw = Math.max(1.4, H * (A.tiny ? 0.09 : 0.12));
      const armPts = [[-aw * 0.6, -aw * 0.4], [aw * 0.5, -aw * 0.5], [al * 0.55, al * 0.45], [al * 0.75, al * 0.65], [al * 0.6, al * 0.78], [al * 0.4, al * 0.6], [-aw * 0.4, aw * 0.5]];
      const armPost = (g, r) => {
        claw(g, al * 0.7, al * 0.72, al * 0.12, 1.2);
        if (A.feathers) { const pts = []; for (let i = 0; i < 8; i++) pts.push([U.lerp(0, al * 0.7, i / 7), U.lerp(0, al * 0.62, i / 7)]); feathers(g, pts, skin.acc2, al * 0.55, r, Math.PI * 0.75); }
      };
      rig.arm = { at: [0.82 * L, 0.18 * H], near: part(armPts, skin, nx(), { noBelly: true, post: armPost, scaleMul: 0.6, extraBounds: A.feathers ? [[-al * 0.5, al * 1.1]] : [] }), far: part(armPts, far, nx(), { noBelly: true, post: armPost, scaleMul: 0.6, extraBounds: A.feathers ? [[-al * 0.5, al * 1.1]] : [] }) };
    }

    /* --- queue --- */
    const segs = A.tailSegs || 3;
    const tl = A.tail[0], tw = A.tail[1];
    rig.tail = [];
    let w0 = tw;
    for (let i = 0; i < segs; i++) {
      const frac = A.whip ? [0.22, 0.24, 0.26, 0.28][i] || 0.25 : [0.4, 0.33, 0.27][i] || 0.3;
      const len = tl * frac * (A.whip ? 1.6 : 1);
      let w1 = i === segs - 1 ? Math.max(0.6, tw * 0.08) : w0 * (A.whip ? 0.55 : 0.62);
      const segPost = (g, r) => {
        if (A.plates && i === 0) { for (let k = 0; k < 3; k++) { const x = -len * (0.2 + k * 0.3), h = w0 * (0.9 - k * 0.25); g.fillStyle = U.shade(skin.accent, -0.1); g.beginPath(); g.moveTo(x - h * 0.4, -w0 * 0.3); g.lineTo(x, -w0 * 0.3 - h); g.lineTo(x + h * 0.4, -w0 * 0.3); g.fill(); } }
        if (A.plates && i === segs - 1) { for (let k = 0; k < 2; k++) { const x = -len * (0.3 + k * 0.35); g.fillStyle = '#d8ccb0'; g.strokeStyle = 'rgba(60,50,30,0.6)'; g.lineWidth = 0.3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x - 1, -s * w0 * 0.2); g.lineTo(x - 7 - k * 2, -s * (w0 * 0.3 + 9)); g.lineTo(x + 1.2, -s * w0 * 0.25); g.closePath(); g.fill(); g.stroke(); } } }
        if (A.club && i === segs - 1) { const gr = g.createRadialGradient(-len - 1, -1.5, 0, -len, 0, 6); gr.addColorStop(0, U.shade(skin.accent, 0.3)); gr.addColorStop(1, U.shade(skin.accent, -0.45)); g.fillStyle = gr; g.beginPath(); g.ellipse(-len - 1, 0, 6.5, 4.4, 0, 0, TAU); g.fill(); }
        if (A.armor && i < segs - 1) { for (let k = 0; k < 3; k++) { g.fillStyle = U.shade(skin.accent, -0.2); g.beginPath(); g.moveTo(-len * (0.2 + k * 0.3), w0 * 0.2); g.lineTo(-len * (0.25 + k * 0.3), w0 * 0.2 + 4); g.lineTo(-len * (0.32 + k * 0.3), w0 * 0.2); g.fill(); } }
        if (A.feathers) { const pts = []; for (let k = 0; k < 8; k++) pts.push([-len * k / 7, -w0 * 0.4 * (1 - k / 9)]); feathers(g, pts, skin.accent, 2.5 + i, r, -Math.PI * 0.8); if (i === segs - 1) { const p2 = []; for (let k = 0; k < 5; k++) p2.push([-len * (0.6 + k * 0.1), 0]); feathers(g, p2, skin.acc2, 4, r, Math.PI); } }
      };
      const up = A.paddle ? w0 * 0.35 : 0;
      const pts = shapes.tailSeg(len, w0, w1, up);
      if (A.paddle) { pts.splice(1, 0, [-len * 0.3, -w0 * 0.9]); }
      rig.tail.push({ len, sp: part(pts, skin, nx(), { post: segPost, scaleMul: 0.9, noOutline: true, extraBounds: A.plates && i === segs - 1 ? [[-len - 10, -w0 - 12], [0, w0 + 12]] : A.club ? [[-len - 8, -6], [0, 6]] : A.plates && i === 0 ? [[0, -w0 * 1.3]] : A.feathers ? [[-len - 4, -w0 - 4], [0, w0 + 4]] : [] }) });
      w0 = w1;
    }

    /* --- cou --- */
    const nsegs = A.neckSegs || 1;
    rig.neck = [];
    let nw0 = A.neck[1];
    for (let i = 0; i < nsegs; i++) {
      const len = A.neck[0] * (nsegs > 1 ? 1 : 1);
      const nw1 = i === nsegs - 1 ? A.neck[2] : U.lerp(A.neck[1], A.neck[2], (i + 1) / nsegs);
      rig.neck.push({ len, sp: part(shapes.neckSeg(len, nw0, nw1), skin, nx(), { scaleMul: 0.85, noOutline: true, post: A.feathers ? (g, r) => { const pts = []; for (let k = 0; k < 6; k++) pts.push([len * k / 5, -nw0 * 0.45]); feathers(g, pts, skin.accent, 2, r, -Math.PI * 0.7); } : null }) });
      nw0 = nw1;
    }

    /* --- tête --- */
    const hd = A.head;
    const H0 = heads[hd[0]](hd[1], hd[2], hd[3]);
    const hl = hd[1], hh = hd[2];
    let hPre = null, hExtra = [];
    if (A.trike) {
      hExtra = [[-hl * 0.45, -hh * 1.25], [hl * 1.2, -hh * 1.1], [-hl * 0.4, hh * 0.7]];
      hPre = (g, r) => {
        const frill = [[0.1 * hl, -0.42 * hh], [-0.05 * hl, -1.0 * hh], [-0.3 * hl, -1.18 * hh], [-0.5 * hl, -0.95 * hh], [-0.52 * hl, -0.3 * hh], [-0.4 * hl, 0.25 * hh], [-0.15 * hl, 0.6 * hh], [0.15 * hl, 0.35 * hh]];
        paintSkin(g, frill, Object.assign({}, skin, { top: U.shade(skin.accent, -0.1), base: U.css(U.mixRgb(U.rgb(skin.base), U.rgb(skin.accent), 0.45)), belly: skin.base, pattern: 'spots', pcol: skin.acc2, palpha: 0.35 }), r, { noScales: false, pscale: 1.4, scaleMul: 1.2 });
        // bord festonné (épiocciputaux)
        g.fillStyle = U.shade(skin.accent, -0.25);
        for (let i = 1; i < 6; i++) { const p = frill[i], q = frill[i + 1]; for (let k = 0; k < 2; k++) { const t = k / 2; g.beginPath(); g.arc(U.lerp(p[0], q[0], t), U.lerp(p[1], q[1], t), hh * 0.06, 0, TAU); g.fill(); } }
      };
    }
    if (A.crestTube) {
      hExtra = [[-hl * 1.4, -hh * 1.6]];
      hPre = (g, r) => {
        const pts = [[0.3 * hl, -0.5 * hh], [-0.4 * hl, -1.2 * hh], [-1.35 * hl, -1.55 * hh], [-1.42 * hl, -1.3 * hh], [-0.4 * hl, -0.85 * hh], [0.1 * hl, -0.25 * hh]];
        paintSkin(g, pts, Object.assign({}, skin, { top: skin.accent, base: U.shade(skin.accent, -0.1), belly: skin.base, pattern: 'stripes', pcol: U.shade(skin.accent, -0.4) }), r, { noScales: true });
      };
    }
    const hPost = (g, r) => {
      if (H0.post) H0.post(g, r, skin);
      drawEye(g, H0.eye[0], H0.eye[1], H0.eye[2], skin);
      if (A.trike) {
        const horn = (x, y, len, ang, w) => { const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len); gr.addColorStop(0, '#b8a684'); gr.addColorStop(1, '#efe6cc'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w * Math.sin(ang), y + w * Math.cos(ang)); g.quadraticCurveTo(x + Math.cos(ang) * len * 0.6, y + Math.sin(ang) * len * 0.6 - 1, x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.lineTo(x + w * Math.sin(ang), y - w * Math.cos(ang)); g.fill(); g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 0.3; g.stroke(); };
        horn(0.4 * hl, -0.45 * hh, hl * 0.62, -0.75, 1.6);
        horn(0.82 * hl, -0.22 * hh, hl * 0.18, -1.15, 1.4);
      }
      if (A.dome) {
        const gr = g.createRadialGradient(0.2 * hl, -0.85 * hh, 0, 0.25 * hl, -0.6 * hh, hh * 0.6);
        gr.addColorStop(0, U.shade(skin.accent, 0.35)); gr.addColorStop(1, U.shade(skin.accent, -0.3));
        g.fillStyle = gr; g.beginPath(); g.ellipse(0.22 * hl, -0.55 * hh, hl * 0.42, hh * 0.45, -0.15, Math.PI, TAU); g.fill();
        g.fillStyle = U.shade(skin.accent, -0.3);
        for (let i = 0; i < 6; i++) { const a = Math.PI * 1.05 + i * 0.16; g.beginPath(); g.arc(0.22 * hl + Math.cos(a) * hl * 0.44, -0.55 * hh + Math.sin(a) * hh * 0.15, 0.55, 0, TAU); g.fill(); }
      }
      if (A.crests) {
        for (const off of [0, 1.2]) { g.fillStyle = off ? skin.accent : U.shade(skin.accent, -0.3); g.beginPath(); g.moveTo(0.1 * hl + off, -0.55 * hh); g.quadraticCurveTo(0.35 * hl + off, -1.35 * hh, 0.82 * hl + off, -0.4 * hh); g.quadraticCurveTo(0.45 * hl, -0.75 * hh, 0.1 * hl + off, -0.55 * hh); g.fill(); g.strokeStyle = U.alpha(skin.acc2, 0.6); g.lineWidth = 0.4; g.stroke(); }
      }
      if (A.alloHorns) { g.fillStyle = skin.accent; g.beginPath(); g.moveTo(0.2 * hl, -0.52 * hh); g.lineTo(0.3 * hl, -0.82 * hh); g.lineTo(0.4 * hl, -0.55 * hh); g.fill(); g.strokeStyle = U.shade(skin.accent, -0.3); g.lineWidth = 0.6; g.beginPath(); g.moveTo(0.45 * hl, -0.55 * hh); g.lineTo(0.9 * hl, -0.32 * hh); g.stroke(); }
      if (A.carnoHorns) { g.fillStyle = '#4a3a2e'; g.beginPath(); g.moveTo(0.12 * hl, -0.5 * hh); g.quadraticCurveTo(0.05 * hl, -0.95 * hh, -0.15 * hl, -1.0 * hh); g.quadraticCurveTo(0.12 * hl, -0.75 * hh, 0.36 * hl, -0.55 * hh); g.fill(); }
      if (A.club) { g.fillStyle = U.shade(skin.accent, -0.15); for (const p of [[-0.05, -0.45], [-0.05, 0.15]]) { g.beginPath(); g.moveTo(p[0] * hl, p[1] * hh); g.lineTo(-0.25 * hl, (p[1] - 0.15) * hh); g.lineTo(0.05 * hl, (p[1] + 0.12) * hh); g.fill(); } }
    };
    if (A.dome) hExtra = [[-0.25 * hl, -1.05 * hh]];
    if (A.crests) hExtra = [[0.1 * hl, -1.4 * hh]];
    if (A.carnoHorns) hExtra = [[-0.2 * hl, -1.05 * hh]];
    if (A.alloHorns) hExtra = [[0.3 * hl, -0.9 * hh]];
    if (A.club) hExtra = [[-0.3 * hl, -0.65 * hh]];
    const jawPost = (g) => { if (H0.jawPost) H0.jawPost(g); };
    rig.head = {
      sp: part(H0.pts, skin, nx(), { pre: hPre, post: hPost, extraBounds: hExtra, scaleMul: 0.7, pad: 2 }),
      jaw: H0.jaw ? part(H0.jaw, skin, nx(), { post: jawPost, scaleMul: 0.6 }) : null,
      hinge: H0.hinge, eye: H0.eye, hl, hh
    };
    rig.neckAng = A.neckAng; rig.headRel = A.headRel; rig.tailAng = A.tailAng;
    rig.len = (isQuad ? 1.48 : 1.66) * L + A.tail[0] * (A.whip ? 1.6 : 1) + A.neck[0] * (A.neckSegs || 1) * 0.7 + hl * 0.6;
    rig.height = rig.hipH + H * 0.6 + (A.neckAng < -0.9 ? A.neck[0] * (A.neckSegs || 1) * 0.8 : 0);
    rig.skin = skin;
    return rig;
  }

  /* ---------- Reptiles volants (vue du dessus) ---------- */
  function buildPtero(id, A, seed) {
    const sk = A.skin, rig = { id, plan: 'ptero', parts: {} };
    const sp = A.span, bl = A.body;
    // aile droite (vers +y) ; la gauche est dessinée en miroir
    const wingPts = [[bl * 0.1, 0], [bl * 0.32, sp * 0.3], [bl * 0.2, sp * 0.7], [-bl * 0.2, sp], [-bl * 0.45, sp * 0.82], [-sp * 0.32, sp * 0.45], [-sp * 0.22, sp * 0.12], [-bl * 0.45, 0]];
    rig.wing = part(wingPts, Object.assign({}, sk, { top: U.shade(sk.membrane, -0.2), base: sk.membrane, belly: U.shade(sk.membrane, 0.25), pattern: 'none' }), seed + 1, {
      noScales: true,
      post(g) { g.strokeStyle = U.shade(sk.membrane, -0.45, 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(bl * 0.1, 0); g.quadraticCurveTo(bl * 0.4, sp * 0.4, -bl * 0.2, sp); g.stroke(); g.strokeStyle = 'rgba(40,20,10,0.25)'; g.lineWidth = 0.4; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-bl * 0.2, sp * 0.1); g.lineTo(-bl * (0.1 + i * 0.07), sp * (0.25 + i * 0.15)); g.stroke(); } }
    });
    const bodyPts = [[-bl * 0.6, 0], [-bl * 0.3, -bl * 0.22], [bl * 0.3, -bl * 0.25], [bl * 0.55, 0], [bl * 0.3, bl * 0.25], [-bl * 0.3, bl * 0.22]];
    rig.body = part(bodyPts, sk, seed + 2, { scaleMul: 0.6 });
    const hl = A.head, neck = A.neck || 0;
    const headPts = [[-1, -2.4], [neck + hl * 0.25, -1.8], [neck + hl, -0.2], [neck + hl, 0.2], [neck + hl * 0.25, 1.8], [-1, 2.4]];
    rig.head = part(headPts, Object.assign({}, sk, { base: sk.beak || sk.base }), seed + 3, {
      scaleMul: 0.5, extraBounds: [[-A.crest - 2, -2], [-A.crest - 2, 2]],
      pre(g) { g.fillStyle = sk.accent; g.beginPath(); g.moveTo(neck + 2, -1.2); g.lineTo(-A.crest, 0); g.lineTo(neck + 2, 1.2); g.fill(); },
      post(g) { for (const s of [-1, 1]) { g.fillStyle = '#1a120a'; g.beginPath(); g.arc(neck + hl * 0.12, s * 1.7, 0.9, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(neck + hl * 0.1, s * 1.5, 0.3, 0, TAU); g.fill(); } }
    });
    rig.bl = bl; rig.span = sp; rig.len = bl + hl + neck; rig.skin = sk;
    return rig;
  }

  /* ---------- Reptiles marins (vue du dessus) ---------- */
  function buildMarine(id, A, seed) {
    const sk = A.skin, rig = { id, plan: A.plan, parts: {} };
    const wet = Object.assign({}, sk);
    const water = [40, 100, 110];
    for (const k of ['base', 'belly', 'top', 'pcol']) if (sk[k]) wet[k] = U.css(U.mixRgb(U.rgb(sk[k]), water, 0.35));
    const build = (s, sd) => {
      const out = {};
      if (A.plan === 'plesio') {
        const bl = A.body, bw = A.bw;
        out.body = part([[-bl * 0.55, 0], [-bl * 0.35, -bw * 0.45], [bl * 0.2, -bw * 0.52], [bl * 0.5, -bw * 0.25], [bl * 0.55, 0], [bl * 0.5, bw * 0.25], [bl * 0.2, bw * 0.52], [-bl * 0.35, bw * 0.45]], s, sd, {});
        out.flipF = part([[0, -2], [bw * 0.3, -1], [bw * 0.9, 3], [bw * 0.85, 4.5], [0, 2.2]], s, sd + 1, { noBelly: true, scaleMul: 0.6 });
        out.flipB = part([[0, -1.6], [bw * 0.25, -0.8], [bw * 0.65, 2.5], [bw * 0.6, 3.6], [0, 1.8]], s, sd + 2, { noBelly: true, scaleMul: 0.6 });
        out.neck = [];
        const nl = A.neck / 3;
        for (let i = 0; i < 3; i++) out.neck.push(part(shapes.neckSeg(nl, 6 - i * 1.4, 4.6 - i * 1.4), s, sd + 3 + i, { scaleMul: 0.6, noOutline: true }));
        out.head = part([[-1.5, -2.2], [A.head * 0.6, -1.9], [A.head, -0.6], [A.head, 0.6], [A.head * 0.6, 1.9], [-1.5, 2.2]], s, sd + 7, { scaleMul: 0.5, post(g) { for (const k of [-1, 1]) { g.fillStyle = '#0d0905'; g.beginPath(); g.arc(A.head * 0.35, k * 1.5, 0.6, 0, TAU); g.fill(); } } });
        out.tail = part(shapes.tailSeg(10, 6, 0.8), s, sd + 8, { scaleMul: 0.6 });
      } else {
        const L = A.len, w = A.w;
        const segL = [A.head, L * 0.22, L * 0.2, L * 0.18, L * 0.16];
        out.segs = [];
        // tête avec mâchoires
        out.head = part([[-2, -w * 0.4], [A.head * 0.5, -w * 0.32], [A.head, -w * 0.08], [A.head + 1, 0], [A.head, w * 0.08], [A.head * 0.5, w * 0.32], [-2, w * 0.4]], s, sd, {
          scaleMul: 0.6,
          post(g) { for (const k of [-1, 1]) { g.fillStyle = '#0d0905'; g.beginPath(); g.ellipse(A.head * 0.3, k * w * 0.26, 1.2, 0.8, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(A.head * 0.28, k * w * 0.24, 0.35, 0, TAU); g.fill(); } g.strokeStyle = 'rgba(10,5,0,0.4)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(A.head * 0.1, 0); g.lineTo(A.head, 0); g.stroke(); }
        });
        let ww = w;
        for (let i = 1; i < segL.length; i++) {
          const w1 = ww * (i === segL.length - 1 ? 0.35 : 0.82);
          out.segs.push({ len: segL[i], sp: part(shapes.tailSeg(segL[i], ww, w1), s, sd + i, { scaleMul: 0.8, pscale: 1.4, noOutline: true }) });
          ww = w1;
        }
        out.fluke = part([[2, 0], [-6, -9], [-10, -10], [-7, -2], [-8, 0], [-7, 2], [-10, 10], [-6, 9]], s, sd + 9, { noScales: true });
        out.flipF = part([[0, -2], [w * 0.4, -1], [w * 0.9, 3.5], [w * 0.75, 4.5], [0, 2]], s, sd + 10, { noBelly: true, scaleMul: 0.6 });
        out.flipB = part([[0, -1.5], [w * 0.3, -0.8], [w * 0.65, 2.8], [w * 0.55, 3.6], [0, 1.5]], s, sd + 11, { noBelly: true, scaleMul: 0.6 });
        out.segL = segL;
      }
      return out;
    };
    rig.dry = build(sk, seed);
    rig.wet = build(wet, seed);
    rig.skin = sk;
    rig.len = A.plan === 'plesio' ? A.body + A.neck + A.head : A.len + A.head;
    return rig;
  }

  const rigs = {};
  R.dinoRig = function (id) {
    if (!rigs[id]) {
      const A = ART[id];
      const seed = 1000 + DZ.SPECIES_ORDER.indexOf(id) * 97;
      rigs[id] = A.plan === 'ptero' ? buildPtero(id, A, seed) : (A.plan === 'plesio' || A.plan === 'mosa') ? buildMarine(id, A, seed) : buildSide(id, A, seed);
    }
    return rigs[id];
  };
  R.clearDinos = function () { for (const k in rigs) delete rigs[k]; };

  /* ------------------------------------------------------------------
     Animation et dessin
     ------------------------------------------------------------------ */
  function dp(g, sp, x, y, ang) {
    if (ang) { g.save(); g.translate(x, y); g.rotate(ang); g.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); g.restore(); }
    else g.drawImage(sp.c, x - sp.ox, y - sp.oy, sp.w, sp.h);
  }

  /* Pose d'une patte : renvoie la position du pied (pour la poussière). */
  function drawLeg(g, leg, set, hx, hy, psi, moving, rest, amp, spread) {
    const swing = moving ? Math.sin(psi) * amp : (spread || 0);
    const lift = moving ? Math.max(0, Math.sin(psi + 1.4)) * amp * 1.3 : 0;
    let a = leg.a + swing;
    let s = leg.s - lift * (leg.front ? -0.6 : 1);
    if (rest) { a += leg.front ? 0.15 : 0.55; s -= leg.front ? 0.3 : 1.1; }
    const kx = hx + Math.sin(a) * leg.l1, ky = hy + Math.cos(a) * leg.l1;
    const ax = kx + Math.sin(a + s) * leg.l2, ay = ky + Math.cos(a + s) * leg.l2;
    dp(g, set.thigh, hx, hy, -a);
    dp(g, set.shin, kx, ky, -(a + s));
    dp(g, set.foot, ax, ay, moving ? -Math.max(0, Math.sin(psi + 1.4)) * 0.25 : 0);
    return [ax, ay];
  }

  /* Dessine un dinosaure terrestre. (x, y) = point au sol, en monde. */
  R.drawSideDino = function (g, rig, d, t, opt) {
    opt = opt || {};
    const moving = d.moving > 0;
    const phase = d.phase || 0;
    const state = d.state || 'idle';
    const seedT = t + (d.id || 0) * 3.1;
    const breathe = Math.sin(seedT * 1.7) * 0.6;
    const bobAmp = rig.quad ? 0.5 : 1.2;
    const bob = moving ? -Math.abs(Math.sin(phase)) * bobAmp : breathe * 0.3;
    const rest = state === 'rest';
    const restDrop = rest ? rig.hipH * 0.22 : 0;
    const legAmp = rig.quad ? 0.32 : 0.48;
    g.save();
    g.translate(opt.x, opt.y);
    g.scale((d.face || 1) * (opt.scale || 1), opt.scale || 1);
    const hx = 0, hy = -rig.hipH + bob + restDrop;
    const feet = [];
    // pattes éloignées
    for (const leg of rig.legs) {
      const off = rig.quad ? (leg.front ? 0 : Math.PI) : Math.PI;
      const at = leg.front ? leg.at : leg.at;
      feet.push(drawLeg(g, leg, leg.far, hx + at[0] + (rig.quad ? 2.5 : 1), hy + at[1], phase + off, moving, rest, legAmp, rig.quad ? 0.1 : 0.32));
    }
    if (rig.arm) dp(g, rig.arm.far, hx + rig.arm.at[0] - 1, hy + rig.arm.at[1], 0.2 + Math.sin(seedT * 1.3) * 0.08);
    // queue
    let tx = hx + rig.tailBase[0], ty = hy + rig.tailBase[1];
    let ang = rig.tailAng + (rest ? 0.1 : 0);
    const sway = moving ? 0.07 : 0.045;
    for (let i = 0; i < rig.tail.length; i++) {
      const seg = rig.tail[i];
      ang += Math.sin(seedT * (moving ? 2.4 : 1.1) - i * 0.8) * sway * (1 + i * 0.4) + (moving ? Math.sin(phase * 2) * 0.02 : 0);
      dp(g, seg.sp, tx, ty, ang);
      tx -= Math.cos(ang) * seg.len; ty -= Math.sin(ang) * seg.len;
    }
    // corps (respiration)
    g.save();
    g.translate(hx, hy);
    g.scale(1, 1 + Math.sin(seedT * 1.7) * 0.012);
    dp(g, rig.parts.body, 0, 0, moving ? Math.sin(phase * 2) * 0.012 : 0);
    g.restore();
    // cou et tête
    let na = rig.neckAng + Math.sin(seedT * 0.7) * 0.04;
    let hr = rig.headRel + Math.sin(seedT * 0.5 + 1) * 0.06;
    let jaw = 0;
    if (state === 'eat') {
      const k = Math.min(1, d.anim * 1.5);
      const browse = rig.id === 'brachiosaurus';
      na += (browse ? -0.2 : 0.7) * k; hr += (browse ? -0.3 : 0.35) * k;
      jaw = Math.max(0, Math.sin(d.anim * 9)) * 0.18 * k;
    } else if (state === 'roar') {
      const k = Math.sin(Math.min(1, d.anim / 1.8) * Math.PI);
      na -= 0.25 * k; hr -= 0.35 * k;
      jaw = 0.55 * k + Math.sin(d.anim * 30) * 0.03 * k;
    } else if (rest) { na += 0.35; hr += 0.15; }
    else if (!moving) { hr += Math.sin(seedT * 0.31) * 0.12; }
    let nx = hx + rig.shoulder[0], ny = hy + rig.shoulder[1];
    let a = na;
    for (let i = 0; i < rig.neck.length; i++) {
      const seg = rig.neck[i];
      if (i > 0) a += Math.sin(seedT * 0.9 - i) * 0.03 + (rig.neck.length > 1 ? 0.12 * Math.sign(rig.headRel) * (state === 'eat' && rig.id !== 'brachiosaurus' ? 1.5 : 0.4) : 0);
      dp(g, seg.sp, nx, ny, a);
      nx += Math.cos(a) * seg.len; ny += Math.sin(a) * seg.len;
    }
    const ha = a + hr;
    const H = rig.head;
    g.save();
    g.translate(nx, ny);
    g.rotate(ha);
    if (H.jaw) dp(g, H.jaw, H.hinge[0], H.hinge[1], jaw);
    dp(g, H.sp, 0, 0, 0);
    // clignement / yeux fermés au repos
    const blink = rest || ((seedT % 5.3) < 0.13);
    if (blink) {
      const e = H.eye;
      g.fillStyle = rig.skin.base;
      g.beginPath(); g.ellipse(e[0], e[1], e[2] * 1.5, e[2] * 1.25, 0, 0, TAU); g.fill();
      g.strokeStyle = U.shade(rig.skin.base, -0.6); g.lineWidth = e[2] * 0.35;
      g.beginPath(); g.moveTo(e[0] - e[2] * 1.2, e[1] + e[2] * 0.2); g.quadraticCurveTo(e[0], e[1] + e[2] * 0.8, e[0] + e[2] * 1.2, e[1] + e[2] * 0.2); g.stroke();
    }
    g.restore();
    // pattes proches
    for (const leg of rig.legs) {
      const off = rig.quad ? (leg.front ? Math.PI : 0) : 0;
      feet.push(drawLeg(g, leg, leg.near, hx + leg.at[0], hy + leg.at[1], phase + off, moving, rest, legAmp, rig.quad ? -0.05 : -0.12));
    }
    if (rig.arm) dp(g, rig.arm.near, hx + rig.arm.at[0], hy + rig.arm.at[1], 0.15 + Math.sin(seedT * 1.3 + 1) * 0.1 + (state === 'roar' ? 0.4 : 0));
    g.restore();
    return { headX: opt.x + nx * (d.face || 1) * (opt.scale || 1), headY: opt.y + ny * (opt.scale || 1) };
  };

  R.drawPtero = function (g, rig, d, t, x, y, alt) {
    const flap = d.phase ? Math.cos(d.phase) : 1;
    const span = 0.55 + 0.45 * Math.abs(flap);
    g.save();
    g.translate(x, y - alt);
    g.rotate(d.heading || 0);
    for (const s of [-1, 1]) {
      g.save(); g.scale(1, s * span); dp(g, rig.wing, 0, 0, 0); g.restore();
    }
    dp(g, rig.body, 0, 0, 0);
    dp(g, rig.head, rig.bl * 0.45, 0, Math.sin(t * 0.8 + d.id) * 0.25);
    g.restore();
  };

  R.drawMarine = function (g, rig, d, t, x, y, which, alpha) {
    const P = rig[which];
    g.save();
    g.globalAlpha *= alpha;
    g.translate(x, y);
    g.rotate(d.heading || 0);
    const ph = d.phase || 0;
    if (rig.plan === 'plesio') {
      const fa = Math.sin(ph * 1.2) * 0.5;
      for (const s of [-1, 1]) {
        g.save(); g.scale(1, s); dp(g, P.flipF, 4, 4, 0.4 + fa); dp(g, P.flipB, -8, 4, 0.6 + fa * 0.8); g.restore();
      }
      dp(g, P.tail, -12, 0, Math.sin(ph) * 0.2);
      dp(g, P.body, 0, 0, 0);
      let nx = 12, ny = 0, a = 0;
      for (let i = 0; i < P.neck.length; i++) {
        a += Math.sin(ph * 0.8 - i * 0.9) * 0.22;
        dp(g, P.neck[i], nx, ny, a);
        nx += Math.cos(a) * 10; ny += Math.sin(a) * 10;
      }
      dp(g, P.head, nx, ny, a + Math.sin(ph) * 0.2);
    } else {
      // ondulation latérale du corps
      let x0 = 0, y0 = 0, a = 0;
      const pts = [];
      for (let i = 0; i < P.segs.length; i++) {
        a = Math.sin(ph * 1.3 - i * 0.9) * 0.16 * (i + 1) * 0.5;
        pts.push([x0, y0, a]);
        x0 -= Math.cos(a) * P.segs[i].len; y0 -= Math.sin(a) * P.segs[i].len;
      }
      const fa = Math.sin(ph * 1.3) * 0.3;
      for (const s of [-1, 1]) { g.save(); g.scale(1, s); dp(g, P.flipF, -4, 5, 0.7 + fa); dp(g, P.flipB, -P.segs[0].len - 6, 4, 0.8 + fa); g.restore(); }
      dp(g, P.fluke, x0, y0, a);
      for (let i = P.segs.length - 1; i >= 0; i--) dp(g, P.segs[i].sp, pts[i][0], pts[i][1], pts[i][2]);
      dp(g, P.head, 0, 0, Math.sin(ph * 1.3 + 0.9) * 0.1);
    }
    g.restore();
  };

  /* Vignette pour le catalogue : rendu hors écran puis cadrage automatique. */
  R.dinoThumb = function (id, w, h) {
    const rig = R.dinoRig(id);
    const A = ART[id];
    const fake = { id: 1, face: 1, phase: 0, moving: 0, state: 'idle', heading: 0, anim: 0 };
    const S = 2, CW = 420, CH = 300;
    const tmp = R.canvas(CW * S, CH * S), tg = tmp.getContext('2d');
    tg.scale(S, S);
    if (A.plan === 'ptero') { tg.translate(CW / 2, CH / 2); tg.rotate(-Math.PI / 2 + 0.35); R.drawPtero(tg, rig, fake, 0, 0, 0, 0); }
    else if (A.plan === 'plesio' || A.plan === 'mosa') { tg.translate(CW / 2 + 30, CH / 2); tg.rotate(-0.12); R.drawMarine(tg, rig, fake, 0, 0, 0, 'dry', 1); }
    else R.drawSideDino(tg, rig, fake, 1.3, { x: CW / 2, y: CH - 20 });
    // boîte englobante des pixels visibles
    const data = tg.getImageData(0, 0, tmp.width, tmp.height).data;
    let x0 = tmp.width, y0 = tmp.height, x1 = 0, y1 = 0;
    for (let y = 0; y < tmp.height; y += 2) for (let x = 0; x < tmp.width; x += 2) {
      if (data[(y * tmp.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const c = R.canvas(w * 2, h * 2), g = c.getContext('2d');
    if (x1 <= x0) return c;
    const bw = x1 - x0 + 4, bh = y1 - y0 + 4;
    const k = Math.min((w * 2 - 12) / bw, (h * 2 - 12) / bh);
    const dw = bw * k, dh = bh * k;
    g.imageSmoothingQuality = 'high';
    // ombre au sol
    if (A.plan !== 'ptero' && A.plan !== 'plesio' && A.plan !== 'mosa') {
      const gr = g.createRadialGradient(w, h * 2 - 8, 0, w, h * 2 - 8, dw * 0.45);
      gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.save(); g.translate(0, h * 2 - 8); g.scale(1, 0.18); g.translate(0, -(h * 2 - 8)); g.fillRect(0, 0, w * 2, h * 4); g.restore();
    }
    g.drawImage(tmp, x0 - 2, y0 - 2, bw, bh, (w * 2 - dw) / 2, A.plan === 'ptero' || A.plan === 'plesio' || A.plan === 'mosa' ? (h * 2 - dh) / 2 : h * 2 - dh - 6, dw, dh);
    return c;
  };
})();
