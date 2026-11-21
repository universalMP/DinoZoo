/* =====================================================================
   DinoZoo — Squelette ajusté à un modèle 3D (Meshy).
   À partir des seuls sommets du modèle (tête vers +X, pieds à y = 0,
   centré en x et z), on repère les pieds, les hanches, les genoux, les
   chevilles, les épaules et les mains, la ligne du dos, le cou, la tête,
   la mâchoire et la queue (ou les ailes et les nageoires), puis on calcule
   pour chaque sommet ses 4 os principaux et leurs poids.

   Chaque os a un pivot (son articulation) et un parent : l'animation
   (skin3d.js) fait tourner chaque os autour de son pivot.

   Fonctionne dans le navigateur (DZ.rigfit) et sous Node (tests).
   ===================================================================== */
(function () {
  const W = typeof window !== 'undefined' ? window : globalThis;
  W.DZ = W.DZ || {};

  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));
  const P3 = (p) => [p[0], p[1], p[2] || 0];
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2] || 0, b[2] || 0, t)];

  /* Proportions tirées des reconstitutions : longueur de la tête
     (crâne seul) en fraction de la longueur totale, segments de cou et de
     queue, hauteur de la cheville (fraction de la hauteur de hanche). */
  const SPEC = {
    compsognathus: { head: 0.07, neck: 2, tail: 6, ankle: 0.3 },
    dryosaurus: { head: 0.07, neck: 2, tail: 6, ankle: 0.28 },
    psittacosaurus: { head: 0.1, neck: 2, tail: 5, ankle: 0.25 },
    pachycephalosaurus: { head: 0.09, neck: 2, tail: 5, ankle: 0.25 },
    parasaurolophus: { head: 0.11, neck: 3, tail: 6, ankle: 0.18, crest: [1.4, 0.3] },
    triceratops: { head: 0.25, fixedHead: true, neck: 1, tail: 4, ankle: 0.12, crest: [0.5, 0.15] },
    stegosaurus: { head: 0.08, fixedHead: true, neck: 2, tail: 5, ankle: 0.12 },
    ankylosaurus: { head: 0.1, neck: 1, tail: 5, ankle: 0.15 },
    diplodocus: { head: 0.035, neck: 6, tail: 7, ankle: 0.1 },
    brachiosaurus: { head: 0.05, neck: 6, tail: 5, ankle: 0.1 },
    velociraptor: { head: 0.1, neck: 2, tail: 6, ankle: 0.3 },
    dilophosaurus: { head: 0.09, neck: 2, tail: 6, ankle: 0.28 },
    allosaurus: { head: 0.11, neck: 2, tail: 6, ankle: 0.27 },
    carnotaurus: { head: 0.08, neck: 2, tail: 6, ankle: 0.28 },
    spinosaurus: { head: 0.12, neck: 3, tail: 6, ankle: 0.22 },
    trex: { head: 0.12, neck: 2, tail: 6, ankle: 0.27 },
    pteranodon: { head: 0.3, neck: 2, tail: 1 },
    quetzalcoatlus: { head: 0.25, neck: 3, tail: 1 },
    plesiosaurus: { head: 0.07, neck: 4, tail: 3 },
    mosasaurus: { head: 0.14, neck: 1, tail: 5 }
  };

  /* ------------------------------------------------------------------
     Outils géométriques
     ------------------------------------------------------------------ */
  function bounds(P) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let k = 0; k < P.length; k++) { const c = k % 3; if (P[k] < lo[c]) lo[c] = P[k]; if (P[k] > hi[c]) hi[c] = P[k]; }
    return { lo, hi };
  }

  /* Profil en tranches le long de x : haut, bas sur la ligne médiane
     (sans les pattes, qui sont sur les côtés), demi-largeur. */
  function profile(P, b, nS) {
    const x0 = b.lo[0], dx = (b.hi[0] - x0) / nS, n = P.length / 3;
    const S = Array.from({ length: nS }, () => ({ top: -1e9, bot: 1e9, w: 0, n: 0, mid: 1e9, wTop: 0 }));
    const si = (x) => clamp(Math.floor((x - x0) / dx), 0, nS - 1);
    for (let k = 0; k < n; k++) {
      const s = S[si(P[k * 3])], y = P[k * 3 + 1], z = Math.abs(P[k * 3 + 2]);
      if (y > s.top) s.top = y; if (y < s.bot) s.bot = y; if (z > s.w) s.w = z; s.n++;
    }
    for (let k = 0; k < n; k++) {
      const s = S[si(P[k * 3])], y = P[k * 3 + 1], z = Math.abs(P[k * 3 + 2]);
      if (z < Math.max(0.3 * s.w, 0.004) && y < s.mid) s.mid = y;
    }
    for (const s of S) { if (s.mid > 1e8) s.mid = s.bot; s.cy = (s.top + s.mid) / 2; s.th = s.top - s.mid; }
    for (let k = 0; k < n; k++) { // largeur du dos (au-dessus du centre) : sans ailes, nageoires ni bras
      const s = S[si(P[k * 3])], y = P[k * 3 + 1], z = Math.abs(P[k * 3 + 2]);
      if (y > s.cy + s.th * 0.15 && z > s.wTop) s.wTop = z;
    }
    // tranches vides : on recopie la voisine
    for (let i = 0; i < nS; i++) if (!S[i].n) { const j = i > 0 ? i - 1 : i + 1; Object.assign(S[i], S[Math.min(nS - 1, j)], { n: 0 }); }
    const at = (x, key) => { const f = clamp((x - x0) / dx - 0.5, 0, nS - 1), i = Math.floor(f), t = f - i; return lerp(S[i][key], S[Math.min(nS - 1, i + 1)][key], t); };
    return { S, at, x0, dx };
  }

  /* Ligne centrale d'un tube (cou, queue) : on part d'une droite entre deux
     points et on la recentre plusieurs fois sur le centre des sommets
     proches, tranche par tranche, perpendiculairement à la courbe. */
  function traceTube(P, a, b, nPts, r0, filter, sliceInit) {
    const n = P.length / 3;
    a = P3(a); b = P3(b);
    let pts = [];
    for (let i = 0; i <= nPts; i++) pts.push(lerp3(a, b, i / nPts));
    // tube plutôt horizontal : départ au centre de chaque tranche verticale
    // (suit une queue qui retombe ou se recourbe, un cou porté bas ou de côté)
    if (sliceInit && Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) * 1.2) {
      const step = Math.abs(b[0] - a[0]) / nPts;
      for (let i = 1; i < nPts; i++) {
        let lo = 1e9, hi = -1e9, sz = 0, c = 0;
        for (let k = 0; k < n; k++) {
          if (filter && !filter(k)) continue;
          if (Math.abs(P[k * 3] - pts[i][0]) > step * 0.6) continue;
          const y = P[k * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; sz += P[k * 3 + 2]; c++;
        }
        if (hi > lo) { pts[i][1] = (lo + hi) / 2; pts[i][2] = sz / c; }
      }
    }
    for (let it = 0; it < 8; it++) {
      const r = r0 * (it < 3 ? 1.6 - it * 0.2 : 1);
      const next = pts.map((p) => p.slice());
      for (let i = 1; i < nPts; i++) {
        const t = [pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1], pts[i + 1][2] - pts[i - 1][2]], tl = Math.hypot(t[0], t[1], t[2]) || 1;
        t[0] /= tl; t[1] /= tl; t[2] /= tl;
        const half = tl / 4 + 1e-4;
        let sx = 0, sy = 0, sz = 0, c = 0;
        for (let k = 0; k < n; k++) {
          if (filter && !filter(k)) continue;
          const dx = P[k * 3] - pts[i][0], dy = P[k * 3 + 1] - pts[i][1], dz = P[k * 3 + 2] - pts[i][2];
          const along = dx * t[0] + dy * t[1] + dz * t[2];
          if (Math.abs(along) > half) continue;
          const px = dx - along * t[0], py = dy - along * t[1], pz = dz - along * t[2];
          if (px * px + py * py + pz * pz > r * r) continue;
          sx += P[k * 3]; sy += P[k * 3 + 1]; sz += P[k * 3 + 2]; c++;
        }
        if (c > 3) { next[i][0] = lerp(pts[i][0], sx / c, 0.7); next[i][1] = lerp(pts[i][1], sy / c, 0.7); next[i][2] = lerp(pts[i][2], sz / c, 0.7); }
      }
      pts = next;
    }
    return pts;
  }

  /* Épaisseur du modèle perpendiculairement à une polyligne, en chaque point. */
  function thickAlong(P, line, rmax) {
    const n = P.length / 3, out = [];
    for (let i = 0; i < line.length; i++) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const t = [b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)], tl = Math.hypot(t[0], t[1], t[2]) || 1; t[0] /= tl; t[1] /= tl; t[2] /= tl;
      const th2 = Math.hypot(t[0], t[1]) || 1, nx = -t[1] / th2, ny = t[0] / th2; // perpendiculaire dans le plan vertical
      const half = tl / 3 + 1e-4;
      let lo = 0, hi = 0;
      for (let k = 0; k < n; k++) {
        const dx = P[k * 3] - line[i][0], dy = P[k * 3 + 1] - line[i][1], dz = P[k * 3 + 2] - (line[i][2] || 0);
        if (Math.abs(dx * t[0] + dy * t[1] + dz * t[2]) > half) continue;
        const pp = dx * nx + dy * ny;
        if (Math.abs(pp) > rmax || Math.abs(dz) > rmax) continue;
        if (pp < lo) lo = pp; if (pp > hi) hi = pp;
      }
      out.push(hi - lo);
    }
    return out;
  }

  /* Articulation crâne-cou : après le point le plus fin du cou, là où
     l'épaisseur remonte vers celle du crâne. Bornée par la longueur de
     tête attendue (fraction de la longueur totale). */
  function findHead(P, line, L, frac) {
    const th = thickAlong(P, line, L * 0.18), m = line.length - 1;
    const dTip = new Array(m + 1).fill(0);
    for (let i = m - 1; i >= 0; i--) dTip[i] = dTip[i + 1] + dist2(line[i], line[i + 1]);
    // le point le plus fin du cou, avant la tête attendue (pas dans le museau)
    let iMin = -1;
    for (let i = Math.round(m * 0.1); i <= m; i++) if (dTip[i] > L * frac * 0.9 && (iMin < 0 || th[i] < th[iMin])) iMin = i;
    if (iMin < 0) return L * frac;
    let hMax = 0; for (let i = iMin; i <= m; i++) if (dTip[i] > L * frac * 0.25) hMax = Math.max(hMax, th[i]);
    let iH = iMin;
    for (let i = iMin; i <= m; i++) if (th[i] >= th[iMin] + (hMax - th[iMin]) * 0.45) { iH = i; break; }
    return clamp(dTip[iH], L * frac * 0.7, L * frac * 2.4);
  }

  /* Ré-échantillonne une polyligne en m segments de même longueur. */
  function resample(pts, m) {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist2(pts[i], pts[i - 1]));
    const tot = L[L.length - 1], out = [];
    for (let j = 0; j <= m; j++) {
      const d = tot * j / m;
      let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
      out.push(lerp3(pts[i - 1], pts[i], t));
    }
    return out;
  }

  /* Projection d'un point (x, y) sur une polyligne : abscisse curviligne et distance. */
  function project(pts, x, y, z) {
    z = z || 0;
    let best = 1e9, bu = 0, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i], az = A[2] || 0, bz = B[2] || 0;
      const vx = B[0] - A[0], vy = B[1] - A[1], vz = bz - az, l2 = vx * vx + vy * vy + vz * vz || 1e-9, seg = Math.sqrt(l2);
      const t = clamp(((x - A[0]) * vx + (y - A[1]) * vy + (z - az) * vz) / l2, 0, 1);
      const d = Math.hypot(x - (A[0] + vx * t), y - (A[1] + vy * t), z - (az + vz * t));
      if (d < best) { best = d; bu = acc + t * seg; }
      acc += seg;
    }
    return { u: bu, d: best, len: acc };
  }
  const projP = (pts, p) => project(pts, p[0], p[1], p[2] || 0);

  /* k-moyennes à 2 groupes sur une valeur. */
  function split2(vals) {
    let a = Math.min(...vals), b = Math.max(...vals);
    for (let it = 0; it < 12; it++) {
      let sa = 0, ca = 0, sb = 0, cb = 0;
      for (const v of vals) { if (Math.abs(v - a) < Math.abs(v - b)) { sa += v; ca++; } else { sb += v; cb++; } }
      if (ca) a = sa / ca; if (cb) b = sb / cb;
    }
    return (a + b) / 2;
  }

  /* ------------------------------------------------------------------
     Construction du squelette
     ------------------------------------------------------------------ */
  function Rig() { this.bones = []; this.groups = {}; }
  Rig.prototype.add = function (name, parent, pivot, end) {
    this.bones.push({ name, parent: parent == null ? -1 : parent, pivot: pivot.slice(), end: (end || pivot).slice() });
    return this.bones.length - 1;
  };

  /* Chaîne de membre : ancre (articulation haute) puis points successifs. */
  function limbChain(rig, parent, pts, names) {
    const ids = [];
    let par = parent;
    for (let i = 0; i < names.length; i++) { par = rig.add(names[i], par, pts[i], pts[i + 1]); ids.push(par); }
    return ids;
  }

  /* Trace une patte de bas en haut : centre des sommets du côté donné, par
     tranches horizontales, en restant près du centre précédent. */
  function traceLeg(P, foot, hipY, sel, r) {
    const n = P.length / 3, steps = 12, pts = [];
    let cx = foot[0], cz = foot[2];
    for (let s = 0; s <= steps; s++) {
      const y = hipY * (0.02 + 0.98 * s / steps), h = hipY / steps * 0.6;
      let sx = 0, sz = 0, c = 0;
      for (let k = 0; k < n; k++) {
        if (!sel(k)) continue;
        const vy = P[k * 3 + 1]; if (Math.abs(vy - y) > h) continue;
        if (Math.hypot(P[k * 3] - cx, P[k * 3 + 2] - cz) > r) continue;
        sx += P[k * 3]; sz += P[k * 3 + 2]; c++;
      }
      if (c > 2) { cx = lerp(cx, sx / c, 0.8); cz = lerp(cz, sz / c, 0.8); }
      pts.push([cx, y, cz]);
    }
    return pts;
  }

  function fitLand(P, id, sp, quad) {
    const b = bounds(P), L = b.hi[0] - b.lo[0], H = b.hi[1], n = P.length / 3;
    const pr = profile(P, b, 72);
    const rig = new Rig();
    rig.kind = quad ? 'quad' : 'biped';
    // --- pieds : sommets les plus bas, séparés gauche / droite (et avant / arrière)
    let lowY = H * 0.035, low = [];
    for (let tries = 0; tries < 4 && low.length < 40; tries++, lowY *= 1.6) { low = []; for (let k = 0; k < n; k++) if (P[k * 3 + 1] < lowY) low.push(k); }
    const xsplit = quad ? split2(low.map((k) => P[k * 3])) : -1e9;
    const feet = [];
    for (const front of quad ? [false, true] : [false]) for (const side of [-1, 1]) {
      let sx = 0, sz = 0, c = 0, tip = -1e9;
      for (const k of low) {
        const x = P[k * 3], z = P[k * 3 + 2];
        if ((z < 0 ? -1 : 1) !== side) continue;
        if (quad && (x > xsplit) !== front) continue;
        sx += x; sz += z; c++; if (x > tip) tip = x;
      }
      if (!c) { sx = front ? b.hi[0] * 0.4 : 0; sz = side * 0.05; c = 1; tip = sx + 0.05; }
      feet.push({ front, side, x: sx / c, z: sz / c, tip });
    }
    // --- hanches et épaules
    const back = feet.filter((f) => !f.front), frontF = feet.filter((f) => f.front);
    const hipX = back.reduce((a, f) => a + f.x, 0) / back.length - L * 0.02;
    const hipCy = pr.at(hipX, 'cy'), hipTh = pr.at(hipX, 'th');
    const hipY = Math.max(H * 0.2, hipCy - hipTh * 0.12);
    const body = rig.add('body', null, [hipX, hipCy, 0]);
    // fin du torse vers l'arrière (base de la queue) : l'épaisseur chute
    let tailBase = hipX - L * 0.08;
    for (let x = hipX; x > b.lo[0] + L * 0.05; x -= L / 200) if (pr.at(x, 'th') < hipTh * 0.62) { tailBase = x; break; }
    // base du cou
    let neckBase;
    if (quad) neckBase = frontF.reduce((a, f) => a + f.x, 0) / frontF.length + L * 0.04;
    else {
      let maxTh = 0; for (let x = hipX; x < hipX + L * 0.25; x += L / 200) maxTh = Math.max(maxTh, pr.at(x, 'th'));
      neckBase = hipX + L * 0.18;
      for (let x = hipX + L * 0.05; x < b.hi[0] - L * sp.head; x += L / 200) if (pr.at(x, 'th') < maxTh * 0.6) { neckBase = x; break; }
    }
    // --- museau : sommet le plus à l'avant près du plan médian
    let tip = null;
    for (let k = 0; k < n; k++) if (P[k * 3 + 1] > H * 0.25 && (!tip || P[k * 3] > tip[0])) tip = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
    // --- cou et tête : tube du haut des épaules jusqu'au museau
    // pivot du cou : au centre de la poitrine chez les quadrupèdes (le cou qui s'abaisse ne plie pas le dos)
    const nbY = pr.at(neckBase, 'cy') + pr.at(neckBase, 'th') * (quad ? -0.05 : 0.1);
    const notLimb = (k) => P[k * 3 + 1] > hipY * 0.55 || P[k * 3] > neckBase + L * 0.06;
    const neckLine = resample(traceTube(P, [neckBase, nbY], tip, 24, Math.max(pr.at(neckBase, 'th') * 0.4, L * 0.03), notLimb), 48);
    const nl = projP(neckLine, tip).len;
    const headLen = Math.min(nl * 0.85, sp.fixedHead ? L * sp.head : findHead(P, neckLine, L, sp.head));
    // point de la ligne à une distance donnée depuis le museau
    const headJ = backFromTip(neckLine, headLen);
    const neckPts = resample(clipLine(neckLine, 0, projP(neckLine, headJ).u), sp.neck);
    // --- queue
    // pointe de la queue : le sommet le plus en arrière (même si la queue se recourbe sur le côté)
    const tailTip = (() => { let t = null; for (let k = 0; k < n; k++) if (!t || P[k * 3] < t[0]) t = [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]; return t; })();
    const tbY = pr.at(tailBase, 'cy');
    const tailLine = resample(traceTube(P, [tailBase, tbY], tailTip, 24, Math.max(pr.at(tailBase, 'th') * 0.55, L * 0.02), (k) => P[k * 3 + 1] > hipY * 0.35 || P[k * 3] < hipX - L * 0.2, true), sp.tail);
    // os axiaux : queue (de la base vers la pointe), cou, tête, mâchoire
    rig.groups.tail = [];
    let par = body;
    for (let i = 0; i < sp.tail; i++) { par = rig.add('tail' + i, par, P3(tailLine[i]), P3(tailLine[i + 1])); rig.groups.tail.push(par); }
    rig.groups.neck = [];
    par = body;
    for (let i = 0; i < sp.neck; i++) { par = rig.add('neck' + i, par, P3(neckPts[i]), P3(neckPts[i + 1])); rig.groups.neck.push(par); }
    const head = rig.add('head', par, P3(headJ), P3(tip));
    rig.groups.head = head;
    // mâchoire : charnière au quart arrière du crâne, sous l'axe
    const headH = headThickness(P, headJ, tip);
    const hinge = lerp3(headJ, tip, 0.22); hinge[1] -= headH * 0.12;
    const jaw = rig.add('jaw', head, hinge, [tip[0], tip[1] - headH * 0.25, tip[2] || 0]);
    rig.groups.jaw = jaw;
    // polyligne axiale complète, de la pointe de la queue au museau
    const axial = tailLine.slice().reverse().concat([[hipX, hipCy]], neckPts.slice(), [tip]);
    const starts = tailLine.slice().reverse().concat(neckPts.slice());
    const axialBones = rig.groups.tail.slice().reverse().concat([body], rig.groups.neck, [head]);
    // --- pattes
    rig.groups.legs = [];
    const legs = [];
    for (const f of feet) {
      const top = f.front ? Math.max(hipY * 0.6, pr.at(f.x, 'cy') - pr.at(f.x, 'th') * 0.15) : hipY;
      const side = f.side;
      const sel = (k) => (P[k * 3 + 2] < 0 ? -1 : 1) === side && (!quad || (P[k * 3] > xsplit) === f.front);
      const legR = Math.max(L * 0.05, (b.hi[2] - b.lo[2]) * 0.25);
      const line = traceLeg(P, [f.x, 0, f.z], top, sel, legR);
      const hipJ = [line[line.length - 1][0], top, Math.sign(side) * Math.max(Math.abs(line[line.length - 1][2]), pr.at(line[line.length - 1][0], 'wTop') * 0.45)];
      const ankY = top * (sp.ankle || 0.2), kneeY = lerp(ankY, top, quad ? 0.5 : 0.55);
      const at = (y) => { const i = clamp(Math.round((y / top - 0.02) / 0.98 * 12), 0, 12); return line[i]; };
      const knee = at(kneeY).slice(), ank = at(ankY).slice();
      knee[1] = kneeY; ank[1] = ankY;
      const toe = [Math.max(f.tip, ank[0]), 0.01 * H, f.z];
      const ids = limbChain(rig, body, [hipJ, knee, ank, toe], ['thigh', 'shin', 'foot'].map((s) => s + (f.front ? 'F' : 'B') + (side < 0 ? 'L' : 'R')));
      legs.push({ front: f.front, side, ids, pts: [hipJ, knee, ank, toe], r: legR, sel });
      rig.groups.legs.push({ front: f.front, side, ids });
    }
    // --- bras (bipèdes)
    rig.groups.arms = [];
    const arms = [];
    if (!quad) {
      for (const side of [-1, 1]) {
        const lg = legs.find((l) => l.side === side);
        // sommets des bras : sous la poitrine (ou hors du torse), devant les cuisses
        const cand = [];
        for (let k = 0; k < n; k++) {
          const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
          if ((z < 0 ? -1 : 1) !== side) continue;
          if (x < hipX + L * 0.06 || x > headJ[0] - L * 0.01 || y < hipY * 0.12) continue;
          const mid = pr.at(x, 'mid'), th = pr.at(x, 'th');
          if (x > headJ[0] - L * 0.04 || y > pr.at(x, 'cy')) continue;
          const below = y < mid - th * 0.02, outside = Math.abs(z) > Math.max(pr.at(x, 'wTop') * 1.6, pr.at(x, 'w') * 0.85);
          if (!below && !outside) continue;
          if (lg && y < lg.pts[0][1] + hipTh * 0.1) { const lp = traceAt(lg.pts, y); if (Math.hypot(x - lp[0], z - lp[2]) < lg.r * 1.3) continue; }
          cand.push(k);
        }
        if (cand.length < 8) continue;
        // épaule : au-dessus du point d'attache (les sommets candidats les plus hauts)
        const byY = cand.slice().sort((a, c) => P[c * 3 + 1] - P[a * 3 + 1]).slice(0, Math.max(4, cand.length * 0.12 | 0));
        let ax = 0; for (const k of byY) ax += P[k * 3] / byY.length;
        const shY = Math.min(pr.at(ax, 'cy'), P[byY[0] * 3 + 1] + pr.at(ax, 'th') * 0.06);
        const sh = [ax - L * 0.01, shY, side * pr.at(ax, 'wTop') * 0.7];
        const far = cand.map((k) => [Math.hypot(P[k * 3] - sh[0], P[k * 3 + 1] - sh[1], P[k * 3 + 2] - sh[2]), k]).sort((a, c) => c[0] - a[0]);
        const top = far.slice(0, Math.max(3, Math.round(far.length * 0.04)));
        const hand = [0, 0, 0];
        for (const [, k] of top) { hand[0] += P[k * 3] / top.length; hand[1] += P[k * 3 + 1] / top.length; hand[2] += P[k * 3 + 2] / top.length; }
        if (Math.hypot(hand[0] - sh[0], hand[1] - sh[1]) < L * 0.025) continue;
        const elbow = [lerp(sh[0], hand[0], 0.45) - L * 0.008, lerp(sh[1], hand[1], 0.5), lerp(sh[2], hand[2], 0.5)];
        const ids = limbChain(rig, body, [sh, elbow, hand], ['arm' + (side < 0 ? 'L' : 'R'), 'fore' + (side < 0 ? 'L' : 'R')]);
        arms.push({ side, ids, pts: [sh, elbow, hand], len: Math.hypot(hand[0] - sh[0], hand[1] - sh[1], hand[2] - sh[2]), cand: new Set(cand) });
        rig.groups.arms.push({ side, ids });
      }
    }
    // --- poids
    const crestLine = sp.crest ? { y: headJ[1] + headH * sp.crest[1], x: headJ[0] - headLen * sp.crest[0] } : null;
    const hdir = [tip[0] - headJ[0], tip[1] - headJ[1], (tip[2] || 0) - (headJ[2] || 0)], hl = Math.hypot(hdir[0], hdir[1], hdir[2]) || 1;
    rig.weights = weigh(P, rig, axial, starts, axialBones, {
      jaw: { id: jaw, head, hinge, tip, headH },
      headPlane: { id: head, p: headJ, d: [hdir[0] / hl, hdir[1] / hl, hdir[2] / hl], len: hl },
      limb: (k, x, y, z, add) => {
        for (const lg of legs) {
          if (!lg.sel(k)) continue;
          const [hp, kn, an, to] = lg.pts;
          if (y > hp[1] + hipTh * 0.05) continue;
          const line = traceAt(lg.pts, y);
          const d = Math.hypot(x - line[0], z - line[2]);
          const r = lg.r * (y < kn[1] ? 0.9 : 1.25);
          if (d > r) continue;
          // pas le ventre ni la queue : seulement près de la patte
          const m = (1 - sm(hp[1] - (hp[1] - kn[1]) * 0.6, hp[1] + hipTh * 0.05, y)) * (1 - sm(r * 0.75, r, d));
          if (m <= 0) continue;
          // os de la patte selon la hauteur, fondu aux articulations
          const bw = (hp[1] - kn[1]) * 0.18, bw2 = (kn[1] - an[1]) * 0.2;
          const wFoot = 1 - sm(an[1] - bw2 * 0.6, an[1] + bw2 * 0.6, y), wShin = (1 - wFoot) * (1 - sm(kn[1] - bw, kn[1] + bw, y));
          const wThigh = 1 - wFoot - wShin;
          add(lg.ids[0], m * wThigh); add(lg.ids[1], m * wShin); add(lg.ids[2], m * wFoot);
          return m;
        }
        for (const ar of arms) {
          if ((z < 0 ? -1 : 1) !== ar.side) continue;
          const [sh, el, ha] = ar.pts;
          const vx = ha[0] - sh[0], vy = ha[1] - sh[1], vz = ha[2] - sh[2], l2 = vx * vx + vy * vy + vz * vz || 1e-9;
          const t = ((x - sh[0]) * vx + (y - sh[1]) * vy + (z - sh[2]) * vz) / l2;
          if (t < 0.1 || t > 1.25) continue;
          const px = sh[0] + vx * t, py = sh[1] + vy * t, pz = sh[2] + vz * t;
          const d = Math.hypot(x - px, y - py, z - pz), r = Math.max(ar.len * 0.32, L * 0.012);
          if (d > r) continue;
          // hors du torse seulement
          if (!ar.cand.has(k) && (t < 0.3 || Math.abs(z) < pr.at(x, 'wTop') * 0.8)) continue;
          const m = sm(0.05, 0.3, t) * (1 - sm(r * 0.7, r, d));
          const wF = sm(0.45, 0.6, t);
          add(ar.ids[0], m * (1 - wF)); add(ar.ids[1], m * wF);
          return m;
        }
        return 0;
      },
      crest: crestLine && ((x, y) => y > crestLine.y && x > crestLine.x && x < headJ[0] + headLen * 0.3)
    });
    rig.dims = { L, H, hipY, hipX, headLen, headH, tip, tail: tailTip };
    return rig;
  }

  /* Point d'une patte (polyligne de hanche à orteil) à la hauteur y. */
  function traceAt(pts, y) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y <= a[1] && y >= b[1]) { const t = (a[1] - y) / ((a[1] - b[1]) || 1); return [lerp(a[0], b[0], t), y, lerp(a[2], b[2], t)]; }
    }
    return y > pts[0][1] ? pts[0] : pts[pts.length - 1];
  }

  function pointAt(line, d) {
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      const seg = dist2(line[i], line[i - 1]);
      if (acc + seg >= d) { const t = (d - acc) / (seg || 1); return lerp3(line[i - 1], line[i], t); }
      acc += seg;
    }
    return line[line.length - 1].slice();
  }
  /* Point de la ligne situé (à vol d'oiseau) à la distance d du dernier point. */
  function backFromTip(line, d) {
    const tip = line[line.length - 1];
    for (let i = line.length - 2; i >= 0; i--) {
      const di = dist2(line[i], tip);
      if (di >= d) { const dj = dist2(line[i + 1], tip), t = (d - dj) / ((di - dj) || 1); return lerp3(line[i + 1], line[i], t); }
    }
    return line[0].slice();
  }
  function clipLine(line, u0, u1) {
    const out = [pointAt(line, u0)];
    let acc = 0;
    for (let i = 1; i < line.length; i++) { acc += dist2(line[i], line[i - 1]); if (acc > u0 && acc < u1) out.push(line[i].slice()); }
    out.push(pointAt(line, u1));
    return out;
  }
  function headThickness(P, a, b) {
    let lo = 1e9, hi = -1e9; const n = P.length / 3, mx = (a[0] + b[0]) / 2, w = Math.abs(b[0] - a[0]) * 0.2 + 1e-3;
    for (let k = 0; k < n; k++) if (Math.abs(P[k * 3] - mx) < w && Math.abs(P[k * 3 + 1] - (a[1] + b[1]) / 2) < Math.abs(b[0] - a[0])) { lo = Math.min(lo, P[k * 3 + 1]); hi = Math.max(hi, P[k * 3 + 1]); }
    return hi > lo ? hi - lo : Math.abs(b[0] - a[0]) * 0.4;
  }

  /* ------------------------------------------------------------------
     Poids : chaîne axiale (queue → corps → cou → tête) le long de la
     ligne centrale, puis membres, puis mâchoire.
     ------------------------------------------------------------------ */
  function weigh(P, rig, axial, starts, axialBones, o) {
    const n = P.length / 3, J = new Uint8Array(n * 4), Wt = new Float32Array(n * 4);
    // abscisse du début de chaque os le long de la ligne axiale
    const joints = starts.map((p) => projP(axial, p).u);
    const total = projP(axial, axial[axial.length - 1]).len;
    joints.push(total);
    const acc = new Map();
    const add = (b, w) => { if (w > 1e-4) acc.set(b, (acc.get(b) || 0) + w); };
    for (let k = 0; k < n; k++) {
      acc.clear();
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      const m = o.limb ? o.limb(k, x, y, z, add) : 0;
      const ma = 1 - m;
      if (ma > 1e-4) {
        let u;
        const hp = o.headPlane, hd = hp ? ((x - hp.p[0]) * hp.d[0] + (y - hp.p[1]) * hp.d[1] + (z - (hp.p[2] || 0)) * hp.d[2]) / hp.len : -1;
        const iHead = hp ? axialBones.indexOf(hp.id) : -1;
        if ((o.crest && o.crest(x, y)) || hd > 0.06) u = joints[iHead] + 1e-3;
        else { u = project(axial, x, y, z).u; if (hp && u > joints[iHead] && hd < -0.06) u = joints[iHead] - 1e-3; }
        // os dont l'intervalle contient u, avec fondu aux articulations
        let i = 0; while (i < axialBones.length - 1 && u > joints[i + 1]) i++;
        const a0 = joints[i], a1 = joints[i + 1];
        // fondu aux articulations : large (pas de pli quand le cou ou la queue pivote)
        const bl = (l0, l1) => Math.min(Math.max(Math.min(l0, l1) * 0.5, total * 0.03), Math.min(l0, l1) * 0.9);
        const blendA = i > 0 ? bl(a1 - a0, joints[i] - joints[i - 1]) : 0;
        const blendB = i < axialBones.length - 1 ? bl(a1 - a0, joints[i + 2] - a1) : 0;
        let w = 1, wPrev = 0, wNext = 0;
        if (blendA > 0 && u < a0 + blendA) { wPrev = 0.5 * (1 - sm(a0 - blendA, a0 + blendA, u)); }
        if (blendB > 0 && u > a1 - blendB) { wNext = 0.5 * sm(a1 - blendB, a1 + blendB, u); }
        w = 1 - wPrev - wNext;
        let bone = axialBones[i];
        // mâchoire : sous la ligne de la bouche, en avant de la charnière
        if (o.jaw && bone === o.jaw.head && wNext === 0) {
          const j = o.jaw, t = clamp((x - j.hinge[0]) / ((j.tip[0] - j.hinge[0]) || 1), 0, 1);
          const mouthY = lerp(j.hinge[1], j.tip[1] - j.headH * 0.08, t);
          const fJaw = x > j.hinge[0] - j.headH * 0.15 ? 1 - sm(mouthY - j.headH * 0.04, mouthY + j.headH * 0.04, y) : 0;
          add(j.id, ma * w * fJaw); add(bone, ma * w * (1 - fJaw));
        } else add(bone, ma * w);
        if (wPrev) add(axialBones[i - 1], ma * wPrev);
        if (wNext) add(axialBones[i + 1], ma * wNext);
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const s = top.reduce((a, e) => a + e[1], 0) || 1;
      for (let j = 0; j < 4; j++) { J[k * 4 + j] = top[j] ? top[j][0] : 0; Wt[k * 4 + j] = top[j] ? top[j][1] / s : 0; }
    }
    return { J, W: Wt };
  }

  /* ------------------------------------------------------------------
     Volants (vue de dessus, ailes selon z)
     ------------------------------------------------------------------ */
  function fitPtero(P, id, sp) {
    const b = bounds(P), L = b.hi[0] - b.lo[0], n = P.length / 3;
    const span = Math.max(-b.lo[2], b.hi[2]);
    const pr = profile(P, b, 60);
    const rig = new Rig(); rig.kind = 'ptero';
    // corps : largeur du dos près du centre
    let bodyW = 0; for (let x = b.lo[0] + L * 0.3; x < b.lo[0] + L * 0.7; x += L / 100) bodyW = Math.max(bodyW, pr.at(x, 'wTop'));
    bodyW = clamp(bodyW, span * 0.04, span * 0.2);
    // épaule : abscisse moyenne du bord d'attaque des ailes près du corps
    let sx = 0, c = 0;
    for (let k = 0; k < n; k++) { const z = Math.abs(P[k * 3 + 2]); if (z > bodyW * 1.5 && z < bodyW * 3) { sx += P[k * 3]; c++; } }
    const shX = c ? sx / c : b.lo[0] + L * 0.55;
    const cy = pr.at(shX, 'cy');
    const body = rig.add('body', null, [shX, cy, 0]);
    let tip = null; for (let k = 0; k < n; k++) if (Math.abs(P[k * 3 + 2]) < bodyW && (!tip || P[k * 3] > tip[0])) tip = [P[k * 3], P[k * 3 + 1]];
    let tail = null; for (let k = 0; k < n; k++) if (Math.abs(P[k * 3 + 2]) < bodyW && (!tail || P[k * 3] < tail[0])) tail = [P[k * 3], P[k * 3 + 1]];
    const headLen = (tip[0] - shX) * sp.head * 2.2;
    const midline = (k) => Math.abs(P[k * 3 + 2]) < bodyW * 1.2;
    const line = resample(traceTube(P, [shX + bodyW, cy], tip, 20, bodyW * 1.2, midline), 40);
    const tot = projP(line, tip).len;
    const headJ = backFromTip(line, Math.min(tot * 0.7, headLen));
    const neckPts = resample(clipLine(line, 0, projP(line, headJ).u), sp.neck);
    rig.groups.neck = []; let par = body;
    for (let i = 0; i < sp.neck; i++) { par = rig.add('neck' + i, par, P3(neckPts[i]), P3(neckPts[i + 1])); rig.groups.neck.push(par); }
    const head = rig.add('head', par, P3(headJ), P3(tip)); rig.groups.head = head;
    const hipX = lerp(shX, tail[0], 0.45);
    const tailB = rig.add('tail0', body, [hipX, pr.at(hipX, 'cy'), 0], P3(tail)); rig.groups.tail = [tailB];
    // ailes : trois os par côté (bras, avant-bras, doigt) le long de |z|
    rig.groups.wings = [];
    const zs = [bodyW * 0.9, lerp(bodyW, span, 0.32), lerp(bodyW, span, 0.58), span];
    const wingX = (z0, z1) => { let s = 0, c2 = 0, mx = -1e9; for (let k = 0; k < n; k++) { const z = Math.abs(P[k * 3 + 2]); if (z >= z0 && z < z1) { s += P[k * 3]; c2++; mx = Math.max(mx, P[k * 3]); } } return c2 ? lerp(s / c2, mx, 0.6) : shX; };
    for (const side of [-1, 1]) {
      const pts = zs.map((z, i) => [i === 0 ? shX : wingX(zs[i - 1], z + 1e-6), cy, side * z]);
      const ids = limbChain(rig, body, pts, ['wing', 'wingFore', 'wingTip'].map((s) => s + (side < 0 ? 'L' : 'R')));
      rig.groups.wings.push({ side, ids, zs });
    }
    const axial = [[tail[0], tail[1]], [hipX, pr.at(hipX, 'cy')]].concat(neckPts.slice(), [tip]);
    const axialBones = [tailB, body].concat(rig.groups.neck, [head]);
    const starts = [[tail[0], tail[1]], [hipX, pr.at(hipX, 'cy')]].concat(neckPts.slice());
    rig.weights = weigh(P, rig, axial, starts, axialBones, {
      limb: (k, x, y, z, add) => {
        const az = Math.abs(z);
        if (az < bodyW * 0.8) return 0;
        const wg = rig.groups.wings[z < 0 ? 0 : 1];
        const m = sm(bodyW * 0.8, bodyW * 1.6, az);
        const b1 = (zs[1] - zs[0]) * 0.25, b2 = (zs[2] - zs[1]) * 0.25;
        const wTip = sm(zs[2] - b2, zs[2] + b2, az), wFore = (1 - wTip) * sm(zs[1] - b1, zs[1] + b1, az), wIn = 1 - wTip - wFore;
        add(wg.ids[0], m * wIn); add(wg.ids[1], m * wFore); add(wg.ids[2], m * wTip);
        return m;
      }
    });
    rig.dims = { L, H: b.hi[1], span, bodyW, tip };
    return rig;
  }

  /* ------------------------------------------------------------------
     Marins : plésiosaure (cou, 4 nageoires, queue) et mosasaure (corps
     ondulant, mâchoire, 4 nageoires, nageoire caudale)
     ------------------------------------------------------------------ */
  function fitMarine(P, id, sp, plesio) {
    const b = bounds(P), L = b.hi[0] - b.lo[0], n = P.length / 3;
    const pr = profile(P, b, 72);
    const rig = new Rig(); rig.kind = plesio ? 'plesio' : 'mosa';
    const W0 = b.hi[2] - b.lo[2];
    let tip = null, tail = null;
    for (let k = 0; k < n; k++) { const z = Math.abs(P[k * 3 + 2]); if (z > W0 * 0.06) continue; if (!tip || P[k * 3] > tip[0]) tip = [P[k * 3], P[k * 3 + 1]]; if (!tail || P[k * 3] < tail[0]) tail = [P[k * 3], P[k * 3 + 1]]; }
    // largeur du dos : le tronc est la partie la plus large au-dessus du centre
    let bx = 0, bw = 0; for (let x = b.lo[0] + L * 0.2; x < b.lo[0] + L * 0.8; x += L / 120) { const w = pr.at(x, 'wTop'); if (w > bw) { bw = w; bx = x; } }
    // nageoires : sommets nettement hors de la largeur du dos
    const flip = (k) => Math.abs(P[k * 3 + 2]) > Math.max(pr.at(P[k * 3], 'wTop') * 1.25, bw * 0.55);
    const fx = []; for (let k = 0; k < n; k++) if (flip(k)) fx.push(P[k * 3]);
    const fsplit = fx.length > 20 ? split2(fx) : bx;
    // tronc : du milieu des nageoires arrière à celui des nageoires avant
    const fr = fx.filter((x) => x > fsplit), bk = fx.filter((x) => x <= fsplit);
    const frX = fr.length ? fr.reduce((a, x) => a + x, 0) / fr.length : bx + L * 0.1;
    const bkX = bk.length ? bk.reduce((a, x) => a + x, 0) / bk.length : bx - L * 0.1;
    const midX = (frX + bkX) / 2;
    const body = rig.add('body', null, [midX, pr.at(midX, 'cy'), 0]);
    const notFlip = (k) => !flip(k);
    const front = resample(traceTube(P, [frX, pr.at(frX, 'cy')], tip, 24, bw * 0.9, notFlip), 48);
    const tot = projP(front, tip).len;
    const headLen = Math.min(tot * 0.8, L * sp.head);
    const headJ = backFromTip(front, headLen);
    const neckPts = resample(clipLine(front, 0, projP(front, headJ).u), sp.neck);
    rig.groups.neck = []; let par = body;
    for (let i = 0; i < sp.neck; i++) { par = rig.add('neck' + i, par, P3(neckPts[i]), P3(neckPts[i + 1])); rig.groups.neck.push(par); }
    const head = rig.add('head', par, P3(headJ), P3(tip)); rig.groups.head = head;
    const headH = headThickness(P, headJ, tip);
    const hinge = lerp3(headJ, tip, 0.15); hinge[1] -= headH * 0.1;
    const jaw = rig.add('jaw', head, hinge, P3(tip)); rig.groups.jaw = jaw;
    const tailLine = resample(traceTube(P, [bkX, pr.at(bkX, 'cy')], tail, 24, bw * 0.9, notFlip, true), sp.tail);
    rig.groups.tail = []; par = body;
    for (let i = 0; i < sp.tail; i++) { par = rig.add('tail' + i, par, P3(tailLine[i]), P3(tailLine[i + 1])); rig.groups.tail.push(par); }
    // nageoires : racine (sommets les plus proches du corps) et pointe (les plus éloignés)
    rig.groups.flippers = [];
    const flips = [];
    for (const isFront of [false, true]) for (const side of [-1, 1]) {
      const ks = []; for (let k = 0; k < n; k++) if (flip(k) && (P[k * 3] > fsplit) === isFront && (P[k * 3 + 2] < 0 ? -1 : 1) === side) ks.push(k);
      if (ks.length < 10) continue;
      ks.sort((a, c) => Math.abs(P[a * 3 + 2]) - Math.abs(P[c * 3 + 2]));
      const avg = (arr) => { const p = [0, 0, 0]; for (const k of arr) for (let c = 0; c < 3; c++) p[c] += P[k * 3 + c] / arr.length; return p; };
      const root = avg(ks.slice(0, Math.max(3, ks.length * 0.08 | 0)));
      root[2] = side * Math.max(Math.abs(root[2]) * 0.85, pr.at(root[0], 'wTop') * 0.9);
      const far = ks.map((k) => [Math.hypot(P[k * 3] - root[0], P[k * 3 + 2] - root[2]), k]).sort((a, c) => c[0] - a[0]);
      const tipF = avg(far.slice(0, Math.max(3, far.length * 0.05 | 0)).map((e) => e[1]));
      const mid = [lerp(root[0], tipF[0], 0.45), lerp(root[1], tipF[1], 0.45), lerp(root[2], tipF[2], 0.45)];
      const ids = limbChain(rig, body, [root, mid, tipF], ['flip', 'flipTip'].map((s) => s + (isFront ? 'F' : 'B') + (side < 0 ? 'L' : 'R')));
      flips.push({ front: isFront, side, ids, root, tipF, len: Math.hypot(tipF[0] - root[0], tipF[2] - root[2]) });
      rig.groups.flippers.push({ front: isFront, side, ids });
    }
    const axial = tailLine.slice().reverse().concat([[midX, pr.at(midX, 'cy')]], neckPts.slice(), [tip]);
    const axialBones = rig.groups.tail.slice().reverse().concat([body], rig.groups.neck, [head]);
    const starts = tailLine.slice().reverse().concat(neckPts.slice());
    const hdir = [tip[0] - headJ[0], tip[1] - headJ[1], (tip[2] || 0) - (headJ[2] || 0)], hl = Math.hypot(hdir[0], hdir[1], hdir[2]) || 1;
    rig.weights = weigh(P, rig, axial, starts, axialBones, {
      jaw: { id: jaw, head, hinge, tip, headH },
      headPlane: { id: head, p: headJ, d: [hdir[0] / hl, hdir[1] / hl, hdir[2] / hl], len: hl },
      limb: (k, x, y, z, add) => {
        if (!flip(k) && Math.abs(z) < pr.at(x, 'wTop') * 1.05) return 0;
        let best = null, bd = 1e9;
        for (const f of flips) { if ((z < 0 ? -1 : 1) !== f.side) continue; const d = Math.hypot(x - f.root[0], z - f.root[2]); if (d < bd && d < f.len * 1.3) { bd = d; best = f; } }
        if (!best) return 0;
        const t = clamp(bd / best.len, 0, 1);
        const m = sm(0.02, 0.2, t) * (flip(k) ? 1 : 0.5);
        const wT = sm(0.38, 0.55, t);
        add(best.ids[0], m * (1 - wT)); add(best.ids[1], m * wT);
        return m;
      }
    });
    rig.dims = { L, H: b.hi[1], tip, headLen, headH };
    return rig;
  }

  /* Point d'entrée : P = positions du modèle (Float32Array, tête vers +X). */
  DZ.rigfit = function (id, P, plan) {
    const sp = SPEC[id] || { head: 0.1, neck: 2, tail: 5, ankle: 0.25 };
    if (plan === 'ptero') return fitPtero(P, id, sp);
    if (plan === 'plesio' || plan === 'mosa') return fitMarine(P, id, sp, plan === 'plesio');
    return fitLand(P, id, sp, plan === 'quad');
  };
  DZ.rigfit.SPEC = SPEC;
})();
