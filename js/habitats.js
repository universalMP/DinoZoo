/* =====================================================================
   DinoZoo — Aménagements des enclos et vie sociale des dinosaures.
   · Passerelles : un pont surélevé (les visiteurs passent dessous) relie
     deux enclos terrestres ; les dinosaures vont et viennent de l'un à
     l'autre quand il y a de la place et pas de prédateur en face.
   · Enclos réunis : deux enclos terrestres qui se touchent n'en forment
     plus qu'un (la clôture commune est démontée).
   · Combats : les mâles adultes d'une même espèce se disputent le
     territoire, surtout chez les espèces territoriales ; le vaincu bat
     en retraite (par une passerelle s'il en a une) et peut être blessé.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const { W, H, TER, idx, inMap, SIZE_RANK } = DZ.GameConst;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const P = DZ.Game.prototype;
  const SIZES = ['S', 'M', 'L'];

  const isLand = (g, b) => b && g.isEnclosure(b) && C.buildings[b.type].kind === 'land';
  /* Distance des coins arrondis : une passerelle s'ouvre sur la partie droite d'un côté. */
  const cornerMargin = (p) => 0.12 + (Math.min(p[2], p[3]) / 2 - 0.12) * 0.55;

  /* ------------------------------------------------------------------
     Passerelles
     ------------------------------------------------------------------ */
  P._rebuildLinks = function () {
    this.linkAt.fill(0);
    for (const id in this.s.links) {
      const l = this.s.links[id];
      for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) if (inMap(x, y)) this.linkAt[idx(x, y)] = l.id;
    }
  };
  P.linksOf = function (b) {
    const out = [];
    if (!b || !this.s.links) return out;
    for (const id in this.s.links) { const l = this.s.links[id]; if (l.a === b.id || l.b === b.id) out.push(l); }
    return out;
  };
  P.linkAtTile = function (x, y) { return inMap(x, y) && this.linkAt[idx(x, y)] ? this.s.links[this.linkAt[idx(x, y)]] : null; };
  P.linkOther = function (l, b) { return this.s.buildings[l.a === b.id ? l.b : l.a]; };
  /* Axe d'une passerelle : u le long, a0/a1 les clôtures, c le milieu en travers. */
  P.linkAxis = function (l) {
    return l.dir === 'x' ? { a0: l.x, a1: l.x + l.w, c: l.y + l.h / 2, c0: l.y, c1: l.y + l.h } : { a0: l.y, a1: l.y + l.h, c: l.x + l.w / 2, c0: l.x, c1: l.x + l.w };
  };
  P.linkCenter = function (l) { const a = this.linkAxis(l), u = (a.a0 + a.a1) / 2; return l.dir === 'x' ? { x: u, y: a.c } : { x: a.c, y: u }; };
  /* Ouvertures dans les clôtures (rampe comprise), en coordonnées de la carte. */
  P.gatesOf = function (b) {
    const out = [], K = C.links;
    for (const l of this.linksOf(b)) {
      const a = this.linkAxis(l), first = l.a === b.id;
      const u0 = first ? a.a0 - K.ramp - 0.3 : a.a1 - 0.6, u1 = first ? a.a0 + 0.6 : a.a1 + K.ramp + 0.3;
      const v0 = a.c0 + 0.05, v1 = a.c1 - 0.05;
      out.push(l.dir === 'x' ? { x0: u0, x1: u1, y0: v0, y1: v1, link: l } : { x0: v0, x1: v1, y0: u0, y1: u1, link: l });
    }
    return out;
  };
  /* Les dinosaures au-dessus des allées font le spectacle. */
  P.linkShow = function () {
    let a = 0;
    for (const id in this.s.links) {
      const l = this.s.links[id];
      if (l.cons || !l.len) continue;
      let over = false;
      for (let y = l.y; y < l.y + l.h && !over; y++) for (let x = l.x; x < l.x + l.w; x++) if (this.isPath(x, y)) { over = true; break; }
      if (!over) continue;
      const A = this.s.buildings[l.a], B = this.s.buildings[l.b];
      if (A && B && (this.dinosIn(A).length || this.dinosIn(B).length)) a += C.links.attraction;
    }
    return a;
  };

  /* Tracé d'une passerelle entre deux enclos : le plus court, bien en face. */
  P.linkPlan = function (aId, bId) {
    const A = this.s.buildings[aId], B = this.s.buildings[bId], K = C.links;
    if (!A || !B || A === B) return { ok: false, reason: 'Choisissez un autre enclos' };
    if (!isLand(this, A) || !isLand(this, B)) return { ok: false, reason: 'Les passerelles relient deux enclos terrestres' };
    if (this.linksOf(A).some((l) => l.a === B.id || l.b === B.id)) return { ok: false, reason: 'Ces enclos sont déjà reliés' };
    let best = null, why = 'Ces enclos ne sont pas face à face';
    const tryPair = (P0, Q, dir, first, second) => {
      // P0 à gauche (dir x) ou au-dessus (dir y) de Q
      const ax = dir === 'x' ? 0 : 1, cx = 1 - ax;
      const gap = Q[ax] - (P0[ax] + P0[ax + 2]);
      if (gap < 0) return;
      // les deux côtés doivent se faire face
      const mP = cornerMargin(P0), mQ = cornerMargin(Q);
      const lo = Math.max(P0[cx] + mP, Q[cx] + mQ), hi = Math.min(P0[cx] + P0[cx + 2] - mP, Q[cx] + Q[cx + 2] - mQ);
      const wdt = K.width;
      const r0min = Math.ceil(lo - 0.3), r0max = Math.floor(hi + 0.3) - wdt;
      if (r0max < r0min) return;
      if (gap > K.maxLen) { why = `Trop loin : ${K.maxLen} cases au maximum`; return; }
      const r0 = U.clamp(Math.round((lo + hi) / 2 - wdt / 2), r0min, r0max);
      const u0 = P0[ax] + P0[ax + 2];
      for (let u = u0; u < u0 + gap; u++) for (let v = r0; v < r0 + wdt; v++) {
        const x = dir === 'x' ? u : v, y = dir === 'x' ? v : u;
        if (!inMap(x, y)) { why = 'Hors de la carte'; return; }
        const k = idx(x, y);
        if (this.terrain[k] === TER.ROCK) { why = 'Terrain rocheux sur le passage'; return; }
        if (this.occ[k]) { why = 'Un bâtiment bloque le passage'; return; }
        if (this.linkAt[k]) { why = 'Une autre passerelle passe ici'; return; }
      }
      const plan = dir === 'x' ? { dir, x: u0, y: r0, w: gap, h: wdt } : { dir, x: r0, y: u0, w: wdt, h: gap };
      plan.len = gap; plan.a = first.id; plan.b = second.id;
      const score = gap + Math.abs((lo + hi) / 2 - (r0 + wdt / 2)) * 0.01;
      if (!best || score < best.score) { plan.score = score; best = plan; }
    };
    for (const pa of DZ.encParts(A)) for (const pb of DZ.encParts(B)) {
      for (const dir of ['x', 'y']) { tryPair(pa, pb, dir, A, B); tryPair(pb, pa, dir, B, A); }
    }
    if (!best) return { ok: false, reason: why };
    best.cost = best.len ? K.base + best.len * K.perTile : Math.round(K.base * K.gateFactor);
    best.hours = this.worksHours(best.cost);
    if (this.s.money < best.cost) return Object.assign(best, { ok: false, reason: 'Fonds insuffisants', plan: true });
    return Object.assign(best, { ok: true });
  };

  /* Enclos que l'on peut relier à b (ou presque : seul l'argent manque). */
  P.linkCandidates = function (b) {
    const out = [];
    if (!isLand(this, b)) return out;
    const K = C.links;
    for (const id in this.s.buildings) {
      const o = this.s.buildings[id];
      if (o === b || !isLand(this, o)) continue;
      if (o.x > b.x + b.w + K.maxLen || b.x > o.x + o.w + K.maxLen || o.y > b.y + b.h + K.maxLen || b.y > o.y + o.h + K.maxLen) continue;
      const p = this.linkPlan(b.id, o.id);
      if (p.ok || p.plan) out.push({ other: o, plan: p });
    }
    return out.sort((p, q) => p.plan.len - q.plan.len);
  };

  P.buildLink = function (aId, bId) {
    const p = this.linkPlan(aId, bId);
    if (!p.ok) return p;
    this._spend(p.cost, 'construction');
    const l = { id: this.s.nextLink++, a: p.a, b: p.b, x: p.x, y: p.y, w: p.w, h: p.h, dir: p.dir, len: p.len, invested: p.cost, cons: { t: 0, dur: p.hours } };
    this.s.links[l.id] = l;
    this._removeTreesIn(l.x, l.y, l.w, l.h);
    this._rebuildLinks();
    const c = this.linkCenter(l);
    this.emit('linkBuilt', l);
    this.emit('mapChanged', { x0: l.x - 3, y0: l.y - 3, x1: l.x + l.w + 3, y1: l.y + l.h + 3 });
    this.playerTask(c.x, c.y, 'build', null);
    return { ok: true, link: l };
  };

  /* Retire une passerelle ; renvoie le remboursement (non versé). */
  P._removeLink = function (l) {
    const refund = Math.round((l.invested || 0) * C.economy.refundRate);
    for (const d of this.s.dinos) if (d.cross && d.cross.l === l.id) this._abortCross(d);
    delete this.s.links[l.id];
    this._rebuildLinks();
    this.emit('linkRemoved', l);
    this.emit('mapChanged', { x0: l.x - 3, y0: l.y - 3, x1: l.x + l.w + 3, y1: l.y + l.h + 3 });
    return refund;
  };
  P.demolishLink = function (id) {
    const l = this.s.links[id];
    if (!l) return { ok: false };
    const refund = this._removeLink(l), c = this.linkCenter(l);
    this._earn(refund, null);
    this._updateHappiness();
    this.playerTask(c.x, c.y, 'demolish', null);
    this.emit('demolished', { x: c.x, y: c.y, refund, link: l });
    return { ok: true, refund };
  };

  P._updateLinkWorks = function (dh) {
    for (const id in this.s.links) {
      const l = this.s.links[id];
      if (!l.cons) continue;
      l.cons.t += dh;
      if (l.cons.t < l.cons.dur) continue;
      delete l.cons;
      this._updateHappiness();
      this.notify('🌉', l.len ? 'Passerelle terminée : les dinosaures peuvent passer d\'un enclos à l\'autre.' : 'Porte terminée : les deux enclos communiquent.', 'good', { type: 'select', building: l.a });
      this.emit('linkDone', l);
      this.emit('mapChanged', { x0: l.x - 3, y0: l.y - 3, x1: l.x + l.w + 3, y1: l.y + l.h + 3 });
    }
  };
  P.linkProgress = function (l) { return l.cons ? U.clamp(l.cons.t / l.cons.dur, 0, 1) : 1; };

  /* ---------- Traversées ---------- */
  /* Enclos voisin où ce dinosaure peut aller (place, habitat, pas de prédateur). */
  P._crossTarget = function (d, b, l) {
    if (l.cons) return null;
    const o = this.linkOther(l, b);
    if (!o || o.cons || !this.habitatOk(d.sp, o)) return null;
    if (this.usedSpace(o) + this.dinoSpace(d) > this.capacity(o)) return null;
    const species = new Set(this.dinosIn(o).map((x) => x.sp));
    for (const dl of this.deliveriesTo(o)) species.add(dl.sp);
    species.add(d.sp);
    if (this._conflictIn(species)) return null;
    // un petit reste près de sa mère
    if (d.young && !this.dinosIn(o).some((x) => x.sp === d.sp && !x.young && x.sex === 'F')) return null;
    return o;
  };
  P._maybeCross = function (d, b, sp) {
    if (sp.habitat !== 'land' || !this.s.links) return false;
    let n = 0;
    for (const id in this.s.links) { const l = this.s.links[id]; if ((l.a === b.id || l.b === b.id) && !l.cons) n++; }
    if (!n) return false;
    const crowded = this.usedSpace(b) > this.capacity(b) * 0.8;
    const p = C.links.crossChance * (crowded ? 1.6 : 1) * (d.young ? 0.6 : 1);
    if (R() > p) return false;
    const ls = this.linksOf(b).filter((l) => !l.cons);
    const l = ls[Math.floor(R() * ls.length)];
    const o = this._crossTarget(d, b, l);
    if (!o) return false;
    this._startCross(d, l, b, o);
    return true;
  };
  P._startCross = function (d, l, from, to) {
    const K = C.links, a = this.linkAxis(l), first = l.a === from.id;
    const c = a.c + rr(-0.25, 0.25);
    const us = first ? [a.a0 - K.ramp - 0.25, a.a0, a.a1, a.a1 + K.ramp + 0.35] : [a.a1 + K.ramp + 0.25, a.a1, a.a0, a.a0 - K.ramp - 0.35];
    const pts = us.map((u) => l.dir === 'x' ? [u, c] : [c, u]);
    d.cross = { l: l.id, pts, i: 0, from: from.id };
    d.enc = to.id;
    d.state = 'walk'; d.timer = 0; d.anim = 0;
    this.emit('dinoCross', { d, l, from, to });
  };
  P._abortCross = function (d) {
    d.cross = null; d.crossK = 0; d.run = 0;
    const b = this.s.buildings[d.enc];
    if (b) { const p = this.randomPointIn(b, d.sp); d.x = p.x; d.y = p.y; d.gx = p.x; d.gy = p.y; }
    d.state = 'idle'; d.timer = 1; d.moving = 0;
  };
  P._updateCrossing = function (d, b, sp, dt) {
    const c = d.cross, l = this.s.links[c.l];
    if (!l) { this._abortCross(d); return; }
    const tgt = c.pts[c.i];
    const dx = tgt[0] - d.x, dy = tgt[1] - d.y, dist = Math.hypot(dx, dy);
    const speed = sp.speed * (d.sick ? 0.5 : 1) * (d.run || 1) * (c.i >= 1 ? 0.85 : 1);
    d.anim += dt;
    d.gx = tgt[0]; d.gy = tgt[1];
    if (dist < 0.05) {
      c.i++;
      if (c.i >= c.pts.length) { d.cross = null; d.crossK = 0; d.state = 'idle'; d.timer = rr(0.5, 2); d.moving = 0; d.run = 0; this.keepInside(d, b, sp); return; }
    } else {
      const st = Math.min(dist, speed * dt);
      d.x += dx / dist * st; d.y += dy / dist * st;
      if (Math.abs(dx) > 0.02) d.face = dx > 0 ? 1 : -1;
      d.moving = speed;
      d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[d.sp].space));
    }
    // hauteur sur la rampe puis sur le tablier (0 au sol, 1 sur le pont)
    if (c.i >= 1 && l.len) {
      const a = this.linkAxis(l), u = l.dir === 'x' ? d.x : d.y, K = C.links;
      d.crossK = Math.min(U.clamp((u - (a.a0 - K.ramp)) / K.ramp, 0, 1), U.clamp((a.a1 + K.ramp - u) / K.ramp, 0, 1));
    } else d.crossK = 0;
  };

  /* ------------------------------------------------------------------
     Enclos réunis
     ------------------------------------------------------------------ */
  /* Longueur du côté commun de deux enclos qui se touchent, et son milieu. */
  P.sharedSide = function (A, B) {
    let best = { len: 0, seam: null };
    for (const p of DZ.encParts(A)) for (const q of DZ.encParts(B)) {
      for (const [m, n] of [[p, q], [q, p]]) {
        if (m[0] + m[2] === n[0]) { // m à gauche de n
          const o0 = Math.max(m[1], n[1]), o1 = Math.min(m[1] + m[3], n[1] + n[3]);
          if (o1 - o0 > best.len) best = { len: o1 - o0, seam: { x: n[0], y: (o0 + o1) / 2, dir: 'v' } };
        }
        if (m[1] + m[3] === n[1]) { // m au-dessus de n
          const o0 = Math.max(m[0], n[0]), o1 = Math.min(m[0] + m[2], n[0] + n[2]);
          if (o1 - o0 > best.len) best = { len: o1 - o0, seam: { x: (o0 + o1) / 2, y: n[1], dir: 'h' } };
        }
      }
    }
    return best;
  };
  P.encSpace = function (b) { return b.space || C.buildings[b.type].space; };
  P.encSize = function (b) { return b.size || C.buildings[b.type].size; };

  P.mergePlan = function (aId, bId) {
    const A = this.s.buildings[aId], B = this.s.buildings[bId], M = C.merge;
    if (!A || !B || A === B) return { ok: false, reason: 'Choisissez un autre enclos' };
    if (!isLand(this, A) || !isLand(this, B)) return { ok: false, reason: 'Seuls les enclos terrestres peuvent être réunis' };
    const sh = this.sharedSide(A, B);
    if (sh.len < M.minShared) return { ok: false, reason: 'Ces enclos ne se touchent pas assez' };
    const level = Math.max(A.level, B.level);
    // l'enclos le moins avancé est mis au niveau de l'autre
    const eq = (e) => { let c = 0; const def = C.buildings[e.type]; for (let L = e.level; L < level; L++) c += def.upgrade[L - 1] * this.sizeFactor(e); return c; };
    const cost = Math.round(M.base + M.perTile * sh.len + eq(A) + eq(B));
    const sa = this.encSpace(A), sb = this.encSpace(B), space = sa + sb;
    const rank = Math.max(SIZE_RANK[this.encSize(A)], SIZE_RANK[this.encSize(B)], space >= 20 ? 3 : space >= 10 ? 2 : 1);
    const plan = {
      ok: true, cost, level, space, size: SIZES[rank - 1], type: sa >= sb ? A.type : B.type,
      parts: DZ.encParts(A).concat(DZ.encParts(B)).map((p) => p.slice()), shared: sh.len, seam: sh.seam,
      hours: this.worksHours(cost), cap: Math.floor(space * C.enclosureLevels.capacity[level - 1])
    };
    if (this.busy(A) || this.busy(B)) return Object.assign(plan, { ok: false, reason: 'Attendez la fin des travaux en cours' });
    if (this.s.money < cost) return Object.assign(plan, { ok: false, reason: 'Fonds insuffisants' });
    return plan;
  };
  P.mergeCandidates = function (b) {
    const out = [];
    if (!isLand(this, b)) return out;
    for (const id in this.s.buildings) {
      const o = this.s.buildings[id];
      if (o === b || !isLand(this, o)) continue;
      if (o.x > b.x + b.w || b.x > o.x + o.w || o.y > b.y + b.h || b.y > o.y + o.h) continue;
      const p = this.mergePlan(b.id, o.id);
      if (p.ok || p.parts) out.push({ other: o, plan: p });
    }
    return out;
  };

  P.mergeEnclosures = function (aId, bId) {
    const p = this.mergePlan(aId, bId);
    if (!p.ok) return p;
    const s = this.s, A = s.buildings[aId], B = s.buildings[bId];
    this._spend(p.cost, 'construction');
    let refund = 0;
    for (const l of this.linksOf(B)) {
      if (l.a === A.id || l.b === A.id) refund += this._removeLink(l); // devenue inutile
      else { if (l.a === B.id) l.a = A.id; if (l.b === B.id) l.b = A.id; }
    }
    if (refund) this._earn(refund, null);
    A.parts = p.parts;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py, pw, ph] of A.parts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + pw); y1 = Math.max(y1, py + ph); }
    A.x = x0; A.y = y0; A.w = x1 - x0; A.h = y1 - y0;
    A.space = p.space; A.size = p.size; A.type = p.type; A.level = p.level;
    A.invested = (A.invested || 0) + (B.invested || 0) + p.cost;
    A.earned = (A.earned || 0) + (B.earned || 0);
    A.breed = A.breed || {};
    for (const sp in B.breed || {}) A.breed[sp] = Math.max(A.breed[sp] || 0, B.breed[sp]);
    A.calm = Object.assign({}, B.calm || {}, A.calm || {});
    for (const d of s.dinos) if (d.enc === B.id) d.enc = A.id;
    for (const dl of s.deliveries) if (dl.enc === B.id) dl.enc = A.id;
    for (const br of s.births) if (br.enc === B.id) br.enc = A.id;
    for (const f of this.fights) if (f.enc === B.id) f.enc = A.id;
    for (const h of this.hunts) if (h.enc === B.id) h.enc = A.id;
    delete s.buildings[B.id];
    this._rebuildOcc();
    A._accV = -1; A._conV = -1;
    A.upg = { t: 0, dur: p.hours, merge: true, seam: p.seam };
    for (const g of this.visitors) if (g.target && (g.target.key === B.id || g.target.key === A.id)) { g.hidden = false; g.state = 'idle'; }
    this._netChanged({ x0: A.x - 2, y0: A.y - 2, x1: A.x + A.w + 2, y1: A.y + A.h + 2 });
    this._updateHappiness();
    this.emit('merged', { b: A, removed: B });
    this.playerTask(p.seam.x, p.seam.y, 'build', A.id);
    return { ok: true, building: A, hours: p.hours };
  };

  /* ------------------------------------------------------------------
     Combats entre mâles adultes
     ------------------------------------------------------------------ */
  const absHour = (s) => s.day * 24 + s.hour;
  /* Mâles adultes d'une même espèce, par espèce (au moins deux). */
  P.rivalsIn = function (b) {
    const bySp = {};
    for (const d of this.s.dinos) {
      if (d.enc !== b.id || d.sex !== 'M' || d.young) continue;
      const sp = DZ.SPECIES[d.sp];
      if (!sp.terr || sp.habitat !== 'land') continue;
      (bySp[d.sp] = bySp[d.sp] || []).push(d);
    }
    for (const k in bySp) if (bySp[k].length < 2) delete bySp[k];
    return bySp;
  };
  /* Pour l'interface : niveau de tension par espèce. */
  P.rivalryInfo = function (b) {
    const out = [];
    const riv = this.rivalsIn(b);
    for (const sp in riv) {
      const t = DZ.SPECIES[sp].terr;
      out.push({ sp, n: riv[sp].length, terr: t, level: t >= 0.7 ? 'forte' : t >= 0.4 ? 'modérée' : 'faible', calm: !!(b.calm && b.calm[sp] > absHour(this.s)), exit: this.linksOf(b).some((l) => !l.cons) });
    }
    return out;
  };
  /* Humeur liée à l'aménagement : place pour se promener, rivaux, coups reçus. */
  P._habitatMood = function (d, b, sp) {
    let h = 0;
    if (sp.habitat === 'land' && this.s.links) for (const id in this.s.links) { const l = this.s.links[id]; if ((l.a === b.id || l.b === b.id) && !l.cons) { h += C.links.happiness; break; } }
    if (d.bruise && this.s.day - d.bruise <= 1) h -= C.fights.bruisePenalty;
    if (d.sex === 'M' && !d.young && sp.terr) {
      let n = 0;
      for (const o of this.s.dinos) if (o.enc === d.enc && o.sp === d.sp && o.sex === 'M' && !o.young) n++;
      if (n >= 2) h -= Math.round(C.fights.rivalryPenalty * sp.terr);
    }
    return h;
  };

  P._checkFights = function (dh) {
    this._fightAcc = (this._fightAcc || 0) + dh;
    if (this._fightAcc < 0.2) return;
    const step = this._fightAcc;
    this._fightAcc = 0;
    const s = this.s, F = C.fights, now = absHour(s);
    if (s.hour < C.time.startHour + 0.3) return;
    for (const id in s.buildings) {
      const b = s.buildings[id];
      if (!isLand(this, b) || b.cons) continue;
      const riv = this.rivalsIn(b);
      for (const sp in riv) {
        if (b.calm && b.calm[sp] > now) continue;
        const males = riv[sp].filter((d) => !d.fight && !d.hunt && !d.cross && !d.sick && d.state !== 'rest');
        if (males.length < 2) continue;
        const terr = DZ.SPECIES[sp].terr;
        const crowd = U.clamp(this.usedSpace(b) / Math.max(1, this.capacity(b)) - 0.6, 0, 0.5) * 2;
        const females = this.dinosIn(b).some((d) => d.sp === sp && d.sex === 'F' && !d.young);
        const hap = males.reduce((a, d) => a + d.happiness, 0) / males.length;
        let rate = F.rate * terr * terr * (males.length - 1) * (1 + crowd) * (females ? 1.4 : 0.8) * (hap < 50 ? 1.4 : 1);
        if (this.linksOf(b).some((l) => !l.cons)) rate *= 0.75;
        if (R() < rate * step) this._startFight(b, sp, males);
      }
    }
  };

  P._startFight = function (b, sp, males) {
    const A = males[Math.floor(R() * males.length)];
    let B = null, bd = 1e9;
    for (const m of males) if (m !== A) { const dd = Math.hypot(m.x - A.x, m.y - A.y); if (dd < bd) { bd = dd; B = m; } }
    if (!B) return null;
    return this._startDuel(b, A, B, false);
  };
  /* Duel entre deux dinosaures : deux mâles rivaux, ou deux prédateurs d'espèces différentes. */
  P._startDuel = function (b, A, B, mixed) {
    const sp = A.sp, spec = DZ.SPECIES[sp], specB = DZ.SPECIES[B.sp];
    const len = ((spec.len || 1.5) + (specB.len || 1.5)) / 2, sep = len * ({ butt: 0.8, bite: 0.72, tail: 0.78 }[spec.fight] || 0.68);
    let mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const sh = DZ.encShape(b), margin = this.shapeMargin(b, spec) * 0.6 + sep / 2;
    if (DZ.encSDF(b, mx, my, sh) > -margin) {
      // un coin dégagé pour s'affronter
      let best = null;
      for (let k = 0; k < 30 && !best; k++) { const p = this.randomPointIn(b, sp); if (DZ.encSDF(b, p.x, p.y, sh) < -margin) best = p; }
      if (best) { mx = best.x; my = best.y; }
    }
    let ux = B.x - A.x, uy = B.y - A.y;
    const ul = Math.hypot(ux, uy);
    if (ul < 0.01) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
    const f = { enc: b.id, sp, mixed, a: A, b: B, phase: 'approach', t: 0, pa: [mx - ux * sep / 2, my - uy * sep / 2], pb: [mx + ux * sep / 2, my + uy * sep / 2], hits: 0 };
    for (const d of [A, B]) { d.fight = f; d.cross = null; d.crossK = 0; d.run = 0; d.state = 'walk'; d.anim = 0; }
    this.fights.push(f);
    this.emit('fightStart', f);
    return f;
  };

  function face(A, B) {
    A.look = Math.atan2(B.y - A.y, B.x - A.x);
    B.look = A.look + Math.PI;
    A.face = Math.cos(A.look) >= 0 ? 1 : -1;
    B.face = Math.cos(B.look) >= 0 ? 1 : -1;
  }

  P._updateFights = function (dt) {
    for (const f of this.fights.slice()) {
      const A = f.a, B = f.b, b = this.s.buildings[f.enc];
      const ok = b && this.s.dinos.includes(A) && this.s.dinos.includes(B) && A.enc === f.enc && B.enc === f.enc;
      if (!ok) { this._endFight(f); continue; }
      const sp = DZ.SPECIES[f.sp], space = C.dinos[f.sp].space;
      f.t += dt;
      if (f.phase === 'approach') {
        let done = true;
        for (const [d, tg] of [[A, f.pa], [B, f.pb]]) {
          const dx = tg[0] - d.x, dy = tg[1] - d.y, dist = Math.hypot(dx, dy);
          if (dist > 0.06) {
            done = false;
            const st = Math.min(dist, sp.speed * 1.2 * dt);
            d.x += dx / dist * st; d.y += dy / dist * st;
            d.gx = tg[0]; d.gy = tg[1]; d.moving = sp.speed; d.state = 'walk';
            d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(space));
            if (Math.abs(dx) > 0.02) d.face = dx > 0 ? 1 : -1;
          } else { d.moving = 0; d.state = 'idle'; }
        }
        if (done || f.t > 6) {
          f.phase = 'threat'; f.t = 0;
          face(A, B);
          for (const d of [A, B]) { d.moving = 0; d.state = 'roar'; d.anim = 0; }
          this.emit('roar', A);
        }
      } else if (f.phase === 'threat') {
        face(A, B);
        A.anim += dt; B.anim += dt;
        if (f.t > 1.3 && !f.answered) { f.answered = true; B.anim = 0; this.emit('roar', B); }
        if (f.t > 2.8) {
          f.phase = 'clash'; f.t = 0; f.dur = rr(3.5, 6);
          f.base = [[A.x, A.y], [B.x, B.y]];
          for (const d of [A, B]) { d.state = 'fight'; d.anim = 0; }
        }
      } else if (f.phase === 'clash') {
        const w = 7, k = Math.sin(f.t * w - Math.PI / 2), lunge = Math.max(0, k);
        const amp = (sp.len || 1.5) * 0.065;
        const ux = f.base[1][0] - f.base[0][0], uy = f.base[1][1] - f.base[0][1], ul = Math.hypot(ux, uy) || 1;
        const nx = ux / ul, ny = uy / ul, jost = Math.sin(f.t * 3.1) * 0.05;
        A.x = f.base[0][0] + nx * lunge * amp - ny * jost; A.y = f.base[0][1] + ny * lunge * amp + nx * jost;
        B.x = f.base[1][0] - nx * lunge * amp - ny * jost; B.y = f.base[1][1] - ny * lunge * amp + nx * jost;
        A.fightK = B.fightK = lunge; A.anim += dt; B.anim += dt;
        const hit = Math.floor((f.t * w) / (Math.PI * 2));
        if (hit > f.hits) { f.hits = hit; this.emit('clash', { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, sp: f.sp, f }); }
        if (f.t > f.dur) this._resolveFight(f, b);
      }
    }
  };

  P._resolveFight = function (f, b) {
    const s = this.s, F = C.fights, sp = DZ.SPECIES[f.sp];
    // entre espèces différentes, le plus grand l'emporte presque toujours
    const score = f.mixed ? (d) => C.dinos[d.sp].space * 25 + d.happiness * 0.3 + R() * 30 : (d) => d.happiness + (d.upCare ? 10 : 0) + (d.upHab ? 5 : 0) + R() * 45;
    const win = score(f.a) >= score(f.b) ? f.a : f.b, lose = win === f.a ? f.b : f.a;
    this._endFight(f);
    b.calm = b.calm || {};
    if (f.mixed) { win.sated = absHour(s) + C.predation.duelCalm; lose.sated = win.sated; }
    else b.calm[f.sp] = absHour(s) + F.calmHours;
    lose.bruise = s.day;
    // le vainqueur rugit, le vaincu bat en retraite
    win.state = 'roar'; win.anim = 0; win.timer = 1.8;
    this.emit('roar', win);
    let fled = false;
    const ls = this.linksOf(b).filter((l) => !l.cons);
    for (const l of ls) { const o = this._crossTarget(lose, b, l); if (o) { this._startCross(lose, l, b, o); lose.run = 1.7; fled = true; break; } }
    if (!fled) {
      let best = null, bd = -1;
      for (let k = 0; k < 8; k++) { const p = this.randomPointIn(b, lose.sp); const dd = Math.hypot(p.x - win.x, p.y - win.y); if (dd > bd) { bd = dd; best = p; } }
      lose.state = 'walk'; lose.gx = best.x; lose.gy = best.y; lose.timer = 0; lose.run = 1.7; lose.anim = 0;
    }
    // blessures
    let hurt = null;
    const terr = f.mixed ? 0.9 : sp.terr;
    if (R() < F.injury * terr) hurt = lose;
    else if (R() < F.injury * terr * 0.2) hurt = win;
    if (hurt && !hurt.sick) { hurt.sick = true; hurt.injured = 1; hurt.sickDays = 0; }
    else hurt = null;
    // les visiteurs qui regardent n'en perdent pas une miette
    for (const g of this.visitors) if (g.actBuilding === b.id && g.state === 'act') { g.sat = Math.min(100, g.sat + 6); g.mood = 'ravi'; g.bubbleT = 2.5; }
    this._updateHappiness();
    const fem = (d, m, w) => d.sex === 'F' ? w : m;
    const title = f.mixed ? `Combat entre ${DZ.SPECIES[f.a.sp].name} et ${DZ.SPECIES[f.b.sp].name}` : `Combat de ${sp.name} mâles`;
    if (hurt) {
      this.notify('🩹', `${title} : ${this.who(hurt)} est ${fem(hurt, 'blessé', 'blessée')} ! Soignez-${fem(hurt, 'le', 'la')} (${U.money(this.treatCost(hurt))}) avant ${C.events.sickDaysToDeath} jours.`, 'bad', { type: 'treat', dino: hurt.id });
    } else if (!b.lastFightNote || absHour(s) - b.lastFightNote > F.noticeHours) {
      b.lastFightNote = absHour(s);
      this.notify('⚔️', `${title} ! ${win.name} l'emporte, ${lose.name} ${fled ? 's\'enfuit par la passerelle' : 'bat en retraite'}.`, 'info', { type: 'select', building: b.id });
    }
    this.emit('fight', { b, win, lose, hurt, fled });
  };

  P._endFight = function (f) {
    const i = this.fights.indexOf(f);
    if (i >= 0) this.fights.splice(i, 1);
    for (const d of [f.a, f.b]) if (d.fight === f) {
      d.fight = null; d.fightK = 0; d.look = null;
      if (d.state === 'fight' || d.state === 'roar') { d.state = 'idle'; d.timer = rr(0.5, 1.5); }
      d.moving = 0;
    }
  };

  /* ------------------------------------------------------------------
     Prédation : chasses visibles dans les enclos où un prédateur vit avec
     d'autres espèces. Le prédateur s'approche, charge, la proie s'enfuit
     (par une passerelle si elle peut) ; l'issue dépend de la taille.
     Deux prédateurs d'espèces différentes se disputent le territoire.
     ------------------------------------------------------------------ */
  const preySize = (d) => C.dinos[d.sp].space * (d.young ? 0.5 : 1);
  /* Chance qu'une chasse aboutisse (0 : la proie est trop grande et se défend). */
  P.huntChance = function (pred, prey) {
    const K = C.predation.success, ps = C.dinos[pred.sp].space, qs = preySize(prey);
    let p = qs < ps * 0.75 ? K.smaller : qs <= ps * 1.25 ? K.same : 0;
    if (prey.young) p = Math.max(p, qs <= ps * 2 ? K.baby : K.bigBaby);
    if (p > 0 && prey.sick) p = Math.min(0.95, p + C.predation.sickBonus);
    return p;
  };
  /* Pour l'interface : qui chasse qui dans cet enclos. */
  P.predationInfo = function (b) {
    const out = [], dinos = this.dinosIn(b), seen = new Set();
    for (const pred of dinos) {
      const sp = DZ.SPECIES[pred.sp];
      if (!sp.predator || pred.young) continue;
      for (const prey of dinos) {
        if (prey.sp === pred.sp) continue;
        const key = pred.sp + '>' + prey.sp + (prey.young ? 'y' : '');
        if (seen.has(key)) continue;
        seen.add(key);
        const duel = DZ.SPECIES[prey.sp].predator && !prey.young;
        if (duel && seen.has(prey.sp + '>' + pred.sp)) continue;
        out.push({ pred: pred.sp, prey: prey.sp, young: !!prey.young, duel, chance: duel ? null : this.huntChance(pred, prey), every: 1 / C.predation.rate });
      }
    }
    return out;
  };

  P._checkHunts = function (dh) {
    this._huntAcc = (this._huntAcc || 0) + dh;
    if (this._huntAcc < 0.2) return;
    const step = this._huntAcc;
    this._huntAcc = 0;
    const s = this.s, K = C.predation, now = absHour(s);
    if (s.hour < C.time.startHour + 0.3) return;
    const meal = (s.hour > 9 && s.hour < 10) || (s.hour > 16 && s.hour < 17);
    for (const id in s.buildings) {
      const b = s.buildings[id];
      if (!this.isEnclosure(b) || b.cons) continue;
      if (this.hunts.some((h) => h.enc === b.id)) continue; // une chasse à la fois par enclos
      const dinos = this.dinosIn(b);
      if (!dinos.some((d) => DZ.SPECIES[d.sp].predator)) continue;
      const free = (d) => !d.fight && !d.hunt && !d.cross;
      for (const pred of dinos) {
        const sp = DZ.SPECIES[pred.sp];
        if (!sp.predator || pred.young || pred.sick || !free(pred) || pred.sated > now) continue;
        const targets = dinos.filter((o) => o.sp !== pred.sp && free(o));
        if (!targets.length) continue;
        const rate = K.rate * (meal ? K.meal : 1) * (pred.happiness < 50 ? 1.3 : 1);
        if (R() >= rate * step) continue;
        // il choisit la proie la plus facile, de préférence proche
        let best = null, bs = -1;
        for (const o of targets) {
          const sc = (DZ.SPECIES[o.sp].predator && !o.young ? 0.3 : this.huntChance(pred, o) + 0.08) / (1 + Math.hypot(o.x - pred.x, o.y - pred.y) * 0.08) * (0.7 + R() * 0.6);
          if (sc > bs) { bs = sc; best = o; }
        }
        if (DZ.SPECIES[best.sp].predator && !best.young) { if (sp.habitat === 'land') this._startDuel(b, pred, best, true); }
        else if (sp.habitat === 'land') this._startHunt(b, pred, best);
        else this._quickHunt(b, pred, best);
        break;
      }
    }
  };

  P._startHunt = function (b, pred, prey) {
    const h = { enc: b.id, pred, prey, phase: 'stalk', t: 0 };
    pred.hunt = h; pred.state = 'walk'; pred.anim = 0; pred.run = 0;
    this.hunts.push(h);
    this.emit('huntStart', h);
    return h;
  };

  /* Chasse sous l'eau (lagon) : pas de poursuite à l'écran, l'issue est immédiate. */
  P._quickHunt = function (b, pred, prey) {
    const p = this.huntChance(pred, prey);
    this.emit('splash', prey);
    if (R() < p) this._kill(b, pred, prey);
    else pred.sated = absHour(this.s) + C.predation.missHours;
  };

  P._kill = function (b, pred, prey) {
    const s = this.s, K = C.predation;
    s.dinos = s.dinos.filter((x) => x !== prey);
    for (const f of this.fights.slice()) if (f.a === prey || f.b === prey) this._endFight(f);
    s.rating = U.clamp(s.rating - K.ratingPenalty, 0, 5);
    pred.sated = absHour(s) + K.satedHours;
    // les visiteurs qui regardent : fascinés dans un parc réputé, effrayés sinon
    const fascinated = s.rating >= 3.5;
    for (const g of this.visitors) if (g.actBuilding === b.id && g.state === 'act') {
      g.sat = U.clamp(g.sat + (fascinated ? 3 : -K.watchFear), 0, 100); g.mood = fascinated ? 'ravi' : 'peur'; g.bubbleT = 2.5;
    }
    this._updateHappiness();
    const ps = DZ.SPECIES[pred.sp];
    this.notify('🦴', `Drame dans l'enclos : ${pred.name}, ${ps.name === 'Tyrannosaurus rex' ? 'le T-Rex' : DZ.leSp(pred.sp)}, a attrapé ${this.who(prey)}. Séparez carnivores et herbivores !`, 'bad', { type: 'select', building: b.id });
    this.emit('kill', { b, pred, prey });
    this.emit('dinoRemoved', prey);
  };

  P._updateHunts = function (dt) {
    const s = this.s, K = C.predation;
    for (const h of this.hunts.slice()) {
      const { pred, prey } = h, b = s.buildings[h.enc];
      const ok = b && s.dinos.includes(pred) && s.dinos.includes(prey) && pred.enc === h.enc && prey.enc === h.enc && !prey.fight && !(prey.cross && h.phase === 'stalk');
      if (!ok) { this._endHunt(h); continue; }
      h.t += dt;
      const ps = DZ.SPECIES[pred.sp], qs = DZ.SPECIES[prey.sp];
      const dx = prey.x - pred.x, dy = prey.y - pred.y, dist = Math.hypot(dx, dy) || 0.001;
      const step = (d, tx, ty, v, spc) => {
        const ex = tx - d.x, ey = ty - d.y, l = Math.hypot(ex, ey);
        if (l < 0.03) { d.moving = 0; return true; }
        const st = Math.min(l, v * dt);
        d.x += ex / l * st; d.y += ey / l * st;
        d.gx = tx; d.gy = ty; d.moving = v; d.state = 'walk';
        if (Math.abs(ex) > 0.02) d.face = ex > 0 ? 1 : -1;
        d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[spc].space));
        return false;
      };
      const reach = (ps.len || 1.5) * 0.42 + (qs.len || 1.5) * 0.3;
      if (h.phase === 'stalk') {
        // approche lente, tête basse
        step(pred, prey.x, prey.y, ps.speed * 0.55, pred.sp);
        if (dist < reach + 2.2 || h.t > 7) {
          h.phase = 'charge'; h.t = 0;
          pred.anim = 0;
          this.emit('roar', pred);
          prey.hunt = h; prey.cross = null; prey.crossK = 0;
          // fuite par une passerelle si possible
          for (const l of this.linksOf(b).filter((q) => !q.cons)) {
            const o = this._crossTarget(prey, b, l);
            if (o) { prey.hunt = null; this._startCross(prey, l, b, o); prey.run = 1.9; h.escaped = true; break; }
          }
          if (h.escaped) { this._missHunt(h, b, 'passerelle'); continue; }
          h.flee = this._fleePoint(b, prey, pred);
        }
      } else if (h.phase === 'charge') {
        step(pred, prey.x, prey.y, ps.speed * 2.2, pred.sp);
        pred.run = 2.2;
        if (step(prey, h.flee.x, h.flee.y, qs.speed * 1.8, prey.sp)) h.flee = this._fleePoint(b, prey, pred);
        prey.run = 1.8;
        if (dist < reach) {
          h.phase = 'strike'; h.t = 0;
          face(pred, prey);
          pred.state = 'fight'; prey.state = 'fight'; pred.moving = prey.moving = 0; pred.anim = prey.anim = 0;
          h.base = [[pred.x, pred.y], [prey.x, prey.y]];
          this.emit('clash', { x: (pred.x + prey.x) / 2, y: (pred.y + prey.y) / 2, sp: pred.sp, f: h });
        } else if (h.t > 9) this._missHunt(h, b, 'distancé');
      } else if (h.phase === 'strike') {
        // assaut : bond du prédateur, la proie se débat
        const k = Math.max(0, Math.sin(h.t * 9)), ux = h.base[1][0] - h.base[0][0], uy = h.base[1][1] - h.base[0][1], ul = Math.hypot(ux, uy) || 1;
        pred.x = h.base[0][0] + ux / ul * k * 0.15; pred.y = h.base[0][1] + uy / ul * k * 0.15;
        prey.x = h.base[1][0] + Math.sin(h.t * 13) * 0.04; prey.y = h.base[1][1] + Math.cos(h.t * 11) * 0.04;
        pred.fightK = k; prey.fightK = 1 - k; pred.anim += dt; prey.anim += dt;
        if (h.t > 1.3) {
          const p = this.huntChance(pred, prey);
          if (R() < p) { this._endHunt(h); this._kill(b, pred, prey); pred.state = 'eat'; pred.timer = 6; pred.anim = 0; }
          else this._missHunt(h, b, p > 0 ? 'échappé' : 'défendu');
        }
      }
    }
  };

  /* Point de fuite : le plus loin possible du prédateur. */
  P._fleePoint = function (b, prey, pred) {
    let best = null, bd = -1;
    for (let k = 0; k < 8; k++) { const p = this.randomPointIn(b, prey.sp); const dd = Math.hypot(p.x - pred.x, p.y - pred.y); if (dd > bd) { bd = dd; best = p; } }
    return best;
  };

  /* Chasse ratée : la proie s'enfuit, ou se défend si elle est plus grande. */
  P._missHunt = function (h, b, why) {
    const s = this.s, K = C.predation, { pred, prey } = h, now = absHour(s);
    this._endHunt(h);
    pred.sated = now + K.missHours;
    const fem = (d, m, w) => d.sex === 'F' ? w : m;
    let text = null, hurt = null;
    if (why === 'défendu') {
      // la grande proie charge à son tour : le prédateur peut être blessé
      const ratio = U.clamp(preySize(prey) / C.dinos[pred.sp].space, 1, 3);
      if (R() < K.defendInjury * ratio * 0.6 && !pred.sick) { pred.sick = true; pred.injured = 1; pred.sickDays = 0; hurt = pred; }
      prey.state = 'roar'; prey.anim = 0; prey.timer = 1.8; this.emit('roar', prey);
      pred.bruise = s.day;
      const p = this._fleePoint(b, pred, prey); pred.state = 'walk'; pred.gx = p.x; pred.gy = p.y; pred.timer = 0; pred.run = 1.6;
      text = `${this.who(prey)} a repoussé l'attaque de ${pred.name} !`;
    } else {
      if (why !== 'passerelle') { const p = this._fleePoint(b, prey, pred); prey.state = 'walk'; prey.gx = p.x; prey.gy = p.y; prey.timer = 0; prey.run = 1.8; }
      prey.bruise = s.day;
      text = why === 'passerelle' ? `${this.who(prey)} a échappé à ${pred.name} en filant par la passerelle !` : `${this.who(prey)} a échappé de justesse à ${pred.name} !`;
    }
    this._updateHappiness();
    if (hurt) this.notify('🩹', `${this.who(prey)} se défend : ${this.who(hurt)} est ${fem(hurt, 'blessé', 'blessée')} ! Soignez-${fem(hurt, 'le', 'la')} (${U.money(this.treatCost(hurt))}) avant ${C.events.sickDaysToDeath} jours.`, 'bad', { type: 'treat', dino: hurt.id });
    else if (!b.lastHuntNote || now - b.lastHuntNote > K.noticeHours) { b.lastHuntNote = now; this.notify('⚠️', `${text} Séparez carnivores et herbivores.`, 'info', { type: 'select', building: b.id }); }
    this.emit('huntMiss', { b, pred, prey, why });
  };

  P._endHunt = function (h) {
    const i = this.hunts.indexOf(h);
    if (i >= 0) this.hunts.splice(i, 1);
    for (const d of [h.pred, h.prey]) if (d.hunt === h) {
      d.hunt = null; d.fightK = 0; d.look = null; d.moving = 0;
      if (d.state === 'fight' || d.state === 'walk') { d.state = 'idle'; d.timer = rr(0.4, 1.2); }
      d.run = 0;
    }
  };
})();
