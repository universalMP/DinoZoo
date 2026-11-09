/* =====================================================================
   DinoZoo 3D — Dinosaures articulés.
   Chaque espèce reprend les proportions et couleurs définies dans
   DZ.DINO_ART (render/dinoart.js) et les traduit en pièces 3D : corps,
   segments de cou et de queue, tête, mâchoire, cuisses, jambes, pieds,
   bras, et attributs (plaques, cornes, collerette, voile, massue…).
   Les pièces sont des « lofts » à peau motivée (rayures, taches,
   marbrures) ; le shader ajoute les écailles.
   ===================================================================== */
(function () {
  const G = DZ.G, U = DZ.util;
  const MB = G.MB;
  const TAU = Math.PI * 2;
  const K = 1 / 40; // pixels du dessin 2D → unités 3D

  const c01 = (hex) => G.rgb01(hex);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  /* Fonction de couleur de peau : dos sombre, flancs, ventre clair, motif. */
  function skinFn(skin, seed, opts) {
    opts = opts || {};
    const top = c01(skin.top), base = c01(skin.base), belly = c01(skin.belly), pc = c01(skin.pcol || skin.top);
    const pat = opts.pattern === undefined ? skin.pattern : opts.pattern;
    const palpha = skin.palpha || 0.55;
    const freq = opts.freq || 1;
    return (t, a, ca, sa, S) => {
      const x = S.p[0] / K, y = S.p[1] / K;
      let c = ca > 0 ? mix(base, top, Math.pow(ca, 1.4)) : mix(base, belly, Math.pow(-ca, 0.8) * (opts.noBelly ? 0.25 : 1));
      if (ca > -0.35) {
        let p = 0;
        if (pat === 'stripes') p = Math.sin(x * 0.55 * freq + y * 0.15 + U.hash(Math.round(x / 6), 1, seed) * 2) > 0.45 ? 1 : 0;
        else if (pat === 'bands') p = Math.sin(x * 0.32 * freq) > 0.55 ? 1 : 0;
        else if (pat === 'spots') p = U.hash(Math.round(x * 0.45 * freq), Math.round(a * 3.2), seed) > 0.72 ? 1 : 0;
        else if (pat === 'mottle') p = U.hash(Math.round(x * 0.3 * freq), Math.round(a * 2.2), seed) > 0.6 ? 0.55 : 0;
        if (p) c = mix(c, pc, p * palpha * U.clamp((ca + 0.35) * 1.6, 0, 1));
      }
      const v = 0.95 + U.hash(Math.round(x * 2), Math.round(a * 5), seed + 3) * 0.1;
      return [c[0] * v, c[1] * v, c[2] * v];
    };
  }

  /* Profil en stations : xs (×L), demi-hauteur ry (×H), décalage cy (×H). */
  function profile(L, H, xs, rys, cys, wz, tilt, extra) {
    const st = [];
    for (let i = 0; i < xs.length; i++) {
      let x = xs[i] * L, y = cys[i] * H;
      if (tilt) { const c = Math.cos(tilt), s = Math.sin(tilt); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
      const ry = rys[i] * H;
      st.push({ p: [x * K, y * K, 0], ry: ry * K, rz: ry * wz * K * (extra ? extra[i] || 1 : 1), belly: 1.0 });
    }
    return st;
  }

  function tapered(len, w0, w1, n, dir, opts) {
    opts = opts || {};
    const st = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = U.lerp(w0, w1, Math.pow(t, opts.pow || 1)) / 2;
      const bulge = opts.bulge ? Math.sin(t * Math.PI) * opts.bulge : 0;
      const ext = opts.over || 0;
      st.push({ p: [dir * (t * (len + ext) - ext * 0.5) * K, (opts.up ? opts.up * Math.sin(t * Math.PI) : 0) * K, 0], ry: (w + bulge) * K * (opts.ry || 1), rz: (w + bulge) * K * (opts.rz || 0.8) });
    }
    return st;
  }

  function teeth(mb, x0, x1, y, zr, n, size, down) {
    mb.material('plain').col('#efe6cc');
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const x = U.lerp(x0, x1, (i + 0.5) / n);
      const z = s * zr(x);
      mb.push().t(x, y, z).rz(down ? Math.PI : 0).cone(size * 0.35, size, 4).pop();
    }
  }

  function eye(mb, x, y, z, r, skin) {
    for (const s of [-1, 1]) {
      mb.push().t(x, y, s * z);
      mb.material('skin').col(c01(skin.top)).sphere(r * 1.45, r * 1.15, r * 0.8, 8, 5);
      mb.material('eye').col(c01(skin.eye || '#d4a02a')).push().t(0, 0, s * r * 0.45).sphere(r, r, r * 0.7, 8, 6).pop();
      mb.material('eye').col('#0c0805').push().t(r * 0.05, 0, s * r * 0.98).sphere(r * 0.3, r * 0.75, r * 0.15, 6, 4).pop();
      mb.material('skin').col(c01(skin.top)).push().t(0, r * 0.95, s * r * 0.3).sphere(r * 1.5, r * 0.45, r * 0.75, 8, 4).pop();
      mb.pop();
    }
  }

  /* ------------------------------------------------------------------
     Pantin vue de profil → 3D
     ------------------------------------------------------------------ */
  function buildLand(id, A) {
    const skin = A.skin, seed = 1000 + DZ.SPECIES_ORDER.indexOf(id) * 97;
    const quad = A.plan === 'quad';
    const L = A.L, H = A.H;
    const wz = quad ? 0.95 : 0.72;
    const tilt = -(A.tilt || 0);
    const colBody = skinFn(skin, seed);
    const rig = { id, quad, parts: {}, skin };
    const rot = (p) => tilt ? [p[0] * Math.cos(tilt) - p[1] * Math.sin(tilt), p[0] * Math.sin(tilt) + p[1] * Math.cos(tilt)] : p;

    /* --- corps --- */
    const body = new MB();
    let st;
    if (quad) {
      const hump = A.hump || 0;
      st = profile(L, H, [-0.44, -0.32, -0.15, 0.05, 0.3, 0.55, 0.78, 0.95, 1.06], [0.17, 0.36, 0.48, 0.55 + hump * 0.2, 0.55 + hump * 0.12, 0.52, 0.45, 0.35, 0.2], [0.0, 0.02, 0.03 + hump * 0.1, 0.03 + hump * 0.18, 0.02 + hump * 0.1, 0.01, -0.02, -0.04, -0.06], wz, tilt);
    } else {
      st = profile(L, H, [-0.62, -0.42, -0.18, 0.08, 0.35, 0.6, 0.82, 0.98, 1.1], [0.14, 0.32, 0.44, 0.5, 0.5, 0.46, 0.38, 0.28, 0.14], [0.02, 0.0, -0.02, -0.02, 0.0, 0.0, 0.0, 0.02, 0.04], wz, tilt);
    }
    body.material('skin').loft(st, 16, { colFn: colBody });
    const topY = (xf) => { // hauteur du dos à une fraction x (×L)
      let best = st[0];
      for (const s of st) if (Math.abs(s.p[0] / K - xf * L) < Math.abs(best.p[0] / K - xf * L)) best = s;
      return { y: best.p[1] + best.ry, w: best.rz };
    };
    if (A.sail) {
      body.material('skin');
      const sail = [];
      const n = 12;
      for (let i = 0; i <= n; i++) { const f = U.lerp(-0.4, 0.8, i / n); const tp = topY(f); sail.push([f * L * K, tp.y - 0.02]); }
      for (let i = n; i >= 0; i--) { const f = U.lerp(-0.4, 0.8, i / n); const tp = topY(f); sail.push([f * L * K, tp.y + Math.pow(Math.sin(Math.PI * (i / n) * 0.95 + 0.08), 0.8) * H * 1.0 * K]); }
      body.col(c01(skin.accent)).plate(sail, 0.012, c01(skin.acc2));
      body.material('plain').col(c01(skin.acc2));
      for (let i = 0; i <= n; i += 1) { const f = U.lerp(-0.4, 0.8, i / n); const tp = topY(f); const h = Math.pow(Math.sin(Math.PI * (i / n) * 0.95 + 0.08), 0.8) * H * K; body.push().t(f * L * K, tp.y, 0).cyl(0.006, 0.003, h, 4, false).pop(); }
    }
    if (A.plates) {
      const n = 7;
      for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
        const f = U.lerp(-0.3, 0.8, (i + row * 0.5) / n);
        const tp = topY(f);
        const ph = H * (0.22 + 0.42 * Math.sin(Math.PI * U.clamp((i + row * 0.5) / n * 1.05, 0, 1))) * K;
        const pw = ph * 0.55;
        body.push().t(f * L * K, tp.y - 0.01, (row ? 1 : -1) * 0.03).rx((row ? 1 : -1) * 0.16);
        body.material('plain').col(row ? c01(skin.accent) : mix(c01(skin.accent), [0, 0, 0], 0.15));
        body.plate([[-pw * 0.5, 0], [-pw * 0.3, ph * 0.8], [pw * 0.1, ph * 1.15], [pw * 0.45, ph * 0.6], [pw * 0.5, 0]], 0.012, c01(skin.acc2));
        body.pop();
      }
    }
    if (A.armor) {
      body.material('plain');
      const r = U.rng(seed + 5);
      for (let row = 0; row < 4; row++) for (let i = 0; i < 10; i++) {
        const f = U.lerp(-0.3, 0.95, (i + (row % 2) * 0.5) / 10);
        const tp = topY(f);
        const ang = (row - 1.5) * 0.45;
        const rr = H * (0.09 - Math.abs(row - 1.5) * 0.01) * K;
        body.col(mix(c01(skin.accent), [0, 0, 0], r() * 0.2));
        body.push().t(f * L * K, tp.y - tp.w * (1 - Math.cos(ang)) * 0.9 - 0.004, Math.sin(ang) * tp.w * 0.95).rx(-ang).sphere(rr * 1.2, rr * 0.7, rr, 6, 4).pop();
      }
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
        const f = U.lerp(-0.25, 0.9, i / 5);
        const tp = topY(f);
        body.col(c01(skin.accent)).push().t(f * L * K, tp.y - tp.w * 0.9, s * tp.w * 0.95).rx(s * -1.3).cone(0.018, H * 0.22 * K, 5).pop();
      }
    }
    if (A.bumps || A.feathers) {
      const r = U.rng(seed + 9);
      for (let i = 0; i < (A.feathers ? 24 : 30); i++) {
        const f = U.lerp(-0.5, 0.95, r());
        const tp = topY(f);
        const ang = (r() - 0.5) * 1.6;
        if (A.feathers) {
          body.material('cloth').col(mix(c01(skin.accent), c01(skin.top), r() * 0.5));
          body.push().t(f * L * K, tp.y - tp.w * (1 - Math.cos(ang)), Math.sin(ang) * tp.w).rz(2.4).rx(-ang).box(0.006, 0.06, 0.012).pop();
        } else {
          body.material('skin').col(mix(c01(skin.top), [0, 0, 0], 0.2));
          body.push().t(f * L * K, tp.y - tp.w * (1 - Math.cos(ang)) * 0.9, Math.sin(ang) * tp.w).sphere(0.008, 0.006, 0.008, 5, 3).pop();
        }
      }
    }
    rig.parts.body = body.finish();

    /* --- attaches --- */
    rig.shoulder = rot(quad ? [0.92 * L, 0.12 * H] : [0.94 * L, 0.14 * H]).map((v) => v * K);
    rig.tailBase = rot(quad ? [-0.36 * L, 0.06 * H] : [-0.5 * L, 0.04 * H]).map((v) => v * K);

    /* --- pattes --- */
    const footH = quad ? H * 0.08 : A.leg * 0.06;
    const legGeom = (total, front) => ({ a: quad ? (front ? -0.04 : 0.1) : 0.34, s: quad ? (front ? 0.08 : -0.18) : -0.72, l1: total * (quad ? 0.5 : 0.47), l2: total * (quad ? 0.46 : 0.62) });
    const reach = (lg) => lg.l1 * Math.cos(lg.a) + lg.l2 * Math.cos(lg.a + lg.s) + footH;
    const back = legGeom(quad ? A.legB : A.leg, false);
    rig.hipH = reach(back) * K;
    const thighW = quad ? H * 0.46 : H * 0.62, shinW = quad ? H * 0.3 : H * 0.22;
    const mkLeg = (lg, tw, sw, front) => {
      const thigh = new MB(), shin = new MB(), foot = new MB();
      const cf = skinFn(skin, seed + 1, { noBelly: true, pattern: 'none' });
      const down = (len, w0, w1, n, bulge) => {
        const s = [];
        for (let i = 0; i <= n; i++) { const t = i / n; const w = U.lerp(w0, w1, t) / 2 + (bulge ? Math.sin(t * Math.PI) * bulge : 0); s.push({ p: [0, (-t * len + (i === 0 ? w0 * 0.25 : 0)) * K, 0], ry: w * K, rz: w * K * 0.85 }); }
        return s;
      };
      thigh.material('skin').loft(down(lg.l1, tw, tw * (quad ? 0.7 : 0.45), 5, quad ? 0 : tw * 0.08), 10, { colFn: cf });
      shin.material('skin').loft(down(lg.l2, sw * 1.1, sw * (quad ? 1 : 0.7), 5), 8, { colFn: cf });
      if (quad) {
        foot.material('skin').col(c01(skin.base)).push().t(0, -footH * 1.1 * K, 0).cyl(sw * 0.62 * K, sw * 0.55 * K, footH * 1.3 * K, 10, 'both').pop();
        foot.material('plain').col('#d8ccb0');
        for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.5; foot.push().t(Math.cos(a) * sw * 0.6 * K, -footH * 1.05 * K, Math.sin(a) * sw * 0.6 * K).sphere(sw * 0.1 * K, footH * 0.35 * K, sw * 0.1 * K, 5, 3).pop(); }
      } else {
        const fl = A.leg * 0.3;
        foot.material('skin').loft([{ p: [-footH * 0.6 * K, -footH * 0.2 * K, 0], ry: footH * 0.7 * K, rz: footH * 0.8 * K }, { p: [fl * 0.5 * K, -footH * 0.55 * K, 0], ry: footH * 0.5 * K, rz: footH * 0.9 * K }, { p: [fl * K, -footH * 0.8 * K, 0], ry: footH * 0.25 * K, rz: footH * 0.6 * K }], 8, { colFn: cf });
        foot.material('plain').col('#2a2018');
        for (const z of [-0.6, 0, 0.6]) foot.push().t(fl * K, -footH * 0.85 * K, z * footH * K).rz(-1.2).cone(footH * 0.18 * K, fl * 0.22 * K, 4).pop();
        if (A.sickle) foot.push().t(fl * 0.2 * K, -footH * 0.2 * K, footH * 0.5 * K).rz(-0.3).cone(footH * 0.18 * K, fl * 0.35 * K, 4).pop();
      }
      return Object.assign({ thigh: thigh.finish(), shin: shin.finish(), foot: foot.finish(), front }, { a: lg.a, s: lg.s, l1: lg.l1 * K, l2: lg.l2 * K });
    };
    const legs = [];
    const hipAt = quad ? [0, -0.12 * H * K] : [0, -0.08 * H * K];
    const backLeg = mkLeg(back, thighW, shinW, false);
    const bw = topY(0).w;
    legs.push(Object.assign({}, backLeg, { at: hipAt, side: bw * 0.72 }));
    if (quad) {
      const fat = rot([0.82 * L, -0.18 * H]).map((v) => v * K);
      const need = rig.hipH - (-fat[1]) - footH * K;
      const unit = legGeom(1, true);
      const per = need / K / (0.5 * Math.cos(unit.a) + 0.46 * Math.cos(unit.a + unit.s));
      const frontLeg = mkLeg(legGeom(per, true), H * 0.36, H * 0.26, true);
      legs.push(Object.assign({}, frontLeg, { at: fat, side: topY(0.82).w * 0.72 }));
    }
    rig.legs = legs;

    /* --- bras --- */
    if (!quad && A.arm) {
      const al = A.arm, aw = Math.max(1.4, H * (A.tiny ? 0.09 : 0.12));
      const arm = new MB();
      arm.material('skin').loft([{ p: [0, 0, 0], ry: aw * 0.55 * K, rz: aw * 0.5 * K }, { p: [al * 0.45 * K, -al * 0.4 * K, 0], ry: aw * 0.38 * K, rz: aw * 0.35 * K }, { p: [al * 0.7 * K, -al * 0.62 * K, 0], ry: aw * 0.25 * K, rz: aw * 0.25 * K }], 7, { colFn: skinFn(skin, seed + 2, { noBelly: true, pattern: 'none' }) });
      arm.material('plain').col('#2a2018').push().t(al * 0.72 * K, -al * 0.66 * K, 0).rz(-2.2).cone(aw * 0.12 * K, al * 0.16 * K, 4).pop();
      if (A.feathers) { arm.material('cloth').col(c01(skin.acc2)); for (let i = 0; i < 6; i++) arm.push().t(al * (0.1 + i * 0.1) * K, -al * (0.1 + i * 0.09) * K, 0).rz(-2.6).box(0.005, al * 0.4 * K, 0.01).pop(); }
      rig.arm = { mesh: arm.finish(), at: [0.82 * L * K, -0.18 * H * K], side: topY(0.82).w * 0.8 };
    }

    /* --- queue --- */
    const segs = A.tailSegs || 3;
    rig.tail = [];
    let w0 = A.tail[1];
    for (let i = 0; i < segs; i++) {
      const frac = A.whip ? [0.22, 0.24, 0.26, 0.28][i] || 0.25 : [0.4, 0.33, 0.27][i] || 0.3;
      const len = A.tail[0] * frac * (A.whip ? 1.6 : 1);
      const w1 = i === segs - 1 ? Math.max(0.6, A.tail[1] * 0.08) : w0 * (A.whip ? 0.55 : 0.62);
      const mb = new MB();
      const stt = tapered(len, w0, w1, 6, -1, { over: w0 * 0.35, rz: wz * 0.95, ry: A.paddle ? 1.6 : 1 });
      mb.material('skin').loft(stt, 12, { colFn: colBody });
      const tipX = -len * K;
      if (A.plates && i === 0) for (let k = 0; k < 3; k++) { const x = -len * (0.2 + k * 0.3) * K, h = w0 * (0.9 - k * 0.25) * K; mb.material('plain').col(c01(skin.accent)).push().t(x, w0 * 0.35 * K, 0).plate([[-h * 0.4, 0], [0, h], [h * 0.4, 0]], 0.01).pop(); }
      if (A.plates && i === segs - 1) { mb.material('plain').col('#d8ccb0'); for (let k = 0; k < 2; k++) for (const s of [-1, 1]) mb.push().t(-len * (0.3 + k * 0.35) * K, w0 * 0.2 * K, s * w0 * 0.2 * K).rx(s * 0.9).rz(0.5).cone(0.01, 0.14, 5).pop(); }
      if (A.club && i === segs - 1) mb.material('skin').col(c01(skin.accent)).push().t(tipX - 0.02, 0, 0).sphere(0.07, 0.05, 0.08, 10, 6).pop();
      if (A.feathers) { mb.material('cloth').col(c01(skin.accent)); for (let k = 0; k < 6; k++) mb.push().t(-len * k / 6 * K, w0 * 0.3 * K * (1 - k / 7), 0).rz(2.6 - k * 0.1).box(0.005, (0.04 + i * 0.02), 0.012).pop(); }
      if (A.armor && i < segs - 1) { mb.material('plain').col(c01(skin.accent)); for (let k = 0; k < 3; k++) for (const s of [-1, 1]) mb.push().t(-len * (0.25 + k * 0.3) * K, 0, s * w0 * 0.4 * K).rx(s * -1.4).cone(0.012, 0.07, 4).pop(); }
      rig.tail.push({ mesh: mb.finish(), len: len * K });
      w0 = w1;
    }

    /* --- cou --- */
    const nsegs = A.neckSegs || 1;
    rig.neck = [];
    let nw0 = A.neck[1];
    for (let i = 0; i < nsegs; i++) {
      const len = A.neck[0];
      const nw1 = i === nsegs - 1 ? A.neck[2] : U.lerp(A.neck[1], A.neck[2], (i + 1) / nsegs);
      const mb = new MB();
      mb.material('skin').loft(tapered(len, nw0, nw1, 5, 1, { over: nw0 * 0.6, rz: 0.82 }), 12, { colFn: colBody });
      if (A.feathers) { mb.material('cloth').col(c01(skin.accent)); for (let k = 0; k < 5; k++) mb.push().t(len * k / 5 * K, nw0 * 0.4 * K, 0).rz(2.2).box(0.005, 0.035, 0.01).pop(); }
      rig.neck.push({ mesh: mb.finish(), len: len * K });
      nw0 = nw1;
    }

    /* --- tête --- */
    const [htype, hl0, hh0] = A.head;
    const hl = hl0 * K, hh = hh0 * K;
    const head = new MB(), jaw = new MB();
    const hshape = {
      thero: { xs: [-0.1, 0.1, 0.35, 0.6, 0.85, 1.02], ry: [0.42, 0.52, 0.48, 0.36, 0.26, 0.12], cy: [0.0, 0.06, 0.08, 0.02, -0.04, -0.06], rz: [0.85, 0.8, 0.62, 0.48, 0.38, 0.3] },
      trex: { xs: [-0.12, 0.08, 0.32, 0.58, 0.84, 1.02], ry: [0.5, 0.6, 0.55, 0.42, 0.3, 0.14], cy: [0.0, 0.06, 0.08, 0.02, -0.03, -0.06], rz: [0.95, 0.9, 0.72, 0.52, 0.4, 0.32] },
      croc: { xs: [-0.08, 0.12, 0.3, 0.55, 0.85, 1.05], ry: [0.42, 0.5, 0.34, 0.2, 0.17, 0.12], cy: [0.0, 0.08, 0.04, -0.04, -0.05, -0.04], rz: [0.75, 0.7, 0.45, 0.32, 0.3, 0.32] },
      beak: { xs: [-0.1, 0.12, 0.38, 0.65, 0.88, 1.04], ry: [0.42, 0.52, 0.46, 0.34, 0.24, 0.1], cy: [0.0, 0.06, 0.06, 0.0, -0.06, -0.08], rz: [0.8, 0.78, 0.62, 0.46, 0.34, 0.22] },
      parrot: { xs: [-0.1, 0.15, 0.45, 0.72, 0.92, 1.02], ry: [0.46, 0.58, 0.55, 0.45, 0.3, 0.1], cy: [0.0, 0.08, 0.08, 0.0, -0.12, -0.25], rz: [0.85, 0.85, 0.7, 0.5, 0.35, 0.2] },
      sauro: { xs: [-0.1, 0.15, 0.4, 0.68, 0.9, 1.03], ry: [0.42, 0.5 + (A.head[3] || 0) * 0.4, 0.48 + (A.head[3] || 0) * 0.3, 0.3, 0.24, 0.12], cy: [0.0, 0.06 + (A.head[3] || 0) * 0.3, 0.06 + (A.head[3] || 0) * 0.2, 0.0, -0.04, -0.06], rz: [0.8, 0.8, 0.7, 0.55, 0.5, 0.4] }
    }[htype];
    const hst = hshape.xs.map((x, i) => ({ p: [x * hl, hshape.cy[i] * hh, 0], ry: hshape.ry[i] * hh, rz: hshape.ry[i] * hh * hshape.rz[i] }));
    head.material('skin').loft(hst, 14, { colFn: skinFn(skin, seed + 4, { freq: 1.6 }) });
    const zAt = (x) => { // demi-largeur du crâne à x
      for (let i = 0; i < hst.length - 1; i++) if (x >= hst[i].p[0] && x <= hst[i + 1].p[0]) { const t = (x - hst[i].p[0]) / (hst[i + 1].p[0] - hst[i].p[0]); return U.lerp(hst[i].rz, hst[i + 1].rz, t); }
      return hst[hst.length - 1].rz;
    };
    const carn = htype === 'thero' || htype === 'trex' || htype === 'croc';
    if (carn) teeth(head, 0.3 * hl, 0.95 * hl, -0.12 * hh, (x) => zAt(x) * 0.85, htype === 'croc' ? 9 : 6, hh * 0.13, true);
    if (htype === 'beak' || htype === 'parrot') head.material('plain').col('#4a3c28').push().t(0.92 * hl, -0.1 * hh, 0).sphere(hl * 0.13, hh * 0.18, zAt(0.9 * hl) * 0.9, 8, 5).pop();
    // narines
    head.material('plain').col('#20140c');
    for (const s of [-1, 1]) head.push().t(0.92 * hl, 0.05 * hh, s * zAt(0.92 * hl) * 0.8).sphere(hh * 0.04, hh * 0.03, hh * 0.03, 5, 3).pop();
    const ey = htype === 'trex' ? [0.22, 0.32] : htype === 'croc' ? [0.2, 0.3] : [0.3, 0.26];
    const eyeR = hh * (A.head[3] && A.head[3].eye ? A.head[3].eye : 0.1) * 1.1;
    eye(head, ey[0] * hl, ey[1] * hh, zAt(ey[0] * hl) * 0.82, Math.max(eyeR, 0.006), skin);
    // attributs
    if (A.trike) {
      head.push().t(-0.05 * hl, 0.3 * hh, 0).rz(0.55).ry(Math.PI / 2);
      const fr = [];
      for (let i = 0; i <= 14; i++) { const a = Math.PI * (i / 14); fr.push([Math.cos(a) * hh * 1.1, Math.sin(a) * hh * 1.25 - hh * 0.35]); }
      head.material('skin').col(mix(c01(skin.base), c01(skin.accent), 0.5)).plate(fr, 0.02, c01(skin.accent));
      head.material('plain').col(c01(skin.acc2));
      for (let i = 1; i < 14; i += 2) { const a = Math.PI * (i / 14); head.push().t(Math.cos(a) * hh * 1.12, Math.sin(a) * hh * 1.27 - hh * 0.35, 0).sphere(hh * 0.07, hh * 0.07, 0.015, 5, 3).pop(); }
      head.pop();
      head.material('plain').col('#e8dcc0');
      for (const s of [-1, 1]) head.push().t(0.38 * hl, 0.45 * hh, s * zAt(0.38 * hl) * 0.6).rz(-0.75).rx(s * -0.15).cone(hh * 0.09, hl * 0.62, 6).pop();
      head.push().t(0.82 * hl, 0.22 * hh, 0).rz(-0.35).cone(hh * 0.08, hl * 0.18, 6).pop();
    }
    if (A.dome) head.material('skin').col(c01(skin.accent)).push().t(0.22 * hl, 0.35 * hh, 0).sphere(hl * 0.42, hh * 0.45, zAt(0.22 * hl) * 1.05, 12, 7).pop();
    if (A.crestTube) head.material('skin').loft([{ p: [0.3 * hl, 0.4 * hh, 0], ry: hh * 0.14, rz: hh * 0.12 }, { p: [-0.4 * hl, 1.1 * hh, 0], ry: hh * 0.13, rz: hh * 0.11 }, { p: [-1.35 * hl, 1.5 * hh, 0], ry: hh * 0.11, rz: hh * 0.1 }], 8, { colFn: () => c01(skin.accent) });
    if (A.crests) for (const s of [-1, 1]) head.material('plain').col(c01(skin.accent)).push().t(0, 0.4 * hh, s * zAt(0.4 * hl) * 0.5).plate([[0.1 * hl, 0], [0.35 * hl, 0.85 * hh], [0.82 * hl, 0]], 0.006, c01(skin.acc2)).pop();
    if (A.alloHorns) for (const s of [-1, 1]) head.material('plain').col(c01(skin.accent)).push().t(0.3 * hl, 0.48 * hh, s * zAt(0.3 * hl) * 0.6).cone(hh * 0.06, hh * 0.3, 5).pop();
    if (A.carnoHorns) for (const s of [-1, 1]) head.material('plain').col('#4a3a2e').push().t(0.15 * hl, 0.45 * hh, s * zAt(0.15 * hl) * 0.7).rx(s * -0.9).cone(hh * 0.08, hh * 0.45, 5).pop();
    if (A.club) for (const s of [-1, 1]) head.material('plain').col(c01(skin.accent)).push().t(-0.05 * hl, 0.1 * hh, s * zAt(0) * 0.9).rx(s * -1.5).rz(0.5).cone(hh * 0.07, hh * 0.25, 4).pop();
    // mâchoire
    const hinge = [0.02 * hl, -0.14 * hh];
    const jx = [-0.04, 0.3, 0.6, 0.88];
    const jst = jx.map((x, i) => ({ p: [x * hl, -[0.06, 0.1, 0.1, 0.06][i] * hh, 0], ry: [0.2, 0.17, 0.13, 0.08][i] * hh * (htype === 'trex' ? 1.3 : 1), rz: zAt(x * hl) * 0.82 }));
    jaw.material('skin').loft(jst, 10, { colFn: skinFn(skin, seed + 6, { pattern: 'none' }) });
    jaw.material('plain').col('#7a3a32').push().t(0.45 * hl, -0.015 * hh, 0).sphere(0.35 * hl, 0.03 * hh, zAt(0.45 * hl) * 0.6, 6, 3).pop();
    if (carn) teeth(jaw, 0.3 * hl, 0.85 * hl, -0.02 * hh, (x) => zAt(x) * 0.72, htype === 'croc' ? 8 : 5, hh * 0.1, false);
    rig.head = { mesh: head.finish(), jaw: jaw.finish(), hinge, eye: [ey[0] * hl, ey[1] * hh, zAt(ey[0] * hl) * 0.82, Math.max(eyeR, 0.006)] };
    rig.neckAng = -A.neckAng; rig.headRel = -A.headRel; rig.tailAng = -A.tailAng;
    rig.len = ((quad ? 1.48 : 1.66) * L + A.tail[0] * (A.whip ? 1.6 : 1) + A.neck[0] * nsegs * 0.7 + hl0 * 0.6) * K;
    rig.height = rig.hipH + H * 0.6 * K + (A.neckAng < -0.9 ? A.neck[0] * nsegs * 0.8 * K : 0);
    return rig;
  }

  /* ---------- Reptiles volants ---------- */
  function buildPtero(id, A) {
    const sk = A.skin, seed = 1000 + DZ.SPECIES_ORDER.indexOf(id) * 97;
    const bl = A.body * K, sp = A.span * K, hl = A.head * K, nl = (A.neck || 0) * K;
    const body = new MB();
    body.material('skin').loft([{ p: [-bl * 0.6, 0, 0], ry: bl * 0.08, rz: bl * 0.08 }, { p: [-bl * 0.2, 0, 0], ry: bl * 0.2, rz: bl * 0.2 }, { p: [bl * 0.3, 0.01, 0], ry: bl * 0.22, rz: bl * 0.22 }, { p: [bl * 0.55, 0.01, 0], ry: bl * 0.12, rz: bl * 0.12 }], 10, { colFn: skinFn(sk, seed) });
    const head = new MB();
    head.material('skin').loft([{ p: [0, 0, 0], ry: bl * 0.08, rz: bl * 0.08 }, { p: [nl * 0.9, 0.01, 0], ry: bl * 0.07, rz: bl * 0.07 }, { p: [nl + hl * 0.15, 0.02, 0], ry: bl * 0.11, rz: bl * 0.09 }, { p: [nl + hl * 0.5, 0, 0], ry: bl * 0.06, rz: bl * 0.05 }, { p: [nl + hl, -0.01, 0], ry: 0.002, rz: 0.002 }], 8, { colFn: (t) => t > 0.55 ? c01(sk.beak || sk.belly) : c01(sk.base) });
    head.material('plain').col(c01(sk.accent)).push().t(nl + hl * 0.12, 0.03, 0).plate([[0, 0], [-A.crest * K, 0.04], [-A.crest * K * 0.6, 0.06], [hl * 0.1, 0.03]], 0.006).pop();
    eye(head, nl + hl * 0.14, 0.02, bl * 0.08, 0.008, sk);
    const wing = new MB();
    const poly = [[bl * 0.1, 0], [bl * 0.32, sp * 0.3], [bl * 0.2, sp * 0.7], [-bl * 0.2, sp], [-bl * 0.45, sp * 0.82], [-sp * 0.32, sp * 0.45], [-sp * 0.22, sp * 0.12], [-bl * 0.45, 0]];
    wing.rx(-Math.PI / 2).material('skin').col(c01(sk.membrane)).plate(poly, 0.008, mix(c01(sk.membrane), [0, 0, 0], 0.3));
    wing.material('skin').col(mix(c01(sk.membrane), [0, 0, 0], 0.35)).tube([[bl * 0.1, 0, 0], [bl * 0.35, sp * 0.35, 0.004], [-bl * 0.2, sp, 0.004]], 0.01, 0.004, 5);
    return { id, plan: 'ptero', body: body.finish(), head: head.finish(), wing: wing.finish(), bl, span: sp, len: bl + hl + nl, height: 0.2, skin: sk };
  }

  /* ---------- Reptiles marins ---------- */
  function buildMarine(id, A) {
    const sk = A.skin, seed = 1000 + DZ.SPECIES_ORDER.indexOf(id) * 97;
    const rig = { id, plan: A.plan, skin: sk };
    const cf = skinFn(sk, seed);
    const flip = (len, w) => { const m = new MB(); m.rx(-Math.PI / 2).material('skin').col(c01(sk.base)).plate([[0, -w * 0.4], [len * 0.3, -w * 0.2], [len, w * 0.5], [len * 0.85, w * 0.8], [0, w * 0.4]], 0.012); return m.finish(); };
    if (A.plan === 'plesio') {
      const bl = A.body * K, bw = A.bw * K;
      const body = new MB();
      body.material('skin').loft([{ p: [-bl * 0.6, 0, 0], ry: 0.01, rz: 0.01 }, { p: [-bl * 0.35, 0, 0], ry: bw * 0.32, rz: bw * 0.42 }, { p: [bl * 0.1, 0.01, 0], ry: bw * 0.38, rz: bw * 0.52 }, { p: [bl * 0.45, 0.01, 0], ry: bw * 0.26, rz: bw * 0.3 }, { p: [bl * 0.6, 0.01, 0], ry: bw * 0.14, rz: bw * 0.15 }], 12, { colFn: cf });
      rig.body = body.finish();
      const nl = A.neck * K / 3;
      rig.neck = [];
      for (let i = 0; i < 3; i++) { const m = new MB(); m.material('skin').loft(tapered(nl / K, 6 - i * 1.4, 4.6 - i * 1.4, 4, 1, { over: 2 }), 8, { colFn: cf }); rig.neck.push({ mesh: m.finish(), len: nl }); }
      const head = new MB();
      head.material('skin').loft([{ p: [0, 0, 0], ry: 0.03, rz: 0.035 }, { p: [A.head * K * 0.5, 0.005, 0], ry: 0.032, rz: 0.04 }, { p: [A.head * K, 0, 0], ry: 0.008, rz: 0.012 }], 8, { colFn: cf });
      eye(head, A.head * K * 0.35, 0.015, 0.03, 0.007, sk);
      rig.head = head.finish();
      rig.flipF = flip(bw * 0.95, bw * 0.3); rig.flipB = flip(bw * 0.7, bw * 0.25);
      rig.len = bl + A.neck * K + A.head * K;
      rig.bl = bl;
    } else {
      const L = A.len * K, w = A.w * K;
      const segL = [L * 0.22, L * 0.2, L * 0.18, L * 0.16];
      const head = new MB();
      head.material('skin').loft([{ p: [-0.02, 0, 0], ry: w * 0.38, rz: w * 0.42 }, { p: [A.head * K * 0.5, 0.005, 0], ry: w * 0.3, rz: w * 0.32 }, { p: [A.head * K, -0.005, 0], ry: w * 0.08, rz: w * 0.1 }], 10, { colFn: cf });
      teeth(head, A.head * K * 0.3, A.head * K * 0.95, -w * 0.12, (x) => w * 0.3 * (1 - x / (A.head * K)) + 0.01, 7, 0.02, true);
      eye(head, A.head * K * 0.3, w * 0.18, w * 0.3, 0.012, sk);
      rig.head = head.finish();
      rig.segs = [];
      let ww = w * 0.8 / K;
      for (let i = 0; i < segL.length; i++) {
        const w1 = ww * (i === segL.length - 1 ? 0.35 : 0.82);
        const m = new MB();
        m.material('skin').loft(tapered(segL[i] / K, ww * 1.1, w1 * 1.1, 4, -1, { over: ww * 0.3, rz: 1.05, ry: 0.8 }), 10, { colFn: cf });
        if (i === segL.length - 1) m.material('skin').col(c01(sk.base)).push().t(-segL[i], 0, 0).plate([[0.02, 0], [-0.12, 0.2], [-0.18, 0.21], [-0.1, 0.04], [-0.12, 0], [-0.1, -0.04], [-0.18, -0.21], [-0.12, -0.2]].map(([x, y]) => [x * 0.6, y * 0.6]), 0.01).pop();
        rig.segs.push({ mesh: m.finish(), len: segL[i] });
        ww = w1;
      }
      rig.flipF = flip(w * 0.9, w * 0.35); rig.flipB = flip(w * 0.65, w * 0.28);
      rig.len = L + A.head * K;
    }
    return rig;
  }

  G.buildDinoRig = function (id) {
    const A = DZ.DINO_ART[id];
    if (A.plan === 'ptero') return buildPtero(id, A);
    if (A.plan === 'plesio' || A.plan === 'mosa') return buildMarine(id, A);
    return buildLand(id, A);
  };
  G.DINO_K = K;
})();
