/* =====================================================================
   DinoZoo 3D — Modèles : végétation, rochers, bâtiments par niveau,
   clôtures d'enclos, volières, lagons, décor, visiteurs, enseignes.
   Les bâtiments sont construits dans le repère de leur emprise
   (origine au coin, x vers la droite, z vers l'avant, y vers le haut).
   ===================================================================== */
(function () {
  const G = DZ.G, U = DZ.util, C = DZ.CONFIG;
  const MB = G.MB;
  const TAU = Math.PI * 2;
  G.MAT.sign = 13;

  /* ------------------------------------------------------------------
     Enseignes : atlas de textures dessiné une fois en 2D
     ------------------------------------------------------------------ */
  const SIGNS = [
    ['SOUVENIRS', '#e9dcbc', '#4a3220'], ['GRILL', '#e9dcbc', '#6a2a18'], ['RESTAURANT', '#3f6b4a', '#f2e6c4'], ['WC', '#f0ead8', '#2f4858'],
    ['DINOZOO', '#5a3e28', '#efdcaa'], ['BILLETS', '#e9dcbc', '#4a3220'], ['DINO SHOP', '#1f2a24', '#9ef0b0'], ['RESTAURANT ★', '#1f2a24', '#ffd890'],
    ['⚡ DANGER', '#e0b030', '#1a1a1a'], ['SOUVENIRS ', '#3f6b4a', '#f2e6c4'], ['WC ', '#3f6b4a', '#f2e6c4']
  ];
  G.SIGN = {};
  SIGNS.forEach((s, i) => { G.SIGN[s[0].trim() + (s[0].endsWith(' ') ? '2' : '')] = i; });
  G.makeAtlas = function () {
    const c = DZ.R.canvas(1024, 512), g = c.getContext('2d');
    SIGNS.forEach((s, i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
      g.fillStyle = s[1]; g.fillRect(x, y, 256, 64);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, 250, 58);
      g.fillStyle = s[2]; g.font = `700 ${s[0].length > 10 ? 30 : 38}px Georgia, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s[0].trim(), x + 128, y + 34);
    });
    return c;
  };
  /* Panneau texturé face à +z, centré en x, posé à partir de y = 0. */
  function sign(mb, w, h, name, depth) {
    const i = G.SIGN[name] || 0;
    const u0 = (i % 4) / 4 + 0.004, u1 = (i % 4 + 1) / 4 - 0.004, v0 = Math.floor(i / 4) / 8 + 0.004, v1 = (Math.floor(i / 4) + 1) / 8 - 0.004;
    const back = mb.c, matBack = mb.mat;
    mb.material('wood').col('#4a3424').push().t(0, 0, -(depth || 0.02) / 2).box(w + 0.02, h + 0.02, depth || 0.02).pop();
    mb.material(13);
    const z = 0.0011 + (depth || 0.02) / 2;
    const a = mb.vert(-w / 2, 0.01, z, 0, 0, 1, [u0, v1, 0]), b = mb.vert(w / 2, 0.01, z, 0, 0, 1, [u1, v1, 0]);
    const c2 = mb.vert(w / 2, h + 0.01, z, 0, 0, 1, [u1, v0, 0]), d = mb.vert(-w / 2, h + 0.01, z, 0, 0, 1, [u0, v0, 0]);
    mb.quad(a, b, c2, d);
    mb.c = back; mb.mat = matBack;
  }

  /* ------------------------------------------------------------------
     Végétation
     ------------------------------------------------------------------ */
  const FOL = ['#24391a', '#2f4a1f', '#3c5b27', '#4b6d2f', '#5d8139', '#6f9545'];
  function foliageBlob(mb, x, y, z, rx, ry, rz, r, light) {
    const base = U.rgb(FOL[Math.min(5, 1 + Math.floor(r() * 3) + (light || 0))]);
    mb.push().t(x, y, z).material('foliage');
    mb.sphere(rx, ry, rz, 9, 6, (nx, ny) => { const k = 0.75 + 0.45 * (ny * 0.5 + 0.5) + (r() - 0.5) * 0.12; return [base[0] / 255 * k, base[1] / 255 * k, base[2] / 255 * k]; });
    mb.pop();
  }
  function frond(mb, len, droop, width, col, r) {
    // fronde : rachis + folioles, le long de +x à partir de l'origine
    const n = 9;
    const c = U.rgb(col);
    mb.material('foliage');
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p = (t) => [t * len, Math.sin(t * Math.PI * 0.8) * len * 0.25 - t * t * droop, 0];
      const a = p(t0), b = p(t1);
      const w = width * Math.sin(Math.PI * Math.min(1, t0 * 1.1 + 0.05));
      const k = 0.7 + t0 * 0.4 + (r() - 0.5) * 0.15;
      const cc = [c[0] / 255 * k, c[1] / 255 * k, c[2] / 255 * k];
      for (const s of [-1, 1]) {
        mb.triFace([a[0], a[1], 0], [b[0], b[1], 0], [(a[0] + b[0]) / 2 + w * 0.3, (a[1] + b[1]) / 2 - w * 0.5, s * w], cc);
      }
    }
  }
  const BARK = ['#5a4030', '#6b4c36', '#4a3426'];
  const trees = {
    araucaria(mb, r) {
      const h = 1.5 + r() * 0.4;
      mb.material('wood').col(BARK[1]).cyl(0.055, 0.03, h, 7, false);
      for (let k = 0; k < 5; k++) {
        const y = h * (0.45 + k * 0.12), rad = 0.45 - k * 0.07;
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + k;
          foliageBlob(mb, Math.cos(a) * rad * 0.55, y, Math.sin(a) * rad * 0.55, rad * 0.5, 0.09, rad * 0.5, r, k > 2 ? 1 : 0);
        }
      }
      foliageBlob(mb, 0, h + 0.05, 0, 0.14, 0.12, 0.14, r, 2);
      return { r: 0.55, h };
    },
    palmier(mb, r) {
      const h = 1.1 + r() * 0.35, bend = (r() - 0.5) * 0.35;
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([bend * t * t, h * t, 0]); }
      mb.material('wood').col('#7a6248').tube(pts, 0.055, 0.04, 7);
      mb.push().t(bend, h, 0);
      const n = 10;
      for (let i = 0; i < n; i++) {
        mb.push().ry(i / n * TAU + r() * 0.3).rz(0.25 + r() * 0.3);
        frond(mb, 0.55 + r() * 0.15, 0.35, 0.13, FOL[3 + (i % 2)], r);
        mb.pop();
      }
      mb.material('wood').col('#5c4a2f').sphere(0.06, 0.06, 0.06, 6, 4);
      mb.pop();
      return { r: 0.5, h };
    },
    cycas(mb, r) {
      const h = 0.25 + r() * 0.12;
      mb.material('wood').col('#6a5638').cyl(0.08, 0.07, h, 8);
      mb.push().t(0, h, 0);
      for (let i = 0; i < 12; i++) { mb.push().ry(i / 12 * TAU).rz(0.5 + r() * 0.3); frond(mb, 0.38 + r() * 0.1, 0.08, 0.08, FOL[2 + (i % 3)], r); mb.pop(); }
      mb.pop();
      return { r: 0.35, h: h + 0.3 };
    },
    fougere(mb, r) {
      for (let i = 0; i < 13; i++) { mb.push().ry(i / 13 * TAU + r()).rz(0.75 + r() * 0.35); frond(mb, 0.32 + r() * 0.12, 0.2, 0.07, FOL[2 + (i % 3)], r); mb.pop(); }
      return { r: 0.3, h: 0.3 };
    },
    ginkgo(mb, r) {
      const h = 0.9 + r() * 0.25;
      mb.material('wood').col(BARK[0]).cyl(0.06, 0.035, h, 7, false);
      mb.push().t(0, h * 0.55, 0).rz(0.6).cyl(0.025, 0.012, 0.35, 5, false).pop();
      mb.push().t(0, h * 0.6, 0).rz(-0.6).cyl(0.025, 0.012, 0.35, 5, false).pop();
      for (const [x, y, z, s] of [[-0.18, 0.95, 0.05, 0.3], [0.2, 0.98, -0.05, 0.32], [0, 1.18, 0, 0.34], [0.02, 0.85, 0.15, 0.28]]) foliageBlob(mb, x, y * h, z, s, s * 0.8, s, r, 2);
      return { r: 0.5, h: h + 0.3 };
    },
    buisson(mb, r) {
      for (const [x, z, s] of [[-0.12, 0, 0.18], [0.12, 0.04, 0.2], [0, -0.08, 0.17], [0.02, 0.1, 0.15]]) foliageBlob(mb, x, s * 0.7, z, s, s * 0.85, s, r, 1);
      mb.material('plain').col('#8a3a2a');
      for (let i = 0; i < 6; i++) mb.push().t((r() - 0.5) * 0.3, 0.12 + r() * 0.15, 0.12 + r() * 0.06).sphere(0.015, 0.015, 0.015, 5, 3).pop();
      return { r: 0.3, h: 0.35 };
    },
    arbremort(mb, r) {
      const col = '#8a7a66';
      mb.material('wood').col(col).tube([[0, 0, 0], [0.02, 0.4, 0], [0.04, 0.85, 0.02]], 0.05, 0.02, 6);
      mb.tube([[0.02, 0.45, 0], [-0.2, 0.7, 0.05], [-0.32, 0.8, 0.05]], 0.022, 0.008, 5);
      mb.tube([[0.03, 0.6, 0], [0.22, 0.82, -0.04], [0.3, 0.95, -0.05]], 0.02, 0.008, 5);
      return { r: 0.25, h: 0.9 };
    }
  };
  G.TREE_KINDS = Object.keys(trees);
  G.treeMesh = function (kind, variant) {
    const mb = new MB();
    const info = trees[kind](mb, U.rng(variant * 7919 + kind.length * 131 + 3));
    const d = mb.finish();
    d.info = info;
    return d;
  };

  /* Versions simplifiées pour les arbres lointains. */
  const lods = {
    araucaria(mb, info) { const h = info.h; mb.material('wood').col(BARK[1]).cyl(0.05, 0.03, h, 4, false); for (let k = 0; k < 3; k++) mb.material('foliage').col(FOL[2 + (k > 1 ? 1 : 0)]).push().t(0, h * (0.55 + k * 0.17), 0).sphere(0.42 - k * 0.1, 0.12, 0.42 - k * 0.1, 6, 3).pop(); },
    palmier(mb, info) { const h = info.h; mb.material('wood').col('#7a6248').cyl(0.05, 0.04, h, 4, false); mb.material('foliage').col(FOL[3]); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = Math.cos(a), s2 = Math.sin(a); mb.triFace([0, h, 0], [c * 0.55 - s2 * 0.1, h - 0.2, s2 * 0.55 + c * 0.1], [c * 0.55 + s2 * 0.1, h - 0.2, s2 * 0.55 - c * 0.1]); } },
    cycas(mb, info) { mb.material('wood').col('#6a5638').cyl(0.08, 0.07, 0.3, 4, false); mb.material('foliage').col(FOL[3]); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = Math.cos(a), s2 = Math.sin(a); mb.triFace([0, 0.3, 0], [c * 0.4 - s2 * 0.08, 0.5, s2 * 0.4 + c * 0.08], [c * 0.4 + s2 * 0.08, 0.5, s2 * 0.4 - c * 0.08]); } },
    fougere(mb) { mb.material('foliage').col(FOL[3]); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, c = Math.cos(a), s2 = Math.sin(a); mb.triFace([0, 0, 0], [c * 0.32 - s2 * 0.07, 0.28, s2 * 0.32 + c * 0.07], [c * 0.32 + s2 * 0.07, 0.28, s2 * 0.32 - c * 0.07]); } },
    ginkgo(mb, info) { const h = info.h - 0.3; mb.material('wood').col(BARK[0]).cyl(0.06, 0.035, h, 4, false); mb.material('foliage').col(FOL[4]).push().t(0, h + 0.05, 0).sphere(0.42, 0.34, 0.42, 6, 4).pop(); },
    buisson(mb) { mb.material('foliage').col(FOL[3]).push().t(0, 0.16, 0).sphere(0.3, 0.2, 0.28, 6, 4).pop(); },
    arbremort(mb) { mb.material('wood').col('#8a7a66').cyl(0.05, 0.02, 0.85, 4, false); mb.push().t(0, 0.5, 0).rz(0.8).cyl(0.02, 0.008, 0.35, 3, false).pop(); }
  };
  G.treeLodMesh = function (kind, info) { const mb = new MB(); lods[kind](mb, info); return mb.finish(); };

  G.tuftMesh = function () {
    const mb = new MB(), r = U.rng(9);
    mb.material('foliage');
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + r(), w = 0.012, h = 0.07 + r() * 0.07;
      const c = U.rgb(['#4f6a2c', '#5f7f36', '#3d5824', '#72904c'][i % 4]).map((x) => x / 255);
      const dx = Math.cos(a), dz = Math.sin(a);
      mb.triFace([-dz * w, 0, dx * w], [dz * w, 0, -dx * w], [dx * h * 0.35, h, dz * h * 0.35], c);
    }
    return mb.finish();
  };

  G.rockInto = function (mb, x, y, z, size, seed) {
    const r = size === 'L' ? 0.42 : size === 'M' ? 0.26 : 0.13;
    const v = 0.85 + U.hash(seed, 1, 2) * 0.25;
    mb.push().t(x, y, z).ry(U.hash(seed, 3, 4) * TAU).material('rock').col([0.46 * v, 0.45 * v, 0.42 * v]).rock(r, seed, 0.65).pop();
  };

  /* ------------------------------------------------------------------
     Bâtiments
     ------------------------------------------------------------------ */
  function awning(mb, x0, x1, y, z, depth, drop, c1, c2) {
    const n = Math.max(4, Math.round((x1 - x0) / 0.12));
    mb.material('cloth');
    for (let i = 0; i < n; i++) {
      const a = U.lerp(x0, x1, i / n), b = U.lerp(x0, x1, (i + 1) / n);
      mb.col(i % 2 ? c1 : c2);
      mb.face([a, y - drop, z + depth], [b, y - drop, z + depth], [b, y, z], [a, y, z]);
      mb.face([a, y - drop - 0.05, z + depth], [b, y - drop - 0.05, z + depth], [b, y - drop, z + depth], [a, y - drop, z + depth]);
    }
  }
  function parasol(mb, x, z, r, c1, c2) {
    mb.material('metal').col('#5a4a3a').push().t(x, 0, z).cyl(0.012, 0.012, 0.42, 5).pop();
    mb.material('cloth');
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, b = (i + 1) / n * TAU;
      mb.col(i % 2 ? c1 : c2).triFace([x, 0.47, z], [x + Math.cos(b) * r, 0.38, z + Math.sin(b) * r], [x + Math.cos(a) * r, 0.38, z + Math.sin(a) * r]);
    }
  }
  function table(mb, x, z) {
    mb.material('wood').col('#8a6640').push().t(x, 0.17, z).box(0.3, 0.025, 0.18).pop();
    mb.col('#6a4a30').push().t(x, 0, z).box(0.03, 0.17, 0.03).pop();
    for (const s of [-1, 1]) mb.push().t(x, 0.09, z + s * 0.17).box(0.3, 0.02, 0.07).pop();
  }
  function planter(mb, x, z, r) {
    mb.material('stone').col('#8a5a3a').push().t(x, 0, z).cyl(0.07, 0.09, 0.1, 8).pop();
    mb.push().t(x, 0.1, z).s(0.5); trees.fougere(mb, r); mb.pop();
  }
  function walls(mb, x0, z0, x1, z1, h, col, mat) {
    mb.material(mat || 'plain').col(col).push().t((x0 + x1) / 2, 0, (z0 + z1) / 2).box(x1 - x0, h, z1 - z0).pop();
  }
  function windowPane(mb, x, y, z, w, h) {
    mb.material('window').col('#9fb8bf').face([x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z]);
    mb.material('wood').col('#3a2a1c');
    mb.push().t(x, y - 0.015, z).box(w + 0.03, 0.02, 0.02).pop();
  }

  const builders = {
    boutique(mb, lv, out) {
      const r = U.rng(11 + lv);
      if (lv === 1) {
        walls(mb, 0.25, 0.35, 1.75, 1.45, 0.62, '#a07650', 'wood');
        mb.push().t(1.0, 0.62, 0.9).material('wood').roof(1.5, 1.1, 0.32, 0.1, '#80583a', '#6a4630').pop();
        mb.material('plain').col('#2a1e14').face([0.5, 0.14, 1.452], [1.5, 0.14, 1.452], [1.5, 0.44, 1.452], [0.5, 0.44, 1.452]);
        for (let i = 0; i < 7; i++) mb.material('cloth').col(['#b8483a', '#d9a83c', '#4f8a4b', '#3a6ea5'][i % 4]).push().t(0.6 + i * 0.13, 0.2, 1.46).sphere(0.04, 0.045, 0.03, 6, 4).pop();
        mb.material('wood').col('#6e4c30').push().t(1, 0, 1.5).box(1.1, 0.16, 0.1).pop();
        awning(mb, 0.45, 1.55, 0.5, 1.45, 0.25, 0.1, '#e9dfc4', '#3f6b4a');
        mb.push().t(1, 0.52, 1.47); sign(mb, 0.7, 0.13, 'SOUVENIRS'); mb.pop();
        out.lights.push([1, 0.3, 1.6, 1.4]);
      } else if (lv === 2) {
        walls(mb, 0.15, 0.25, 1.85, 1.45, 0.14, '#a49c8c', 'stone');
        walls(mb, 0.18, 0.28, 1.82, 1.42, 0.72, '#a57a52', 'wood');
        mb.push().t(1.0, 0.72, 0.85).material('wood').roof(1.64, 1.14, 0.36, 0.12, '#b0583e', '#8a4430').pop();
        mb.material('plain').col('#2a1e14').face([0.35, 0.18, 1.422], [1.65, 0.18, 1.422], [1.65, 0.5, 1.422], [0.35, 0.5, 1.422]);
        for (let i = 0; i < 10; i++) mb.material('cloth').col(['#b8483a', '#d9a83c', '#4f8a4b', '#3a6ea5', '#e6e0d2'][i % 5]).push().t(0.45 + i * 0.125, 0.24 + (i % 2) * 0.12, 1.43).sphere(0.04, 0.045, 0.03, 6, 4).pop();
        awning(mb, 0.3, 1.7, 0.6, 1.42, 0.3, 0.12, '#e9dfc4', '#b5523a');
        mb.push().t(1, 0.63, 1.44); sign(mb, 0.9, 0.16, 'SOUVENIRS2'); mb.pop();
        planter(mb, 0.15, 1.75, r); planter(mb, 1.85, 1.75, r);
        mb.material('wood').col('#7a5a3a').push().t(1, 0, 1.8).box(0.5, 0.14, 0.18).pop();
        for (let i = 0; i < 4; i++) mb.material('cloth').col(['#7d8248', '#8d6e4c', '#4f6f72', '#b8483a'][i]).push().t(0.82 + i * 0.12, 0.19, 1.8).sphere(0.045, 0.05, 0.045, 6, 4).pop();
        out.lights.push([1, 0.35, 1.6, 1.6]);
      } else {
        walls(mb, 0.15, 0.25, 1.85, 1.45, 0.8, '#ddd7ca');
        for (let i = 0; i < 4; i++) windowPane(mb, 0.4 + i * 0.4, 0.08, 1.452, 0.36, 0.6);
        walls(mb, 0.08, 0.18, 1.92, 1.52, 0.06, '#3f454a', 'metal'); mb.push().t(0, 0.8, 0); walls(mb, 0.08, 0.18, 1.92, 1.52, 0.07, '#4a5054', 'metal'); mb.pop();
        // crâne de T-Rex sculpté sur le toit
        mb.push().t(1, 0.87, 0.85).material('stone').col('#e8e0cc');
        mb.push().s(1).sphere(0.28, 0.16, 0.18, 10, 6).pop();
        mb.push().t(0.28, -0.02, 0).sphere(0.2, 0.09, 0.13, 8, 5).pop();
        mb.material('plain').col('#3a3026').push().t(0.05, 0.06, 0.16).sphere(0.06, 0.045, 0.02, 6, 4).pop();
        mb.material('stone').col('#f6f0e0');
        for (let i = 0; i < 6; i++) mb.push().t(0.2 + i * 0.05, -0.07, 0.1).rx(Math.PI).cone(0.012, 0.05, 4).pop();
        mb.pop();
        mb.push().t(1, 0.82, 1.53); sign(mb, 1.0, 0.16, 'DINO SHOP'); mb.pop();
        planter(mb, 0.12, 1.8, r); planter(mb, 1.88, 1.8, r);
        out.lights.push([1, 0.4, 1.7, 2.0]);
      }
    },
    restaurant(mb, lv, out) {
      const r = U.rng(21 + lv);
      if (lv === 1) {
        walls(mb, 0.2, 0.25, 1.7, 1.15, 0.58, '#8a6240', 'wood');
        mb.push().t(0.95, 0.58, 0.7).material('wood').roof(1.5, 0.9, 0.3, 0.1, '#6a4a32', '#57402a').pop();
        mb.material('plain').col('#2a1e14').face([0.4, 0.15, 1.152], [1.4, 0.15, 1.152], [1.4, 0.42, 1.152], [0.4, 0.42, 1.152]);
        mb.material('stone').col('#8a8278').push().t(1.45, 0, 0.45).box(0.18, 1.15, 0.18).pop();
        out.smoke.push([1.45, 1.2, 0.45]);
        awning(mb, 0.35, 1.45, 0.48, 1.15, 0.22, 0.09, '#e9dfc4', '#b5523a');
        mb.push().t(0.9, 0.5, 1.17); sign(mb, 0.55, 0.12, 'GRILL'); mb.pop();
        table(mb, 2.3, 0.7); parasol(mb, 2.3, 0.7, 0.28, '#e9dfc4', '#3f6b4a');
        table(mb, 2.45, 1.55); parasol(mb, 2.45, 1.55, 0.26, '#e9dfc4', '#b5523a');
        out.lights.push([0.9, 0.3, 1.3, 1.4]);
      } else if (lv === 2) {
        walls(mb, 0.15, 0.2, 2.85, 1.15, 0.12, '#9a9286', 'stone');
        walls(mb, 0.18, 0.22, 2.82, 1.12, 0.66, '#9a7048', 'wood');
        for (let i = 0; i < 5; i++) windowPane(mb, 0.45 + i * 0.5, 0.2, 1.122, 0.32, 0.3);
        mb.push().t(1.5, 0.66, 0.67).material('wood').roof(2.64, 0.9, 0.36, 0.12, '#9a4e36', '#7a3c2a').pop();
        mb.material('stone').col('#8a8278').push().t(2.55, 0, 0.4).box(0.2, 1.3, 0.2).pop();
        out.smoke.push([2.55, 1.35, 0.4]);
        mb.push().t(1.5, 0.72, 1.13); sign(mb, 0.95, 0.16, 'RESTAURANT'); mb.pop();
        for (const [x, z] of [[0.4, 1.5], [1.0, 1.75], [1.6, 1.5], [2.2, 1.75], [2.7, 1.5]]) table(mb, x, z);
        for (const [x, z] of [[0.4, 1.5], [1.6, 1.5], [2.7, 1.5]]) parasol(mb, x, z, 0.28, '#e9dfc4', '#b5523a');
        // guirlande lumineuse
        mb.material('emissive').col('#ffe2a0');
        for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12; mb.push().t(0.2 + t * 2.6, 0.62 - Math.sin(t * Math.PI) * 0.06, 1.3).sphere(0.018, 0.018, 0.018, 5, 3).pop(); }
        out.lights.push([1.5, 0.5, 1.5, 2.2], [0.6, 0.4, 1.4, 1.2], [2.4, 0.4, 1.4, 1.2]);
      } else {
        walls(mb, 0.15, 0.2, 2.85, 1.15, 0.05, '#cfc9bc', 'stone');
        for (let i = 0; i < 6; i++) windowPane(mb, 0.36 + i * 0.455, 0.05, 1.15, 0.43, 0.62);
        mb.material('window').col('#9fb8bf');
        mb.push().t(1.5, 0.05, 0.67).box(2.66, 0.62, 0.92).pop();
        mb.material('metal').col('#5a6066').push().t(1.5, 0.67, 0.67).box(2.8, 0.06, 1.04).pop();
        mb.material('foliage').col('#4b6d2f').push().t(1.5, 0.73, 0.67).box(2.7, 0.04, 0.96).pop();
        for (let i = 0; i < 14; i++) foliageBlob(mb, 0.3 + r() * 2.4, 0.78, 0.3 + r() * 0.75, 0.1, 0.05, 0.08, r, 1);
        mb.push().t(1.5, 0.62, 1.2); sign(mb, 1.1, 0.15, 'RESTAURANT ★'); mb.pop();
        for (const [x, z] of [[0.35, 1.5], [0.9, 1.78], [1.45, 1.5], [2.0, 1.78], [2.55, 1.5]]) table(mb, x, z);
        for (const [x, z] of [[0.35, 1.5], [1.45, 1.5], [2.55, 1.5]]) parasol(mb, x, z, 0.28, '#f0ead8', '#3f6b4a');
        for (let i = 0; i < 5; i++) { const x = 0.15 + i * 0.68; mb.material('metal').col('#3a3026').push().t(x, 0, 1.92).cyl(0.012, 0.012, 0.5, 5).pop(); mb.material('emissive').col('#ffe2a0').push().t(x, 0.52, 1.92).sphere(0.035, 0.035, 0.035, 6, 4).pop(); out.lights.push([x, 0.5, 1.92, 0.9]); }
        out.lights.push([1.5, 0.35, 1.3, 2.4]);
      }
    },
    toilettes(mb, lv) {
      const door = (x, col, fem) => {
        mb.material('wood').col(col).face([x - 0.12, 0.0, 0.802], [x + 0.12, 0.0, 0.802], [x + 0.12, 0.34, 0.802], [x - 0.12, 0.34, 0.802]);
        mb.material('plain').col('#f2ead8').push().t(x, 0.26, 0.81).sphere(0.025, 0.025, 0.01, 6, 4).pop();
        mb.push().t(x, 0.13, 0.81); fem ? mb.cone(0.04, 0.1, 6) : mb.box(0.04, 0.1, 0.01); mb.pop();
      };
      const wallCol = lv === 1 ? '#a07650' : lv === 2 ? '#b4aa98' : '#ece6da';
      walls(mb, 0.2, 0.15, 1.8, 0.8, 0.5, wallCol, lv === 1 ? 'wood' : lv === 2 ? 'stone' : 'plain');
      door(0.65, lv === 3 ? '#2f4858' : '#3a6ea5', false); door(1.35, lv === 3 ? '#7a3a4a' : '#ad525d', true);
      if (lv === 1) { mb.push().t(1, 0.5, 0.48).material('metal').roof(1.6, 0.65, 0.18, 0.06, '#8a9196', '#6c7378').pop(); }
      else if (lv === 2) { mb.push().t(1, 0.5, 0.48).material('wood').roof(1.6, 0.65, 0.22, 0.08, '#9a5a3a', '#7a4430').pop(); planter(mb, 0.1, 0.9, U.rng(3)); planter(mb, 1.9, 0.9, U.rng(4)); }
      else {
        walls(mb, 0.14, 0.1, 1.86, 0.86, 0.04, '#4a5054', 'metal'); mb.push().t(0, 0.5, 0); walls(mb, 0.14, 0.1, 1.86, 0.86, 0.04, '#4a5054', 'metal'); mb.pop();
        mb.material('foliage').col('#4b6d2f').push().t(0.6, 0.54, 0.48).box(0.75, 0.04, 0.6).pop();
        mb.material('glass').col('#2a3a5a').push().t(1.4, 0.56, 0.48).rx(-0.3).box(0.6, 0.02, 0.45).pop();
        planter(mb, 0.1, 0.92, U.rng(5)); planter(mb, 1.9, 0.92, U.rng(6));
      }
      mb.push().t(1, 0.36, 0.81); sign(mb, 0.24, 0.12, lv === 1 ? 'WC' : 'WC2'); mb.pop();
    },
    entree(mb, lv, out) {
      mb.material('stone').col('#b5a990').face([0.02, 0.03, 1.98], [2.98, 0.03, 1.98], [2.98, 0.03, 0.02], [0.02, 0.03, 0.02]);
      for (const x of [0.25, 2.3]) {
        mb.material('stone').col('#9c9482').push().t(x + 0.2, 0, 1.2).box(0.42, 1.55, 0.42).pop();
        mb.col('#7a7266').push().t(x + 0.2, 1.55, 1.2).box(0.5, 0.08, 0.5).pop();
        mb.material('metal').col('#3a3026').push().t(x + 0.2, 1.63, 1.2).cyl(0.05, 0.08, 0.14, 6).pop();
        mb.material('emissive').col('#ffb84a').push().t(x + 0.2, 1.8, 1.2).sphere(0.07, 0.11, 0.07, 6, 5).pop();
        out.lights.push([x + 0.2, 1.8, 1.2, 2.6]);
      }
      mb.material('wood').col('#5a3e28').push().t(1.5, 1.3, 1.2).box(2.5, 0.2, 0.16).pop();
      mb.push().t(1.5, 1.33, 1.29); sign(mb, 1.3, 0.16, 'DINOZOO'); mb.pop();
      const r = U.rng(7);
      for (let i = 0; i < 9; i++) foliageBlob(mb, 0.35 + r() * 2.3, 1.5 + r() * 0.05, 1.2 + (r() - 0.5) * 0.2, 0.08 + r() * 0.05, 0.05, 0.07, r, 1);
      // guérite
      walls(mb, 2.45, 0.15, 2.95, 0.75, 0.6, '#8a6240', 'wood');
      windowPane(mb, 2.7, 0.25, 0.752, 0.32, 0.22);
      mb.push().t(2.7, 0.6, 0.45).material('wood').roof(0.5, 0.6, 0.2, 0.06, '#6a4a32', '#57402a').pop();
      mb.push().t(2.7, 0.5, 0.755); sign(mb, 0.4, 0.08, 'BILLETS'); mb.pop();
      // tourniquets
      mb.material('metal').col('#5c6368');
      for (let i = 0; i < 3; i++) mb.push().t(1.1 + i * 0.4, 0, 1.2).box(0.06, 0.24, 0.3).pop();
      out.lights.push([2.7, 0.4, 0.9, 1.0]);
    },
    poubelle(mb) {
      mb.material('metal').col('#3d5a3a').push().t(0.5, 0, 0.5).cyl(0.09, 0.1, 0.24, 10).pop();
      mb.col('#2a3a28').push().t(0.5, 0.24, 0.5).cyl(0.11, 0.05, 0.05, 10).pop();
    },
    banc(mb) {
      mb.material('wood');
      for (let i = 0; i < 3; i++) mb.col(i % 2 ? '#a87e54' : '#9a7048').push().t(0.5, 0.14, 0.42 + i * 0.07).box(0.7, 0.025, 0.06).pop();
      for (let i = 0; i < 2; i++) mb.col('#9a7048').push().t(0.5, 0.2 + i * 0.07, 0.38).box(0.7, 0.05, 0.02).pop();
      mb.material('metal').col('#2f3438');
      for (const x of [0.2, 0.8]) mb.push().t(x, 0, 0.48).box(0.04, 0.14, 0.2).pop();
    },
    lampadaire(mb, lv, out) {
      mb.material('metal').col('#2f3438').push().t(0.5, 0, 0.5).cyl(0.035, 0.022, 0.95, 6).pop();
      mb.push().t(0.5, 0.95, 0.5).cyl(0.07, 0.04, 0.04, 6).pop();
      mb.material('emissive').col('#ffe6a8').push().t(0.5, 0.99, 0.5).box(0.09, 0.12, 0.09).pop();
      mb.material('metal').col('#2f3438').push().t(0.5, 1.11, 0.5).cone(0.08, 0.07, 6).pop();
      out.lights.push([0.5, 1.02, 0.5, 2.6]);
    },
    fontaine(mb, lv, out) {
      mb.material('stone').col('#a39d8e').push().t(1, 0, 1).cyl(0.82, 0.8, 0.2, 20).pop();
      mb.material('glass').col('#3f7f86').push().t(1, 0.16, 1).cyl(0.74, 0.74, 0.01, 20).pop();
      mb.material('stone').col('#b4ae9e').push().t(1, 0, 1).cyl(0.1, 0.08, 0.55, 10).pop();
      mb.push().t(1, 0.55, 1).cyl(0.12, 0.3, 0.08, 14).pop();
      mb.material('glass').col('#5f9a9a').push().t(1, 0.61, 1).cyl(0.27, 0.27, 0.01, 14).pop();
      out.fountain = [1, 0.62, 1];
      out.lights.push([1, 0.4, 1, 1.4]);
    }
  };

  G.buildingInto = function (mb, b) {
    const out = { lights: [], smoke: [], fountain: null };
    if (builders[b.type]) builders[b.type](mb, b.level, out);
    return out;
  };

  /* ------------------------------------------------------------------
     Enclos : clôtures, volières, lagons, décor intérieur
     opaque : maillage opaque ; glass : maillage transparent
     ------------------------------------------------------------------ */
  /* Contour organique de l'enclos (distance signée = offset), rééchantillonné
     tous les « spacing » ; points en coordonnées locales à l'emprise. */
  G.encContour = function (b, offset, spacing) {
    const sh = DZ.encShape(b);
    const raw = [];
    const N = 160;
    for (let k = 0; k < N; k++) {
      const a = k / N * TAU;
      const dx = Math.cos(a) * sh.hw, dz = Math.sin(a) * sh.hh, l = Math.hypot(dx, dz);
      const ux = dx / l, uz = dz / l;
      let lo = 0, hi = Math.max(sh.hw, sh.hh) + 2;
      for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (DZ.encSDF(b, sh.cx + ux * m, sh.cy + uz * m, sh) < offset) lo = m; else hi = m; }
      raw.push([sh.cx + ux * lo - b.x, sh.cy + uz * lo - b.y]);
    }
    // rééchantillonnage à pas constant
    let total = 0;
    const seg = raw.map((p, i) => { const q = raw[(i + 1) % N]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); total += l; return l; });
    const n = Math.max(8, Math.round(total / spacing));
    const out = [];
    let i = 0, acc = 0;
    for (let k = 0; k < n; k++) {
      const target = k / n * total;
      while (acc + seg[i] < target) { acc += seg[i]; i = (i + 1) % N; }
      const t = seg[i] ? (target - acc) / seg[i] : 0, p = raw[i], q = raw[(i + 1) % N];
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
    return out;
  };

  /* Suit une polyligne fermée : fn(x, z, angle, longueur, index, normale). */
  function alongLoop(pts, fn) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      // normale extérieure (contour parcouru dans le sens trigonométrique de l'écran)
      fn(p[0], p[1], ang, len, i, [Math.sin(ang), -Math.cos(ang)], q);
    }
  }

  G.enclosureInto = function (mb, glass, b, world) {
    const def = C.buildings[b.type], lv = b.level, W = b.w, D = b.h;
    const out = { lights: [], smoke: [] };
    if (def.kind === 'air') return aviary(mb, glass, b, out);
    if (def.kind === 'water') return lagoon(mb, glass, b, out);
    const spacing = lv === 1 ? 0.34 : lv === 2 ? 0.5 : 0.62;
    const pts = G.encContour(b, -0.05, spacing);
    const sh = DZ.encShape(b);
    const front = [];
    alongLoop(pts, (x, z, ang, len, i, nrm, q) => {
      mb.push().t(x, 0, z).ry(-ang);
      if (lv === 1) {
        mb.material('wood').col(i % 2 ? '#8a6240' : '#7a5636').push().rz((U.hash(i, 3, b.seed) - 0.5) * 0.08).cyl(0.03, 0.026, 0.32 + U.hash(i, 1, b.seed) * 0.05, 6).pop();
        mb.col('#6e4c30');
        for (const y of [0.12, 0.27]) mb.push().t(len / 2, y + (U.hash(i, y * 10, b.seed) - 0.5) * 0.02, 0).box(len + 0.02, 0.032, 0.028).pop();
      } else if (lv === 2) {
        mb.material('stone').col('#9a968c').push().t(len / 2, 0, 0).box(len + 0.04, 0.05, 0.1).pop();
        mb.material('metal').col('#6e767c').push().box(0.05, 0.66, 0.05).pop();
        mb.col('#2f3438').push().t(0, 0.66, 0).box(0.09, 0.03, 0.09).pop();
        if (i % 3 === 1) mb.material('emissive').col('#ffe2a0').push().t(0, 0.7, 0).sphere(0.025, 0.025, 0.025, 5, 3).pop();
        if (i % 4 === 2) { mb.push().t(len / 2, 0.3, 0.035); sign(mb, 0.16, 0.08, '⚡ DANGER', 0.01); mb.pop(); }
        mb.material('metal').col('#30363a');
        for (let k = 0; k < 5; k++) mb.push().t(len / 2, 0.1 + k * 0.12, 0).box(len + 0.02, 0.008, 0.008).pop();
        if (i % 3 === 1) out.lights.push([b.x + x, 0.75, b.y + z, 1.5]);
      } else {
        mb.material('stone').col('#a8a49a').push().t(len / 2, 0, 0).box(len + 0.03, 0.13, 0.12).pop();
        mb.col('#c6c2b8').push().t(len / 2, 0.13, 0).box(len + 0.03, 0.015, 0.14).pop();
        mb.material('metal').col('#3f454a').push().t(0, 0.13, 0).box(0.04, 0.5, 0.04).pop();
        mb.push().t(len / 2, 0.62, 0).box(len + 0.02, 0.025, 0.05).pop();
        glass.push(); glass.m = G.m4.copy(mb.m); glass.material('glass').col('#bfe0ea').face([0, 0.14, 0], [len, 0.14, 0], [len, 0.62, 0], [0, 0.62, 0]); glass.pop();
        if (nrm[1] > 0.55) front.push([x, z, ang, len, nrm]);
      }
      mb.pop();
    });
    // passerelle d'observation qui épouse la courbe de la clôture (niveau 3)
    for (const [x, z, ang, len, nrm] of front) {
      const ox = x + nrm[0] * 0.28, oz = z + nrm[1] * 0.28;
      mb.push().t(ox, 0, oz).ry(-ang);
      mb.material('wood').col('#8a6545').push().t(len / 2, 0.36, 0).box(len + 0.06, 0.04, 0.3).pop();
      mb.material('metal').col('#3f454a').push().t(0, 0, 0.1).box(0.035, 0.36, 0.035).pop();
      mb.push().t(len / 2, 0.62, 0.14).box(len + 0.04, 0.02, 0.02).pop();
      mb.push().t(0, 0.4, 0.14).box(0.012, 0.22, 0.012).pop();
      mb.pop();
    }
    if (front.length) for (let k = 0; k < front.length; k += 4) out.lights.push([b.x + front[k][0], 0.7, b.y + front[k][1] + 0.3, 1.4]);
    // mangeoire à l'intérieur
    const fx = sh.cx - b.x + sh.hw * 0.45, fz = sh.cy - b.y + sh.hh * 0.45;
    mb.push().t(fx, 0, fz).ry(0.4);
    mb.material('wood').col('#5a4028').box(0.42, 0.1, 0.16);
    mb.material('plain').col('#b8a050').push().t(0, 0.1, 0).box(0.38, 0.03, 0.12).pop();
    mb.pop();
    return out;
  };

  function aviary(mb, glass, b, out) {
    const lv = b.level, W = b.w, D = b.h;
    const cx = W / 2, cz = D / 2, rx = W / 2, rz = D / 2, dh = 1.6 + W * 0.08;
    const P = (th, ph) => [cx + rx * Math.cos(ph) * Math.cos(th), dh * Math.sin(ph), cz + rz * Math.cos(ph) * Math.sin(th)];
    const col = lv === 1 ? '#d6c496' : lv === 2 ? '#3f454a' : '#e8eef0';
    const r0 = lv === 1 ? 0.01 : lv === 2 ? 0.022 : 0.016;
    mb.material(lv === 1 ? 'cloth' : 'metal').col(col);
    const nM = lv === 3 ? 18 : 14;
    for (let i = 0; i < nM; i++) { const th = i / nM * TAU; const pts = []; for (let k = 0; k <= 10; k++) pts.push(P(th, k / 10 * Math.PI / 2)); mb.tube(pts, r0, r0, 4); }
    for (let k = 0; k < 5; k++) { const ph = k / 5 * Math.PI / 2; const pts = []; for (let i = 0; i <= 32; i++) pts.push(P(i / 32 * TAU, ph)); mb.tube(pts, r0, r0, 4); }
    if (lv === 1) { // filet fin
      mb.material('cloth').col('#c8b688');
      for (let i = 0; i < 36; i++) { const th = i / 36 * TAU; const pts = []; for (let k = 0; k <= 8; k++) pts.push(P(th, k / 8 * Math.PI / 2)); mb.tube(pts, 0.004, 0.004, 3); }
      mb.material('wood').col('#6e4c30');
      for (let i = 0; i < 6; i++) { const p = P(i / 6 * TAU, 0); mb.push().t(p[0], 0, p[2]).cyl(0.04, 0.035, 0.9, 6).pop(); }
    }
    if (lv === 3) {
      glass.material('glass').col('#cfe8f0');
      glass.push(); glass.m = G.m4.copy(mb.m);
      const seg = 24, rings = 8;
      for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) {
        const a = P(i / seg * TAU, k / rings * Math.PI / 2), bb = P((i + 1) / seg * TAU, k / rings * Math.PI / 2);
        const c = P((i + 1) / seg * TAU, (k + 1) / rings * Math.PI / 2), d = P(i / seg * TAU, (k + 1) / rings * Math.PI / 2);
        glass.face(a, bb, c, d);
      }
      glass.pop();
    }
    mb.material('stone').col('#9a968c');
    for (let i = 0; i < 24; i++) { const p = P(i / 24 * TAU, 0); mb.push().t(p[0], 0, p[2]).box(0.12, 0.06, 0.12).pop(); }
    return out;
  }

  function lagoon(mb, glass, b, out) {
    const lv = b.level;
    if (lv === 1) {
      // berge naturelle : rochers le long du bassin
      const pts = G.encContour(b, -0.35, 0.55);
      pts.forEach((p, i) => G.rockInto(mb, p[0], -0.06, p[1], U.hash(i, 2, b.seed) < 0.3 ? 'M' : 'S', b.seed + i));
      return out;
    }
    // margelle et garde-corps qui suivent la courbe du bassin
    const pts = G.encContour(b, -0.32, 0.42);
    alongLoop(pts, (x, z, ang, len, i) => {
      mb.push().t(x, 0, z).ry(-ang);
      mb.material('stone').col('#bdb8ac').push().t(len / 2, -0.03, 0).box(len + 0.04, 0.07, 0.22).pop();
      mb.material('metal').col('#3f454a').push().box(0.02, 0.36, 0.02).pop();
      mb.push().t(len / 2, 0.35, 0).box(len + 0.02, 0.025, 0.025).pop();
      mb.push().t(len / 2, 0.19, 0).box(len + 0.02, 0.012, 0.012).pop();
      if (lv === 3) { glass.push(); glass.m = G.m4.copy(mb.m); glass.material('glass').col('#bfe0ea').face([0, 0.02, 0], [len, 0.02, 0], [len, 0.34, 0], [0, 0.34, 0]); glass.pop(); }
      if (lv === 3 && i % 6 === 0) out.lights.push([b.x + x, 0.4, b.y + z, 1.3]);
      mb.pop();
    });
    return out;
  }

    /* Décor intérieur des enclos (rochers et arbres), déterministe. */
  G.enclosureDecor = function (b) {
    const def = C.buildings[b.type], lv = b.level;
    const r = U.rng(b.seed + lv * 7);
    const area = b.w * b.h, out = [];
    const sh = DZ.encShape(b);
    const inside = () => { for (let k = 0; k < 30; k++) { const p = { x: b.x + 0.7 + r() * (b.w - 1.4), z: b.y + 0.7 + r() * (b.h - 1.3) }; if (DZ.encSDF(b, p.x, p.z, sh) < -0.9) return p; } return { x: sh.cx, z: sh.cy }; };
    if (def.kind === 'land') {
      const rocks = Math.round(area / 9) + (lv >= 2 ? 1 : 0);
      for (let i = 0; i < rocks; i++) { const p = inside(); out.push({ t: 'rock', x: p.x, z: p.z, size: r() < 0.3 && area > 12 ? 'L' : r() < 0.6 ? 'M' : 'S', sd: (r() * 1000) | 0 }); }
      const n = Math.round(area / 10) + (lv === 3 ? 2 : lv === 2 ? 1 : 0);
      const kinds = lv === 1 ? ['fougere', 'buisson', 'cycas'] : ['fougere', 'cycas', 'palmier', 'araucaria', 'ginkgo', 'buisson'];
      for (let i = 0; i < n; i++) { const p = inside(); out.push({ t: 'tree', k: area < 10 ? U.pick(r, ['fougere', 'buisson', 'cycas']) : U.pick(r, kinds), x: p.x, z: p.z, sd: (r() * 1e6) | 0, sc: 0.8 + r() * 0.3 }); }
    } else if (def.kind === 'air') {
      for (let i = 0; i < 2 + lv; i++) { const p = inside(); out.push({ t: 'tree', k: i % 2 ? 'arbremort' : 'palmier', x: p.x, z: p.z, sd: (r() * 1e6) | 0, sc: 0.9 + r() * 0.3 }); }
      for (let i = 0; i < 2; i++) { const p = inside(); out.push({ t: 'rock', x: p.x, z: p.z, size: 'M', sd: (r() * 1000) | 0 }); }
    }
    return out;
  };

  /* ------------------------------------------------------------------
     Visiteurs : corps (torse + tête + bras) et jambe, instanciés.
     Teintes marqueurs : magenta = chemise, cyan = pantalon, jaune = peau,
     blanc = cheveux (multiplié par la teinte de l'instance).
     ------------------------------------------------------------------ */
  G.personMeshes = function () {
    const body = new MB();
    body.material('cloth').col([1, 0, 1]);
    body.push().t(0, 0.15, 0).loft([{ p: [0, 0, 0], ry: 0.045, rz: 0.03 }, { p: [0, 0.07, 0], ry: 0.05, rz: 0.034 }, { p: [0, 0.13, 0], ry: 0.052, rz: 0.032 }, { p: [0, 0.145, 0], ry: 0.02, rz: 0.02 }], 8).pop();
    for (const s of [-1, 1]) body.push().t(s * 0.058, 0.27, 0).rx(0).rz(s * 0.12).t(0, -0.11, 0).cyl(0.014, 0.016, 0.11, 5).pop();
    body.material('plain').col([1, 1, 0]);
    for (const s of [-1, 1]) body.push().t(s * 0.072, 0.155, 0).sphere(0.015, 0.015, 0.015, 5, 3).pop();
    body.push().t(0, 0.335, 0).sphere(0.042, 0.047, 0.042, 9, 6).pop();
    body.material('cloth').col([1, 1, 1]);
    body.push().t(0, 0.35, -0.006).sphere(0.045, 0.036, 0.045, 9, 5).pop();
    body.material('plain').col('#1a120c');
    for (const s of [-1, 1]) body.push().t(s * 0.016, 0.338, 0.038).sphere(0.006, 0.006, 0.004, 4, 3).pop();
    const leg = new MB();
    leg.material('cloth').col([0, 1, 1]).push().t(0, -0.15, 0).cyl(0.02, 0.024, 0.15, 6).pop();
    leg.material('plain').col('#2a2420').push().t(0, -0.155, 0.012).box(0.035, 0.02, 0.06).pop();
    return { body: body.finish(), leg: leg.finish() };
  };
})();
