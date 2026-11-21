/* =====================================================================
   DinoZoo 3D — Dinosaures réalistes animés par leur propre squelette.

   Le modèle Meshy de chaque espèce reçoit un squelette ajusté à sa forme
   (r3d/rigfit.js) : dos, queue en plusieurs os, cou en plusieurs os,
   tête, mâchoire, pattes (cuisse, jambe, pied), bras (bras, avant-bras),
   ailes en trois segments, nageoires en deux segments.

   dinoPose (renderer3d.js) calcule, comme pour le pantin procédural, les
   angles de la marche, du repos, du sommeil, du repas, du cri, du combat
   et du transport ; skelSwap les applique à ces os (chaque os tourne
   autour de son articulation) et remplace le pantin par le modèle.
   ===================================================================== */
(function () {
  const G = DZ.G, M4 = G.m4;
  const R = G.Renderer3D.prototype;

  const dec = (b64, Ctor) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Ctor(u8.buffer);
  };
  // le modèle du parasaurolophe broute à quatre pattes (le pantin procédural est bipède)
  const PLAN = { parasaurolophus: 'quad' };
  const planOf = (id) => { const p = PLAN[id] || DZ.DINO_ART[id].plan; return p === 'thero' ? 'biped' : p; };

  /* Modèle prêt pour cette espèce (ou null : pas encore chargé, on garde le pantin). */
  R.skelModel = function (id) {
    this.skelCache = this.skelCache || new Map();
    if (this.skelCache.has(id)) { const s = this.skelCache.get(id); return s && s.mesh.tex ? s : null; }
    if (this.noModels) return null;
    const M = DZ.MODELS && DZ.MODELS[id];
    if (!M) { this.requestModel(id); return null; }
    let s = null;
    if (DZ.SPECIES[id] && DZ.rigfit) {
      try { s = this.buildSkel(id, M); } catch (e) { console.warn('Modèle 3D ' + id + ' ignoré :', e); s = null; }
    }
    this.skelCache.set(id, s);
    return null; // prêt quand la texture est chargée
  };

  R.buildSkel = function (id, M) {
    const gl = this.gl, n = M.n;
    const qp = dec(M.pos, Uint16Array), qn = dec(M.nor, Int8Array), qt = dec(M.uv, Uint16Array);
    const idx = M.wide ? dec(M.idx, Uint32Array) : dec(M.idx, Uint16Array);
    const P = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      P[k * 3] = M.lo[0] + qp[k * 3] / 65535 * (M.hi[0] - M.lo[0]);
      P[k * 3 + 1] = qp[k * 3 + 1] / 65535 * M.hi[1];
      P[k * 3 + 2] = M.lo[2] + qp[k * 3 + 2] / 65535 * (M.hi[2] - M.lo[2]);
    }
    const plan = planOf(id);
    const rig = DZ.rigfit(id, P, plan);
    if (rig.bones.length > G.MAX_BONES) throw new Error(rig.bones.length + ' os, maximum ' + G.MAX_BONES);
    // taille : celle du pantin procédural (longueur ; envergure pour les volants)
    const parts = this.bindPose(id);
    let px0 = 1e9, px1 = -1e9, pz0 = 1e9, pz1 = -1e9;
    for (const [mesh, mat] of parts) {
      const b = mesh.bounds;
      for (const cx of [b.x0, b.x1]) for (const cy of [b.y0, b.y1]) for (const cz of [b.z0, b.z1]) {
        const p = M4.apply(mat, cx, cy, cz);
        px0 = Math.min(px0, p[0]); px1 = Math.max(px1, p[0]); pz0 = Math.min(pz0, p[2]); pz1 = Math.max(pz1, p[2]);
      }
    }
    const habitat = DZ.SPECIES[id].habitat;
    let k = (px1 - px0) / (M.hi[0] - M.lo[0]);
    if (habitat === 'air') k = (pz1 - pz0) / (M.hi[2] - M.lo[2]); // envergure
    else if (habitat === 'water') k = (k + (pz1 - pz0) / (M.hi[2] - M.lo[2])) / 2;
    // origine : sous les hanches (terrestres) ou au centre du corps (volants, marins)
    const bp = rig.bones[0].pivot;
    const a = [bp[0], habitat === 'land' ? 0 : bp[1], 0];
    const fit = (p) => [(p[0] - a[0]) * k, (p[1] - a[1]) * k, (p[2] - a[2]) * k];
    const bones = rig.bones.map((b) => ({ name: b.name, parent: b.parent, p: fit(b.pivot), e: fit(b.end) }));
    const verts = new Float32Array(n * 20);
    let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
    const J = rig.weights.J, Wt = rig.weights.W;
    for (let i = 0; i < n; i++) {
      const o = i * 20;
      const x = (P[i * 3] - a[0]) * k, y = (P[i * 3 + 1] - a[1]) * k, z = (P[i * 3 + 2] - a[2]) * k;
      verts[o] = x; verts[o + 1] = y; verts[o + 2] = z;
      verts[o + 3] = qn[i * 4] / 127; verts[o + 4] = qn[i * 4 + 1] / 127; verts[o + 5] = qn[i * 4 + 2] / 127;
      verts[o + 6] = 1; verts[o + 7] = 1; verts[o + 8] = 1; verts[o + 9] = 14 / 15;
      verts[o + 10] = qt[i * 2] / 65535; verts[o + 11] = qt[i * 2 + 1] / 65535;
      for (let j = 0; j < 4; j++) { verts[o + 12 + j] = J[i * 4 + j]; verts[o + 16 + j] = Wt[i * 4 + j]; }
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z);
    }
    const mesh = G.uploadSkin(gl, { verts, idx: Uint32Array.from(idx), bounds: { x0: bx0, y0: by0, z0: bz0, x1: bx1, y1: by1, z1: bz1 } });
    mesh.tex = null;
    const sk = { id, mesh, bones, groups: rig.groups, plan, kind: rig.kind, nb: bones.length, hipY: bones[0].p[1] };
    if (M.tex) {
      const img = new Image();
      img.onload = () => { mesh.tex = G.texture(gl, img); this.refreshThumbs(id); };
      img.src = M.tex;
    }
    return sk;
  };

  /* ------------------------------------------------------------------
     Pose : angles par os (lacet rotY, tangage rotZ, roulis rotX) autour
     de l'articulation, composés du corps vers les extrémités.
     ------------------------------------------------------------------ */
  function poseLand(sk, pz, ry, rz, rx) {
    const g = sk.groups, { moving, phase, seedT, rest, state } = pz;
    // queue : ondulation (plus ample en marchant), légère houle verticale
    const nT = g.tail.length, kT = pz.procTail / nT;
    g.tail.forEach((id, j) => {
      const i = j * kT;
      ry[id] = Math.sin(seedT * (moving ? 2.4 : 1.1) - i * 0.8) * (moving ? 0.1 : 0.07) * (1 + i * 0.3) * kT;
      rz[id] = Math.sin(seedT * 0.9 - i * 0.7) * 0.03 * kT;
    });
    if (nT) rz[g.tail[0]] -= rest ? 0.1 : 0;
    // cou et tête : port de tête, regard, repas, cri, combat ; mâchoire
    const nN = g.neck.length;
    const yaw = pz.look * (pz.procNeck > 1 ? 0.25 * (pz.procNeck - 1) + 0.4 : 0.8);
    if (nN) {
      // flexion du cou répartie sur les premiers os : courbe régulière, pas de pli à la base
      const share = nN >= 3 ? [0.4, 0.33, 0.27] : nN === 2 ? [0.6, 0.4] : [1];
      share.forEach((f, j) => { rz[g.neck[j]] += pz.na * f; });
      g.neck.forEach((id, j) => { ry[id] += yaw * 0.6 / nN; if (j > 0) rz[id] += pz.neckStep / (nN - 1); });
      if (nN === 1) rz[g.head] += pz.neckStep;
      ry[g.head] += yaw * 0.4;
    } else ry[g.head] += yaw;
    rz[g.head] += pz.hr;
    if (g.jaw != null) rz[g.jaw] = -pz.jaw;
    // pattes : même cycle que le pantin (cuisse, genou, cheville)
    const quad = sk.plan === 'quad', amp = quad ? 0.32 : 0.48;
    for (const lg of g.legs) {
      const off = quad ? ((lg.front ? 0 : Math.PI) + (lg.side > 0 ? Math.PI : 0)) : (lg.side > 0 ? Math.PI : 0);
      const psi = phase + off;
      const lift = moving ? Math.max(0, Math.sin(psi + 1.4)) : 0;
      let da = moving ? Math.sin(psi) * amp : 0;
      let ds = -lift * amp * (quad ? 0.9 : 1.3) * (lg.front ? -0.6 : 1);
      if (rest) { da += lg.front ? 0.15 : 0.55; ds -= lg.front ? 0.3 : 1.1; }
      rz[lg.ids[0]] = da; rz[lg.ids[1]] = ds; rz[lg.ids[2]] = -(da + ds) - lift * 0.25;
    }
    // bras : balancement, bras levés pendant le cri, repliés au repos
    for (const ar of g.arms) {
      const a = -Math.sin(seedT * 1.3 + ar.side) * 0.1 - (state === 'roar' ? 0.4 : 0) + (moving ? Math.sin(phase + (ar.side > 0 ? 0 : Math.PI)) * 0.12 : 0) + (rest ? 0.25 : 0);
      rz[ar.ids[0]] = a;
      rz[ar.ids[1]] = a * 0.6 - (state === 'eat' ? 0.2 : 0) - (rest ? 0.3 : 0);
      if (state === 'roar') rx[ar.ids[0]] = -ar.side * 0.35 * pz.roarK; // ailes ou bras écartés
    }
  }

  function poseAir(sk, pz, ry, rz, rx) {
    const g = sk.groups, ph = pz.phase, flapping = !!ph;
    const f0 = flapping ? Math.sin(ph) * 0.42 : 0.05 + Math.sin(pz.t * 0.9 + pz.seed) * 0.03;
    const f1 = flapping ? Math.sin(ph - 0.7) * 0.16 : -0.04, f2 = flapping ? Math.sin(ph - 1.3) * 0.12 : 0.02;
    for (const w of g.wings) {
      rx[w.ids[0]] = w.side * f0; rx[w.ids[1]] = w.side * f1; rx[w.ids[2]] = w.side * f2;
    }
    // cou et tête : regard de côté, petits mouvements de tête
    const nN = g.neck.length;
    g.neck.forEach((id) => { ry[id] = pz.look * 0.6 / Math.max(1, nN); rz[id] = Math.sin(pz.t * 0.6 + pz.seed) * 0.04; });
    ry[g.head] += pz.look * 0.4; rz[g.head] = Math.sin(pz.t * 1.1 + pz.seed) * 0.08 - (flapping ? Math.sin(ph) * 0.05 : 0);
    // queue (et pattes qui traînent)
    for (const id of g.tail) { rz[id] = (flapping ? -Math.sin(ph) * 0.12 : 0) + Math.sin(pz.t * 0.7) * 0.05; ry[id] = Math.sin(pz.t * 0.5 + pz.seed) * 0.1; }
  }

  function poseWater(sk, pz, ry, rz, rx) {
    const g = sk.groups, ph = pz.phase;
    if (sk.kind === 'plesio') {
      // quatre nageoires : battement vertical, les arrière en décalage
      for (const f of g.flippers) {
        const a = Math.sin(ph * 1.2 + (f.front ? 0 : Math.PI * 0.5)) * (f.front ? 0.5 : 0.4);
        rx[f.ids[0]] = f.side * a; rx[f.ids[1]] = f.side * Math.sin(ph * 1.2 - 0.8 + (f.front ? 0 : Math.PI * 0.5)) * 0.25;
        ry[f.ids[0]] = (f.front ? -1 : 1) * Math.cos(ph * 1.2) * 0.15;
      }
      const nN = g.neck.length, kN = 3 / Math.max(1, nN);
      g.neck.forEach((id, j) => { ry[id] = Math.sin(ph * 0.8 - j * 0.9 * kN) * 0.22 * kN; rz[id] = (0.08 + pz.surf * 0.15) * kN * 0.6; });
      g.tail.forEach((id, j) => { ry[id] = Math.sin(ph * 1.2 - j * 0.8) * 0.12; });
    } else {
      // mosasaure : ondulation de la queue jusqu'à la nageoire caudale
      const nT = g.tail.length, kT = 4 / Math.max(1, nT);
      g.tail.forEach((id, j) => { ry[id] = Math.sin(ph * 1.3 - (j + 1) * 0.9 * kT) * 0.16 * (j + 1.2) * 0.5 * kT; });
      for (const id of g.neck) ry[id] = -Math.sin(ph * 1.3 + 0.6) * 0.06;
      for (const f of g.flippers) {
        const a = Math.sin(ph * 1.3 + (f.front ? 0 : 1.2)) * 0.3;
        rx[f.ids[0]] = f.side * a; rx[f.ids[1]] = f.side * a * 0.5; ry[f.ids[0]] = (f.front ? -1 : 1) * 0.1;
      }
    }
    ry[g.head] += Math.sin(ph * 0.5) * 0.06;
    if (g.jaw != null) rz[g.jaw] = -Math.max(0, Math.sin(ph * 0.31 + pz.seed)) * (sk.kind === 'mosa' ? 0.3 : 0.15);
  }

  const T1 = new Float32Array(16), T2 = new Float32Array(16);
  /* Matrices des os (monde) pour une pose ; root = repère du dinosaure dans le monde. */
  R.skelBones = function (sk, root, pz) {
    const nb = sk.nb, ry = new Float32Array(nb), rz = new Float32Array(nb), rx = new Float32Array(nb);
    if (pz.kind === 'land') poseLand(sk, pz, ry, rz, rx);
    else if (pz.kind === 'air') poseAir(sk, pz, ry, rz, rx);
    else poseWater(sk, pz, ry, rz, rx);
    const L = sk._L || (sk._L = sk.bones.map(() => new Float32Array(16)));
    const out = new Float32Array(G.MAX_BONES * 16);
    for (let i = 0; i < nb; i++) {
      const b = sk.bones[i], m = L[i];
      if (b.parent < 0) {
        M4.ident(m);
        if (pz.kind === 'land') M4.translate(m, 0, pz.hipDy * sk.hipY, 0);
        M4.translate(m, b.p[0], b.p[1], b.p[2]);
        if (pz.hipRot) M4.mul(m, pz.hipRot, m);
      } else {
        M4.copy(L[b.parent], m);
        M4.translate(m, b.p[0], b.p[1], b.p[2]);
      }
      if (ry[i]) M4.rotY(m, ry[i]);
      if (rz[i]) M4.rotZ(m, rz[i]);
      if (rx[i]) M4.rotX(m, rx[i]);
      M4.translate(m, -b.p[0], -b.p[1], -b.p[2]);
      // monde = repère du dinosaure × os ; respiration sur le seul os du corps
      if (b.parent < 0 && pz.breathe) {
        M4.copy(m, T2); M4.translate(T2, b.p[0], b.p[1], b.p[2]); M4.scale(T2, 1, 1 + pz.breathe * 0.012, 1 + pz.breathe * 0.008); M4.translate(T2, -b.p[0], -b.p[1], -b.p[2]);
        M4.mul(root, T2, T1);
      } else M4.mul(root, m, T1);
      out.set(T1, i * 16);
    }
    return out;
  };

  /* Remplace les pièces du pantin (à partir de start) par le modèle animé. */
  R.skelSwap = function (d, out, start, root, pz) {
    if (this._binding) return;
    const sk = this.skelModel(d.sp);
    if (!sk) return;
    const bones = this.skelBones(sk, root, pz);
    out.length = start;
    out.push([sk.mesh, this.ident || (this.ident = M4.create()), bones]);
  };
})();
