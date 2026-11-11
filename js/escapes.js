/* =====================================================================
   DinoZoo — Évasions.
   Derrière une clôture trop faible, un dinosaure peut s'échapper : il
   enfonce la clôture et erre dans le parc. Les visiteurs proches
   paniquent (tout le parc s'il s'agit d'un carnivore dangereux), la note
   baisse et la peur éloigne les visiteurs pendant quelques jours, d'autant
   plus que l'animal est dangereux. Un carnivore en liberté traque les
   visiteurs : s'il en attaque un, la partie est terminée.
   Pour le ramener : le sélectionner, puis « Capturer » (vétérinaire et
   hélicoptère, voir les transferts dans amenities.js).
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const { W, H, TER, idx, inMap } = DZ.GameConst;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const P = DZ.Game.prototype;

  /* Danger d'un animal en liberté : 0 (inoffensif) → 1 (terrifiant). */
  P.dangerOf = function (d) {
    const sp = DZ.SPECIES[d.sp], t = C.escape.danger[sp.predator ? 'pred' : 'herb'];
    return t[sp.size || 'M'] * (d.young ? 0.5 : 1);
  };
  P.looseDinos = function () { return this.s.dinos.filter((d) => d.loose); };
  P.looseDanger = function () { let m = 0; for (const d of this.s.dinos) if (d.loose && !(d.tr && d.tr.hold)) m = Math.max(m, this.dangerOf(d)); return m; };
  /* Entrées au parc : réduites, ou parc fermé, tant qu'un animal est en liberté. */
  P.looseOpenFactor = function () {
    const m = this.looseDanger();
    return m >= C.escape.close ? 0 : 1 - m;
  };
  /* Risque d'évasion d'un animal (par jour), selon la clôture, sa force et son humeur. */
  P.escapeRisk = function (d, b) {
    const E = C.escape, sp = DZ.SPECIES[d.sp];
    if (!b || !this.isEnclosure(b) || C.buildings[b.type].kind !== 'land' || sp.habitat !== 'land') return 0;
    if (d.young || d.loose || d.tr || b.cons || d.sedated > this.s.day * 24 + this.s.hour) return 0;
    // la clôture : son niveau et son état (voir fences.js)
    return this.fenceRisk(b) * E.base[sp.size || 'M'] * (sp.predator ? E.predator : 1) * (d.happiness < 40 ? E.unhappy : 1);
  };
  /* Chaque matin : au plus une évasion dans la journée. */
  P._scheduleEscape = function () {
    const s = this.s;
    s.escapeAt = null;
    if (s.day < C.events.firstDay) return;
    const list = [];
    let total = 0;
    for (const d of s.dinos) { const r = this.escapeRisk(d, s.buildings[d.enc]); if (r > 0) { list.push([d, r]); total += r; } }
    if (!list.length) return;
    // une clôture à bout cède à coup sûr
    const broken = list.filter(([d]) => this.fenceOf(s.buildings[d.enc]) < C.fence.breach).sort((a, b) => b[1] - a[1])[0];
    if (broken) { s.escapeAt = rr(9.5, 16.5); s.escapeDino = broken[0].id; return; }
    if (R() >= Math.min(0.9, total)) return;
    let k = R() * total, pick = list[0][0];
    for (const [d, r] of list) { k -= r; if (k <= 0) { pick = d; break; } }
    s.escapeAt = rr(9.5, 16.5); s.escapeDino = pick.id;
  };

  P._walkLoose = function (x, y, d) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!inMap(tx, ty)) return false;
    const i = idx(tx, ty), t = this.terrain[i];
    if (t === TER.WATER || t === TER.ROCK) return false;
    return !this.occ[i];
  };
  P._lineLoose = function (d, x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.35);
    for (let k = 1; k <= n; k++) if (!this._walkLoose(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, d)) return false;
    return true;
  };
  /* Point libre le plus proche hors de l'enclos (là où il enfonce la clôture). */
  function breachPoint(game, d) {
    let best = null, bd = 1e9;
    const x0 = Math.floor(d.x), y0 = Math.floor(d.y);
    for (let r = 1; r < 16 && !best; r++) {
      for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
        if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== r || !game._walkLoose(x + 0.5, y + 0.5, d)) continue;
        const dd = Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y);
        if (dd < bd) { bd = dd; best = { x: x + 0.5, y: y + 0.5 }; }
      }
    }
    return best;
  }

  P._triggerEscape = function () {
    const s = this.s, E = C.escape;
    s.escapeAt = null;
    const d = s.dinos.find((x) => x.id === s.escapeDino);
    const b = d && s.buildings[d.enc];
    if (d && d.ram) this._endRam(d);
    if (!d || d.fight || d.hunt || d.cross || !this.escapeRisk(d, b)) return;
    const out = breachPoint(this, d);
    if (!out) return;
    const sp = DZ.SPECIES[d.sp], size = sp.size || 'M', danger = this.dangerOf(d);
    d.loose = { phase: 'out', t: 0, ox: out.x, oy: out.y, gx: null, gy: null, panicT: 0, wait: 0, calm: E.hesitate };
    d.state = 'walk'; d.anim = 0; d.timer = 0;
    // conséquences : clôture défoncée (à réparer), note, peur durable
    this._damageFence(b, Math.max(0, this.fenceOf(b) - E.breachDamage), out.x, out.y, 1);
    const stars = E.rating * danger;
    s.rating = U.clamp(s.rating - stars, 0, 5);
    s.fear = Math.min(0.8, (s.fear || 0) + E.fear * danger);
    this._panicAround(d, true);
    this.dailyTarget = this.computeDailyTarget();
    this.emit('escape', { dino: d, building: b, x: out.x, y: out.y, danger });
    const closed = danger >= E.close;
    const what = sp.predator ? (closed ? 'Les visiteurs fuient en hurlant, le parc ferme ses portes.' : 'Les visiteurs proches s\'enfuient.') : (danger >= 0.3 ? 'Les visiteurs proches s\'écartent, inquiets.' : 'Quelques visiteurs s\'inquiètent.');
    this.notify('🚨', `Évasion ! ${this.who(d)} a enfoncé la clôture et se promène dans le parc. ${what}${sp.predator ? ' S\'il attaque un visiteur, la partie est perdue !' : ''} Sélectionnez-${d.sex === 'F' ? 'la' : 'le'} et envoyez la vétérinaire, puis réparez la clôture. Note −${stars.toFixed(2)} ★.`, 'bad', { type: 'dino', dino: d.id });
  };

  /* Les visiteurs proches paniquent et fuient (les portes du parc ferment s'il est dangereux).
     Tout près de l'animal, ils restent d'abord figés de peur ; plus loin, la nouvelle met un
     peu de temps à arriver. */
  P._panicAround = function (d, first) {
    const E = C.escape, dn = this.dangerOf(d);
    const r = E.panic[0] + (E.panic[1] - E.panic[0]) * dn;
    let n = 0;
    for (const g of this.visitors) {
      if (g.panic || g.alerted || g.state === 'exit') continue;
      const dist = Math.hypot(g.x - d.x, g.y - d.y);
      if (dist > r) continue; // plus loin, on ne s'est encore aperçu de rien
      g.alerted = true;
      g.frozen = dist < E.freeze[0];
      g.fearT = g.frozen ? rr(E.freeze[1], E.freeze[2]) : Math.min(E.news[1], dist / E.news[0]) + rr(0, 0.6);
      g.fearDanger = dn;
      g.mood = 'peur'; g.bubbleT = 2.5;
      n++;
    }
    if (n && !first) this.emit('panic', { dino: d, n });
  };
  /* Fin du temps de réaction : la famille s'enfuit vers la sortie. */
  P._flee = function (g) {
    g.frozen = false; g.fearT = 0;
    g.panic = true; g.sat -= 8 + C.escape.panicSat * (g.fearDanger || 0.5); g.mood = 'peur'; g.bubbleT = 2.5;
    g.hidden = false; this._stopPlay(g);
    this.goExit(g);
  };

  P._updateLoose = function (d, sp, dt) {
    const L = d.loose, E = C.escape;
    L.t += dt; d.anim += dt;
    const moveTo = (tx, ty, speed, free) => {
      const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
      if (dist < 0.05) return true;
      const st = Math.min(dist, speed * dt), nx = d.x + dx / dist * st, ny = d.y + dy / dist * st;
      if (!free && !this._walkLoose(nx, ny, d)) return null; // obstacle
      d.x = nx; d.y = ny; d.gx = tx; d.gy = ty;
      if (Math.abs(dx) > 0.02) d.face = dx > 0 ? 1 : -1;
      d.moving = speed; d.state = 'walk';
      d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[d.sp].space));
      return dist <= st + 1e-3;
    };
    if (L.phase === 'out') {
      // il traverse la clôture et sort de l'enclos
      if (moveTo(L.ox, L.oy, sp.speed * 1.6, true)) { L.phase = 'roam'; L.gx = null; if (sp.predator) { d.state = 'roar'; d.anim = 0; d.moving = 0; this.emit('roar', d); } }
      return;
    }
    L.calm = Math.max(0, (L.calm || 0) - dt); // un carnivore hésite d'abord : il rugit, flaire, puis chasse
    // panique autour de lui
    L.panicT -= dt;
    if (L.panicT <= 0) { L.panicT = 0.4; this._panicAround(d, false); }
    if (R() < sp.roar * dt * 0.25) this.emit('roar', d);
    // un carnivore traque le visiteur le plus proche
    if (sp.predator && !d.young && L.calm <= 0) {
      let prey = null, bd = E.sense;
      for (const g of this.visitors) {
        if (g.hidden || g.y > H) continue;
        const dd = Math.hypot(g.x - d.x, g.y - d.y);
        if (dd < bd) { bd = dd; prey = g; }
      }
      if (prey) {
        if (bd < E.reach + (sp.len || 1.5) * 0.5) { this._attackVisitor(d, prey); return; }
        d.run = E.run[sp.size || 'M'];
        const r = moveTo(prey.x, prey.y, sp.speed * d.run, false);
        if (r !== null) return;
        L.gx = null; // obstacle : il contourne
      }
    }
    d.run = 0;
    if (L.wait > 0) { L.wait -= dt; d.moving = 0; d.state = 'idle'; return; }
    if (L.gx == null) {
      // nouvelle destination : vers les visiteurs pour un carnivore, au hasard sinon
      let tgt = null;
      if (sp.predator && L.calm <= 0) {
        let bd = 30;
        for (const g of this.visitors) { if (g.hidden || g.y > H) continue; const dd = Math.hypot(g.x - d.x, g.y - d.y); if (dd < bd) { bd = dd; tgt = g; } }
      }
      for (let k = 0; k < 14; k++) {
        const a = tgt ? Math.atan2(tgt.y - d.y, tgt.x - d.x) + rr(-0.9, 0.9) : R() * U.TAU, l = rr(2, 7);
        const x = d.x + Math.cos(a) * l, y = d.y + Math.sin(a) * l;
        if (this._lineLoose(d, d.x, d.y, x, y)) { L.gx = x; L.gy = y; break; }
      }
      if (L.gx == null) { L.wait = rr(0.5, 1.5); return; }
    }
    const r = moveTo(L.gx, L.gy, sp.speed, false);
    if (r === true) { L.gx = null; L.wait = sp.predator ? rr(0.2, 1) : rr(1, 4); d.moving = 0; d.state = R() < 0.3 ? 'eat' : 'idle'; d.anim = 0; }
    else if (r === null) L.gx = null;
  };

  /* Un carnivore attaque un visiteur : les autorités ferment le parc, la partie est terminée. */
  P._attackVisitor = function (d, g) {
    const s = this.s;
    d.run = 0; d.moving = 0; d.state = 'roar'; d.anim = 0; d.look = Math.atan2(g.y - d.y, g.x - d.x);
    this.visitors = this.visitors.filter((o) => o !== g);
    for (const o of this.visitors) { o.panic = true; o.frozen = false; o.fearT = 0; o.mood = 'peur'; o.bubbleT = 3; if (o.state !== 'exit') { o.hidden = false; this.goExit(o); } }
    s.over = {
      day: s.day, sp: d.sp, name: d.name, sex: d.sex, earned: Math.round(s.totalEarned),
      text: `${this.who(d)}, ${d.sex === 'F' ? 'échappée' : 'échappé'} de son enclos, a attaqué un visiteur. Les autorités ferment DinoZoo : la partie est terminée.`
    };
    this.emit('attack', { dino: d, x: g.x, y: g.y });
    this.emit('gameOver', s.over);
  };
})();
