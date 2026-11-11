/* =====================================================================
   DinoZoo — Visites et soins.
   · Passerelles d'observation : un chemin surélevé qui traverse un ou
     plusieurs enclos. Les visiteurs y montent par un escalier à chaque
     bout et regardent les dinosaures d'en haut (meilleure vue).
   · Aires de jeux : balançoires, toboggan, dino à grimper. Les familles
     avec des enfants y passent un moment ; toute la famille est contente.
   · Transferts : une vétérinaire endort le dinosaure, un hélicoptère
     l'emporte dans un filet et le dépose dans son nouvel enclos.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const { W, H, TER, idx, inMap } = DZ.GameConst;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const P = DZ.Game.prototype;
  const ENT = C.map.entrance;
  const ease = (u) => u * u * (3 - 2 * u);

  /* ------------------------------------------------------------------
     Passerelles d'observation
     ------------------------------------------------------------------ */
  /* Tronçons de tablier : { dir, x, y, len, ends: [[x, y], [x, y]], encs }. */
  P.skyRuns = function () {
    if (this._skyV === this.netVersion && this._skyRuns) return this._skyRuns;
    const out = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sv = this.sky[idx(x, y)];
      if (!sv) continue;
      const ax = sv === 1 ? 1 : 0, ay = 1 - ax;
      if (inMap(x - ax, y - ay) && this.sky[idx(x - ax, y - ay)] === sv) continue;
      let n = 0;
      const encs = new Set();
      while (inMap(x + ax * n, y + ay * n) && this.sky[idx(x + ax * n, y + ay * n)] === sv) { encs.add(this.occ[idx(x + ax * n, y + ay * n)]); n++; }
      out.push({ id: idx(x, y), dir: sv === 1 ? 'x' : 'y', x, y, len: n, w: ax ? n : 1, h: ax ? 1 : n, ends: [[x - ax, y - ay], [x + ax * n, y + ay * n]], encs: [...encs].filter((e) => e) });
    }
    this._skyRuns = out; this._skyV = this.netVersion;
    return out;
  };
  P.skyRunAt = function (x, y) {
    if (!inMap(x, y)) return null;
    if (this.sky[idx(x, y)]) return this.skyRuns().find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
    return this.skyRuns().find((r) => r.ends.some((e) => e[0] === x && e[1] === y)) || null;
  };
  /* Case de chemin au pied d'un escalier. */
  P.skyFoot = function (x, y) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inMap(x + dx, y + dy) && this.sky[idx(x + dx, y + dy)] === (dx ? 1 : 2)) return true;
    return false;
  };
  P.skyRunsOver = function (b) { return b ? this.skyRuns().filter((r) => r.encs.includes(b.id)) : []; };
  /* Bande du tablier au-dessus d'un enclos (le décor intérieur l'évite). */
  P.skyRects = function (b) { return this.skyRunsOver(b).map((r) => ({ x0: r.x - 0.2, x1: r.x + r.w + 0.2, y0: r.y - 0.1, y1: r.y + r.h + 0.1, sky: true })); };
  P.skyCost = function (len) { const K = C.skywalk; return Math.round(K.base + K.perTile * len); };
  /* Les dinosaures vus d'en haut attirent davantage (une fois par enclos). */
  P.skyShow = function () {
    const seen = new Set();
    let a = 0;
    for (const r of this.skyRuns()) for (const id of r.encs) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = this.s.buildings[id];
      if (b && this.isConnected(b)) a += this.enclosureAttraction(b) * C.skywalk.attraction;
    }
    return a;
  };

  /* Tracé : en ligne droite d'un bord à l'autre. Les deux clics peuvent être
     sur l'enclos ou à côté ; le tracé s'arrête juste devant les clôtures. */
  P.skyPlan = function (x0, y0, x1, y1) {
    const K = C.skywalk;
    const fail = (reason, extra) => Object.assign({ ok: false, reason }, extra || {});
    if (!inMap(x0, y0) || !inMap(x1, y1)) return fail('Hors de la carte');
    const dir = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 'x' : 'y';
    if (dir === 'x') y1 = y0; else x1 = x0;
    const n = dir === 'x' ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    if (!n) return fail('Cliquez de l\'autre côté de l\'enclos');
    const sx = dir === 'x' ? Math.sign(x1 - x0) : 0, sy = dir === 'y' ? Math.sign(y1 - y0) : 0;
    const at = (k) => [x0 + sx * k, y0 + sy * k];
    const enc = (k) => { const [x, y] = at(k); if (!inMap(x, y)) return null; const b = this.buildingAt(x, y); return b && this.isEnclosure(b) ? b : null; };
    let a = 0;
    if (enc(0)) { while (enc(a) && a > -40) a--; } else { while (a < n && !enc(a + 1)) a++; }
    let e = n;
    if (enc(n)) { while (enc(e) && e < n + 40) e++; } else { while (e > a && !enc(e - 1)) e--; }
    const ends = [at(a), at(e)];
    const plan = { dir, ends, tiles: [], encs: [], len: Math.max(0, e - a - 1) };
    if (e - a < 2 || !enc(a + 1)) return fail('La passerelle doit traverser un enclos', plan);
    const encs = new Set();
    for (let k = a + 1; k < e; k++) {
      const [x, y] = at(k), i = idx(x, y), b = enc(k);
      plan.tiles.push(i);
      if (!b) return fail('La passerelle doit rester au-dessus des enclos, sans interruption', plan);
      const def = C.buildings[b.type];
      if (def.kind === 'air') return fail('Le filet de la volière empêche d\'y faire passer une passerelle', plan);
      if (b.cons) return fail('Enclos encore en construction', plan);
      if (this.sky[i]) return fail('Une passerelle passe déjà ici', plan);
      encs.add(b.id);
    }
    plan.encs = [...encs];
    if (plan.len < 2) return fail('Enclos trop étroit à cet endroit', plan);
    if (plan.len > K.maxLen) return fail(`Trop longue : ${K.maxLen} cases au plus au-dessus des enclos`, plan);
    let extra = 0;
    for (const [x, y] of ends) {
      if (!inMap(x, y)) return fail('Hors de la carte', plan);
      const i = idx(x, y);
      if (this.occ[i]) return fail('Il faut de la place pour l\'escalier au bout de la passerelle', plan);
      if (this.terrain[i] === TER.ROCK) return fail('Rocher au pied de l\'escalier', plan);
      if (this.terrain[i] === TER.WATER) return fail('Pas d\'escalier dans l\'eau', plan);
      if (this.linkAt[i]) return fail('Une passerelle pour dinosaures passe ici', plan);
      if (!this.path[i]) extra += C.path.cost;
    }
    plan.cost = this.skyCost(plan.len) + extra;
    if (this.s.money < plan.cost) return fail('Fonds insuffisants', plan);
    plan.ok = true;
    return plan;
  };

  P.buildSky = function (x0, y0, x1, y1) {
    const p = this.skyPlan(x0, y0, x1, y1);
    if (!p.ok) return p;
    this._spend(p.cost, 'construction');
    const v = p.dir === 'x' ? 1 : 2;
    for (const i of p.tiles) { this.sky[i] = v; this.path[i] = 1; this.litter[i] = 0; }
    for (const [x, y] of p.ends) if (!this.path[idx(x, y)]) this._setPath(x, y);
    const xs = p.ends.map((e) => e[0]), ys = p.ends.map((e) => e[1]);
    this._netChanged({ x0: Math.min(...xs) - 2, y0: Math.min(...ys) - 2, x1: Math.max(...xs) + 2, y1: Math.max(...ys) + 2 });
    for (const id of p.encs) { const b = this.s.buildings[id]; if (b) this.emit('mapChanged', { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h }); }
    this.emit('skyBuilt', p);
    this.playerTask((xs[0] + xs[1]) / 2 + 0.5, (ys[0] + ys[1]) / 2 + 0.5, 'build', null);
    return { ok: true, plan: p };
  };

  /* Retire un tronçon ; renvoie le remboursement. Les visiteurs dessus redescendent. */
  P._removeSky = function (r) {
    const ax = r.dir === 'x' ? 1 : 0, ay = 1 - ax;
    const tiles = [];
    for (let k = 0; k < r.len; k++) tiles.push(idx(r.x + ax * k, r.y + ay * k));
    for (const i of tiles) { this.sky[i] = 0; this.path[i] = 0; this.litter[i] = 0; }
    for (const g of this.visitors) {
      if (!tiles.includes(idx(g.tx, g.ty)) && !(g.nx !== null && tiles.includes(idx(g.nx, g.ny)))) continue;
      const e = r.ends[Math.hypot(g.x - r.ends[0][0], g.y - r.ends[0][1]) < Math.hypot(g.x - r.ends[1][0], g.y - r.ends[1][1]) ? 0 : 1];
      g.tx = e[0]; g.ty = e[1]; g.x = e[0] + 0.5; g.y = e[1] + 0.5; g.nx = null; g.hidden = false;
      if (g.state === 'act') g.state = 'idle';
    }
    this._netChanged({ x0: r.x - 2, y0: r.y - 2, x1: r.x + r.w + 2, y1: r.y + r.h + 2 });
    for (const id of r.encs) { const b = this.s.buildings[id]; if (b) this.emit('mapChanged', { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h }); }
    this.emit('skyRemoved', r);
    return Math.round(this.skyCost(r.len) * C.economy.refundRate);
  };
  P.demolishSky = function (x, y) {
    const r = this.skyRunAt(x, y);
    if (!r) return { ok: false };
    const refund = this._removeSky(r);
    this._earn(refund, null);
    this.emit('demolished', { x: r.x + r.w / 2, y: r.y + r.h / 2, refund });
    return { ok: true, refund };
  };

  /* Un visiteur qui passe au-dessus d'un enclos s'arrête pour regarder. */
  P._skyGlance = function (g, i) {
    if (g.state !== 'walk' || (g.target && g.target.kind === 'exit')) return false;
    const b = this.s.buildings[this.occ[i]];
    if (!b || g.seen.includes(b.id) || this.enclosureAttraction(b) <= 0 || R() > 0.75) return false;
    g.target = { key: b.id, kind: 'enclos' };
    this._skyWatch(g, b);
    return true;
  };
  P._skyWatch = function (g, b) {
    g.state = 'act'; g.actBuilding = b.id; g.hidden = false;
    g.target = { key: b.id, kind: 'enclos' };
    g.view = C.skywalk.view;
    g.actT = rr(0.35, 0.7);
    const i = idx(g.tx, g.ty), cx = g.tx + 0.5, cy = g.ty + 0.5;
    // du côté du dinosaure le plus proche, contre le garde-corps
    let best = null, bd = 1e9;
    for (const d of this.s.dinos) if (d.enc === b.id) { const dd = Math.hypot(d.x - cx, d.y - cy); if (dd < bd) { bd = dd; best = d; } }
    const hz = this.sky[i] === 1;
    const side = best ? Math.sign((hz ? best.y - cy : best.x - cx) || 1) : (R() < 0.5 ? -1 : 1);
    g.standX = hz ? cx + rr(-0.3, 0.3) : cx + side * 0.26;
    g.standY = hz ? cy + side * 0.26 : cy + rr(-0.3, 0.3);
    const dx = best ? best.x - g.standX : (hz ? 0 : side), dy = best ? best.y - g.standY : (hz ? side : 0), l = Math.hypot(dx, dy) || 1;
    g.dirX = dx / l; g.dirY = dy / l;
  };

  /* ------------------------------------------------------------------
     Aires de jeux
     ------------------------------------------------------------------ */
  P.isPlay = function (b) { return !!(b && C.buildings[b.type].play); };
  P._nearestPlay = function (g, here) {
    let best = null, bs = 1e9;
    for (const id in this.s.buildings) {
      const b = this.s.buildings[id];
      if (!this.isPlay(b) || b.cons) continue;
      const d = this.field(b.id)[here];
      if (d < 0) continue;
      const def = C.buildings[b.type];
      const sc = d + (g.played.includes(b.id) ? C.play.again : 0) + (this.kidsAt(b).length >= def.kids[b.level - 1] ? 10 : 0);
      if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  };
  /* Enfants installés sur les jeux : [{ g, m, slot }]. */
  P.kidsAt = function (b) {
    if (!b._kids) b._kids = [];
    b._kids = b._kids.filter((e) => e.g.playing === b.id && e.g.state === 'act');
    return b._kids;
  };
  P._startPlay = function (g, b) {
    const def = C.buildings[b.type], cap = def.kids[b.level - 1];
    g.hidden = false;
    g.playing = b.id;
    g.view = 1;
    g.actT = rr(C.play.hours[0], C.play.hours[1]);
    // les parents restent au bord de l'allée
    const pcs = this.pathCenters(), ci = idx(g.tx, g.ty);
    g.standX = pcs[ci * 2] + g.dirX * 0.22 + (-g.dirY) * rr(-0.3, 0.3);
    g.standY = pcs[ci * 2 + 1] + g.dirY * 0.22 + g.dirX * rr(-0.3, 0.3);
    const list = this.kidsAt(b);
    for (const m of g.members) {
      m.slot = false;
      if (!m.child || list.length >= cap) continue;
      let k = 0;
      while (list.some((e) => e.slot === k)) k++;
      m.slot = true;
      list.push({ g, m, slot: k, t0: R() * 20 });
    }
    this.emit('playStart', { g, b });
  };
  P._endPlay = function (g, b) {
    const def = C.buildings[b.type], lv = b.level - 1;
    const gain = def.fun[lv] * (1 + 0.15 * Math.max(0, g.kids - 1));
    g.sat = Math.min(100, g.sat + gain);
    g.play = rr(0, 10);
    g.played.push(b.id);
    g.mood = 'ravi'; g.bubbleT = 2.5;
  };
  P._stopPlay = function (g) {
    if (!g.playing) return;
    g.playing = 0;
    for (const m of g.members) m.slot = false;
  };

  /* Positions des enfants sur les jeux (repère de l'emprise ; y : hauteur en cases).
     pose : 'walk', 'climb', 'sit' ; ang : direction du regard (0 = vers +z). */
  function loopPath(pts, t) {
    // pts : [[x, y, z, durée, pose]] — la durée est celle du trajet vers le point suivant
    let total = 0;
    for (const p of pts) total += p[3];
    let u = ((t % total) + total) % total;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (u <= a[3]) {
        const k = a[3] ? u / a[3] : 0, e = a[4] === 'sit' ? k * k : k;
        const x = a[0] + (b[0] - a[0]) * e, y = a[1] + (b[1] - a[1]) * e, z = a[2] + (b[2] - a[2]) * e;
        const dx = b[0] - a[0], dz = b[2] - a[2];
        return { x, y, z, ang: Math.abs(dx) + Math.abs(dz) > 0.01 ? Math.atan2(dx, dz) : 0, pose: a[4], k };
      }
      u -= a[3];
    }
    return { x: pts[0][0], y: pts[0][1], z: pts[0][2], ang: 0, pose: 'walk', k: 0 };
  }
  DZ.PLAY = {
    /* Balançoires : un portique, une balançoire par enfant. */
    seats(type, lv) {
      if (type !== 'balancoires') return [];
      const n = C.buildings.balancoires.kids[lv - 1];
      const out = [];
      for (let i = 0; i < n; i++) out.push(0.4 + (1.2 * (i + 0.5)) / n);
      return out;
    },
    swingAngle(i, t, busy) { return busy ? Math.sin(t * 2.6 + i * 1.7) * 0.75 : Math.sin(t * 0.9 + i * 2.1) * 0.05; },
    SWING: { top: 0.86, chain: 0.6, z: 1.0 },
    kidPose(type, lv, slot, t) {
      if (type === 'balancoires') {
        const S = DZ.PLAY.SWING, xs = DZ.PLAY.seats(type, lv), x = xs[slot % xs.length];
        const a = DZ.PLAY.swingAngle(slot, t, true);
        return { x, y: S.top - Math.cos(a) * S.chain, z: S.z + Math.sin(a) * S.chain, ang: 0, pose: 'sit', swing: a };
      }
      if (type === 'toboggan') {
        // échelle derrière, plateforme, glissade vers l'avant, retour à pied
        const p = loopPath([
          [1.0, 0, 2.85, 1.0, 'walk'], [1.65, 0, 2.5, 1.6, 'walk'], [1.6, 0, 0.35, 0.6, 'walk'], [1.0, 0, 0.3, 1.4, 'climb'],
          [1.0, 0.78, 0.45, 0.5, 'walk'], [1.0, 0.78, 0.75, 1.1, 'sit'], [1.0, 0.08, 2.55, 0.4, 'sit']
        ], t + slot * 2.2);
        return p;
      }
      // dino à grimper : filet sur le flanc, promenade sur le dos, glissade sur la queue
      const p = loopPath([
        [2.75, 0, 1.4, 0.8, 'walk'], [2.45, 0, 1.4, 1.6, 'climb'], [1.95, 0.84, 1.45, 0.9, 'walk'], [1.5, 0.88, 1.85, 0.5, 'walk'],
        [1.5, 0.84, 2.05, 1.2, 'sit'], [1.5, 0.08, 2.9, 0.5, 'walk'], [2.2, 0, 2.9, 1.4, 'walk']
      ], t + slot * 1.9);
      return p;
    }
  };

  /* ------------------------------------------------------------------
     Transferts : vétérinaire, anesthésie, hélicoptère
     ------------------------------------------------------------------ */
  P.transferCost = function (d) {
    const K = C.transfer;
    return Math.round((K.base + K.rate * C.dinos[d.sp].price * (d.young ? C.breeding.babyValue : 1)) / 10) * 10;
  };
  P.transferBusy = function (b) { return (this.transfers || []).some((tr) => !tr.landed && (tr.from === b.id || tr.to === b.id)); };
  P.canTransfer = function (d, b) {
    if (!d) return { ok: false, reason: 'Animal introuvable' };
    if (d.tr) return { ok: false, reason: 'Transfert déjà en cours' };
    if (!b || !this.isEnclosure(b)) return { ok: false, reason: 'Choisissez un enclos' };
    if (b.id === d.enc) return { ok: false, reason: 'C\'est déjà son enclos' };
    if (b.cons) return { ok: false, reason: 'Enclos encore en construction' };
    const sp = DZ.SPECIES[d.sp], def = C.buildings[b.type];
    if (!this.habitatOk(d.sp, b)) {
      if (sp.habitat === 'air') return { ok: false, reason: 'Il faut une volière' };
      if (sp.habitat === 'water') return { ok: false, reason: 'Il faut un lagon marin' };
      if (def.kind !== 'land') return { ok: false, reason: 'Il faut un enclos terrestre' };
      return { ok: false, reason: 'Enclos trop petit (' + (sp.size === 'L' ? 'grand' : 'moyen') + ' enclos requis)' };
    }
    if (this.usedSpace(b) + this.dinoSpace(d) > this.capacity(b)) return { ok: false, reason: 'Plus de place dans cet enclos' };
    const cost = this.transferCost(d);
    if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants', cost };
    let rivals = 0;
    if (d.sex === 'M' && !d.young && sp.terr) rivals = this.dinosIn(b).filter((o) => o.sp === d.sp && o.sex === 'M' && !o.young).length;
    return { ok: true, cost, warning: this.wouldConflict(d.sp, b), rivals };
  };

  P.transferDino = function (id, bid) {
    const d = this.s.dinos.find((x) => x.id === id), b = this.s.buildings[bid];
    const c = this.canTransfer(d, b);
    if (!c.ok) return c;
    this._spend(c.cost, 'dinos');
    for (const f of this.fights.slice()) if (f.a === d || f.b === d) this._endFight(f);
    for (const h of this.hunts.slice()) if (h.pred === d || h.prey === d) this._endHunt(h);
    if (d.cross) this._abortCross(d);
    const from = this.s.buildings[d.enc];
    const west = this.layout && this.layout.seaSide === 'W';
    // point de dépose : à découvert (pas sous une passerelle d'observation)
    let tp = this.randomPointIn(b, d.sp);
    for (let k = 0; k < 30 && this.skyNear(tp.x, tp.y, 1.2 + (DZ.SPECIES[d.sp].len || 1.5) * 0.5); k++) tp = this.randomPointIn(b, d.sp);
    const tr = {
      id: (this._trSeq = (this._trSeq || 0) + 1), d, from: from.id, to: b.id, cost: c.cost,
      phase: 'vet', t: 0, hold: false, lift: 0, cable: 0, sleep: 0, landed: false,
      sx: west ? -45 : W + 45, sy: U.clamp(d.y - 30 + R() * 20, -20, H + 20), tx: tp.x, ty: tp.y
    };
    tr.vet = { x: ENT.tileX + 0.5, y: ENT.tileY - 1.5, dirX: 0, dirY: -1, phase: 0, anim: 0, speed: 0, state: 'walk', act: null, path: [], pi: 0 };
    this._vetGo(tr.vet, { x: d.x, y: d.y, act: 'care', bid: from.id });
    d.tr = tr;
    this.transfers.push(tr);
    this.emit('transferStart', tr);
    return { ok: true, transfer: tr };
  };

  P._vetGo = function (v, task) {
    const Pl = C.player;
    v.path = this._findPath(v.x, v.y, task);
    v.pi = 0;
    let L = 0, px = v.x, py = v.y;
    for (const [x, y] of v.path) { L += Math.hypot(x - px, y - py); px = x; py = y; }
    v.speed = Math.max(Pl.walkSpeed, L / Pl.maxTripSeconds);
    v.state = 'walk';
    if (L < 0.05) v.state = 'arrived';
  };
  P._vetWalk = function (v, dt) {
    let move = v.speed * dt;
    v.phase += move * 3.4;
    while (move > 1e-6 && v.pi < v.path.length) {
      const [tx, ty] = v.path[v.pi];
      const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
      if (d > 1e-4) { v.dirX = dx / d; v.dirY = dy / d; }
      if (d <= move) { v.x = tx; v.y = ty; v.pi++; move -= d; } else { v.x += dx / d * move; v.y += dy / d * move; move = 0; }
    }
    if (v.pi >= v.path.length) v.state = 'arrived';
  };
  /* Où la vétérinaire se poste pour viser. */
  function aimSpot(game, tr, at) {
    const d = tr.d, b = game.s.buildings[tr.from], v = tr.vet, o = at || d;
    if (!b || C.buildings[b.type].kind === 'water') return { x: v.x, y: v.y };
    const reach = 0.9 + (DZ.SPECIES[d.sp].len || 1.5) * 0.45;
    const dx = v.x - o.x, dy = v.y - o.y, l = Math.hypot(dx, dy) || 1;
    return { x: o.x + dx / l * Math.min(reach, l), y: o.y + dy / l * Math.min(reach, l) };
  }
  function setPhase(tr, ph) { tr.phase = ph; tr.t = 0; }
  /* Une passerelle d'observation à moins de r cases (l'hélicoptère ne peut pas lever l'animal dessous). */
  P.skyNear = function (x, y, r) {
    for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++) for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      if (!inMap(i, j) || !this.sky[idx(i, j)]) continue;
      if (Math.hypot(U.clamp(x, i, i + 1) - x, U.clamp(y, j, j + 1) - y) < r) return true;
    }
    return false;
  };
  /* Un endroit dégagé du même enclos, loin des passerelles. */
  function clearSpot(game, d) {
    const b = game.s.buildings[d.enc], r = 1.2 + (DZ.SPECIES[d.sp].len || 1.5) * 0.5;
    if (!b || !game.skyNear(d.x, d.y, r)) return null;
    let best = null, bd = 1e9;
    for (let k = 0; k < 40; k++) {
      const p = game.randomPointIn(b, d.sp);
      if (game.skyNear(p.x, p.y, r)) continue;
      const dd = Math.hypot(p.x - d.x, p.y - d.y);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  }

  P.transferPhaseText = function (tr) {
    return { vet: '🩺 La vétérinaire arrive', enter: '🩺 La vétérinaire s\'approche', aim: '💉 Fléchette anesthésiante', drowsy: '😴 Il s\'endort', heliIn: '🚁 L\'hélicoptère arrive', lift: '🚁 Levage dans le filet', carry: '🚁 En vol vers son nouvel enclos', drop: '🚁 Dépose en douceur', leave: '😴 Réveil dans son nouvel enclos', done: '' }[tr.phase] || '';
  };

  P._updateTransfers = function (dt) {
    const K = C.transfer;
    for (const tr of this.transfers.slice()) {
      const d = tr.d, v = tr.vet;
      tr.t += dt;
      if (v) this._updateVet(tr, v, dt);
      const alive = this.s.dinos.includes(d);
      if (!alive && tr.phase !== 'leave' && tr.phase !== 'done') {
        // l'animal a disparu (vendu, mort) : l'équipe repart
        tr.landed = true; tr.lift = 0; tr.cable = 0;
        if (['heliIn', 'lift', 'carry', 'drop'].includes(tr.phase)) { tr.lx = this.transferPose(tr) ? this.transferPose(tr).x : tr.tx; tr.ly = this.transferPose(tr) ? this.transferPose(tr).y : tr.ty; tr.tx = tr.lx; tr.ty = tr.ly; setPhase(tr, 'leave'); }
        else setPhase(tr, 'done');
        if (v && v.act !== 'leave') { v.act = 'leave'; this._vetGo(v, { x: ENT.tileX + 0.5, y: ENT.tileY - 0.5, act: 'leave', bid: null }); }
      }
      const sp = DZ.SPECIES[d.sp];
      if (tr.hold && alive && tr.lift === 0 && tr.phase !== 'leave' && !tr.clear) {
        // immobile : il regarde la vétérinaire, se pose s'il vole, remonte s'il nage
        d.moving = 0; d.run = 0;
        if (v && (tr.phase === 'enter' || tr.phase === 'aim')) { d.look = Math.atan2(v.y - d.y, v.x - d.x); d.face = Math.cos(d.look) >= 0 ? 1 : -1; d.heading = d.look; }
        if (sp.habitat === 'air') d.alt = Math.max(-6, d.alt - dt * 14);
        if (sp.habitat === 'water') d.surf = Math.min(1, d.surf + dt * 0.6);
      }
      switch (tr.phase) {
        case 'vet':
          if (v && v.state === 'arrived') {
            setPhase(tr, 'enter'); tr.hold = true;
            d.state = 'idle'; d.timer = 99; d.moving = 0; d.run = 0;
            // sous une passerelle : la vétérinaire le fait d'abord avancer à découvert
            tr.clear = clearSpot(this, d);
            const p = tr.clear ? aimSpot(this, tr, tr.clear) : aimSpot(this, tr);
            v.path = [[p.x, p.y]]; v.pi = 0; v.state = 'walk'; v.speed = C.player.walkSpeed;
          }
          break;
        case 'enter':
          if (tr.clear) {
            // il avance jusqu'à l'endroit dégagé
            const dx = tr.clear.x - d.x, dy = tr.clear.y - d.y, dist = Math.hypot(dx, dy), spd = sp.speed * 0.8;
            if (dist < 0.06) { tr.clear = null; d.moving = 0; }
            else { const st = Math.min(dist, spd * dt); d.x += dx / dist * st; d.y += dy / dist * st; d.gx = tr.clear.x; d.gy = tr.clear.y; d.look = null; d.state = 'walk'; d.moving = spd; d.face = dx > 0 ? 1 : -1; d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[d.sp].space)); }
            break;
          }
          if (d.state === 'walk') { d.state = 'idle'; d.moving = 0; }
          if (!v || v.state === 'arrived') { setPhase(tr, 'aim'); if (v) { v.act = 'aim'; v.anim = 0; const dx = d.x - v.x, dy = d.y - v.y, l = Math.hypot(dx, dy) || 1; v.dirX = dx / l; v.dirY = dy / l; } }
          break;
        case 'aim':
          if (tr.t >= K.aim) { setPhase(tr, 'drowsy'); this.emit('dart', tr); if (v) v.act = 'care'; }
          break;
        case 'drowsy':
          tr.sleep = Math.min(1, tr.t / K.drowsy);
          d.state = tr.sleep > 0.35 ? 'rest' : 'idle'; d.look = null;
          if (tr.t >= K.drowsy) { setPhase(tr, 'heliIn'); this.emit('heliDepart', tr); }
          break;
        case 'heliIn':
          d.state = 'rest';
          if (tr.t >= K.heliIn) { setPhase(tr, 'lift'); tr.lx = d.x; tr.ly = d.y; }
          break;
        case 'lift': {
          const u = tr.t / K.lift;
          tr.cable = Math.min(1, u * 2.5);
          tr.lift = U.clamp((u - 0.45) / 0.55, 0, 1);
          if (u > 0.45 && v && v.act !== 'leave') { v.act = 'leave'; this._vetGo(v, { x: ENT.tileX + 0.5, y: ENT.tileY - 0.5, act: 'leave', bid: null }); }
          if (u >= 1) { setPhase(tr, 'carry'); tr.carry = U.clamp(Math.hypot(tr.tx - tr.lx, tr.ty - tr.ly) / 9, 3, 9); this.emit('dinoLifted', tr); }
          break;
        }
        case 'carry': {
          const p = this.transferPose(tr);
          if (p) { d.x = p.x; d.y = p.y; }
          if (tr.t >= tr.carry) { setPhase(tr, 'drop'); d.x = tr.tx; d.y = tr.ty; }
          break;
        }
        case 'drop': {
          const u = tr.t / K.drop;
          tr.lift = 1 - U.clamp(u / 0.75, 0, 1);
          tr.cable = u < 0.75 ? 1 : Math.max(0, 1 - (u - 0.75) * 4);
          if (u >= 0.75 && !tr.landed) this._landTransfer(tr);
          if (u >= 1) setPhase(tr, 'leave');
          break;
        }
        case 'leave': {
          const u = tr.t / K.leave;
          tr.cable = 0;
          if (alive) { tr.sleep = 1 - U.clamp((u - 0.25) / 0.75, 0, 1); d.state = tr.sleep > 0.3 ? 'rest' : 'idle'; }
          if (u >= 1) {
            setPhase(tr, 'done');
            if (alive) { d.tr = null; d.sleep = 0; d.look = null; d.state = 'idle'; d.timer = rr(1, 3); d.moving = 0; d.gx = d.x; d.gy = d.y; }
          }
          break;
        }
      }
      if (alive && d.tr === tr) d.sleep = tr.sleep;
      if (tr.phase === 'done' && !tr.vet) this.transfers.splice(this.transfers.indexOf(tr), 1);
    }
  };

  P._updateVet = function (tr, v, dt) {
    v.anim += dt;
    if (v.state === 'walk') this._vetWalk(v, dt);
    if (v.act === 'leave' && v.state === 'arrived') tr.vet = null; // repartie par l'entrée
  };

  P._landTransfer = function (tr) {
    const d = tr.d, b = this.s.buildings[tr.to];
    tr.landed = true;
    if (!b) return;
    const from = this.s.buildings[tr.from];
    d.enc = b.id; d.x = tr.tx; d.y = tr.ty; d.gx = d.x; d.gy = d.y;
    this.keepInside(d, b, DZ.SPECIES[d.sp]);
    if (b.breed) delete b.breed[d.sp];
    if (from && from.breed) delete from.breed[d.sp];
    this._updateHappiness();
    this.emit('transferred', tr);
    this.notify('🚁', `${this.who(d)} a ${d.sex === 'F' ? 'été déposée' : 'été déposé'} dans son nouvel enclos. ${d.sex === 'F' ? 'Elle' : 'Il'} se réveille doucement.`, 'good', { type: 'select', building: b.id });
  };

  /* Hélicoptère d'un transfert (même forme que deliveryPose ; null s'il n'est pas là). */
  P.transferPose = function (tr) {
    const K = C.transfer, d = tr.d, HOV = 0.42;
    const ph = tr.phase;
    if (ph === 'heliIn') {
      const u = Math.min(1, tr.t / K.heliIn), e = ease(u);
      return { x: U.lerp(tr.sx, d.x, e), y: U.lerp(tr.sy, d.y, e), alt: U.lerp(1, HOV, e), heading: Math.atan2(d.y - tr.sy, d.x - tr.sx), tilt: Math.sin(u * Math.PI) * 0.22, cable: 0, phase: ph, u };
    }
    if (ph === 'lift') {
      const u = Math.min(1, tr.t / K.lift);
      return { x: tr.lx + Math.sin(tr.t * 4) * 0.04, y: tr.ly + Math.cos(tr.t * 3.1) * 0.04, alt: HOV + tr.lift * 0.06, heading: Math.atan2(tr.ly - tr.sy, tr.lx - tr.sx), tilt: -0.04, cable: tr.cable, phase: 'hover', u };
    }
    if (ph === 'carry') {
      const u = Math.min(1, tr.t / tr.carry), e = ease(u);
      return { x: U.lerp(tr.lx, tr.tx, e), y: U.lerp(tr.ly, tr.ty, e), alt: HOV + 0.06 + Math.sin(u * Math.PI) * 0.22, heading: Math.atan2(tr.ty - tr.ly, tr.tx - tr.lx), tilt: Math.sin(u * Math.PI) * 0.2, cable: 1, phase: 'fly', u };
    }
    if (ph === 'drop') {
      const u = Math.min(1, tr.t / K.drop);
      return { x: tr.tx + Math.sin(tr.t * 4) * 0.04, y: tr.ty + Math.cos(tr.t * 3.1) * 0.04, alt: HOV + tr.lift * 0.06, heading: Math.atan2(tr.ty - tr.ly, tr.tx - tr.lx), tilt: -0.04, cable: tr.cable, phase: 'hover', u };
    }
    if (ph === 'leave' && tr.t < K.leave) {
      const u = Math.min(1, tr.t / K.leave), e = ease(u);
      const head = Math.atan2(tr.sy - tr.ty, tr.sx - tr.tx);
      return { x: U.lerp(tr.tx, tr.sx, e * e), y: U.lerp(tr.ty, tr.sy, e * e), alt: U.lerp(HOV, 1.15, e), heading: head, tilt: Math.sin(u * Math.PI) * 0.18, cable: 0, phase: 'leave', u };
    }
    return null;
  };
})();
