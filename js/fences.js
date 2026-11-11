/* =====================================================================
   DinoZoo — État des clôtures.
   Chaque enclos terrestre a une clôture en état de 0 à 100 %. Elle s'use
   avec le temps et sous les charges des gros animaux (surtout les
   carnivores malheureux), qu'on voit foncer contre elle. Plus elle est
   abîmée, plus une évasion est probable ; très abîmée, l'animal finit par
   la percer. On la répare (court chantier) ou on choisit l'entretien
   automatique (chaque nuit, un peu plus cher).
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const P = DZ.Game.prototype;

  P.hasFence = function (b) { return !!(b && this.isEnclosure(b) && C.buildings[b.type].kind === 'land'); };
  P.fenceOf = function (b) { return this.hasFence(b) ? (b.fence == null ? 100 : b.fence) : 100; };
  /* Facteur de risque d'évasion lié à l'état de la clôture (0 : elle tient). */
  P.fenceRisk = function (b) {
    const F = C.fence, c = this.fenceOf(b);
    if (b.level >= 3 && c >= F.glass) return 0;
    const lv = b.level >= 3 ? C.escape.fence[1] : C.escape.fence[b.level - 1]; // murs de verre fissurés : comme une clôture électrifiée
    return lv * (1 + F.risk * Math.pow(U.clamp((100 - c) / 60, 0, 1), 1.3));
  };
  P.repairCost = function (b) {
    const F = C.fence, def = C.buildings[b.type];
    return Math.round(def.cost * this.sizeFactor(b) * F.repair * F.repairLevel[b.level - 1] * (100 - this.fenceOf(b)) / 100 / 10) * 10;
  };
  P._damageFence = function (b, amount, x, y, k) {
    if (!this.hasFence(b)) return;
    b.fence = Math.max(0, this.fenceOf(b) - amount);
    if (x != null) {
      // trace visible du dégât (fusionnée avec un dégât voisin)
      b.dmg = b.dmg || [];
      const near = b.dmg.find((p) => Math.hypot(p[0] - x, p[1] - y) < 1.2);
      if (near) near[2] = Math.min(1, near[2] + k); else b.dmg.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.min(1, k)]);
      if (b.dmg.length > 8) b.dmg.shift();
    }
    this.emit('fenceChanged', b);
  };

  /* Réparation : court chantier, le directeur se rend sur place. */
  P.repairFence = function (id) {
    const b = this.s.buildings[id];
    if (!this.hasFence(b)) return { ok: false };
    if (this.busy(b)) return { ok: false, reason: 'Des travaux sont déjà en cours' };
    if (this.fenceOf(b) >= 99.5) return { ok: false, reason: 'La clôture est en parfait état' };
    const cost = this.repairCost(b);
    if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
    this._spend(cost, 'construction');
    b.upg = { t: 0, dur: Math.max(0.2, this.worksHours(cost) * 0.6), repair: true };
    this.emit('upgradeStarted', b);
    this.playerTask(b.x + b.w / 2, b.y + b.h / 2, 'build', b.id);
    return { ok: true, cost, hours: b.upg.dur };
  };
  P._finishRepair = function (b) {
    b.fence = 100; b.dmg = [];
    this.emit('fenceChanged', b);
    this.notify('🔧', `Clôture réparée : ${DZ.bName(b)} est de nouveau sûr.`, 'good', { type: 'select', building: b.id });
  };
  P.setAutoFence = function (id, on) { const b = this.s.buildings[id]; if (b) b.autoFix = on ? 1 : 0; };

  /* Chaque nuit : usure, entretien automatique. Renvoie le coût de l'entretien. */
  P._fenceNight = function () {
    const F = C.fence;
    let cost = 0;
    for (const id in this.s.buildings) {
      const b = this.s.buildings[id];
      if (!this.hasFence(b) || b.cons) continue;
      b.fence = Math.max(0, this.fenceOf(b) - F.wear[b.level - 1] * rr(0.7, 1.3));
      if (b.autoFix && b.fence < F.auto && !this.busy(b)) {
        const c = Math.round(this.repairCost(b) * (1 + F.autoExtra));
        if (this.s.money - cost >= c) { cost += c; b.fence = 100; b.dmg = []; } // débité avec l'entretien du soir
      }
      this.emit('fenceChanged', b);
    }
    return cost;
  };

  /* ------------------------------------------------------------------
     Charges contre la clôture
     ------------------------------------------------------------------ */
  P._checkRams = function (dh) {
    this._ramAcc = (this._ramAcc || 0) + dh;
    if (this._ramAcc < 0.2) return;
    const step = this._ramAcc;
    this._ramAcc = 0;
    const F = C.fence, s = this.s;
    if (s.hour < C.time.startHour + 0.3) return;
    for (const d of s.dinos) {
      if (d.young || d.loose || d.tr || d.fight || d.hunt || d.cross || d.ram || d.sick || d.sedated > s.day * 24 + s.hour) continue;
      const b = s.buildings[d.enc], sp = DZ.SPECIES[d.sp];
      if (!this.hasFence(b) || b.cons || sp.habitat !== 'land') continue;
      const rate = F.hitRate * F.hitSize[sp.size || 'M'] * (sp.predator ? 1 : F.hitHerb) * (d.happiness < 40 ? F.hitUnhappy : 1);
      if (R() < rate * step) this._startRam(d, b, sp);
    }
  };
  P._startRam = function (d, b, sp) {
    const sh = DZ.encShape(b), m = this.shapeMargin(b, sp);
    // il fonce droit devant lui jusqu'à la clôture
    for (let k = 0; k < 8; k++) {
      const a = R() * U.TAU, cx = Math.cos(a), cy = Math.sin(a);
      let prev = null;
      for (let l = 0.4; l < 16; l += 0.25) {
        const x = d.x + cx * l, y = d.y + cy * l;
        if (DZ.encSDF(b, x, y, sh) > -m) break;
        prev = [x, y];
      }
      if (!prev || Math.hypot(prev[0] - d.x, prev[1] - d.y) < 1.2) continue;
      // point de la clôture touché (pour la trace du dégât)
      let fx = prev[0], fy = prev[1];
      for (let l = 0; l < 4 && DZ.encSDF(b, fx, fy, sh) < 0; l += 0.1) { fx += cx * 0.1; fy += cy * 0.1; }
      d.ram = { phase: 'go', t: 0, tx: prev[0], ty: prev[1], fx, fy, a };
      d.state = 'walk'; d.anim = 0; d.run = 1.8; d.look = null;
      return true;
    }
    return false;
  };
  P._updateRams = function (dt) {
    const F = C.fence;
    for (const d of this.s.dinos) {
      const r = d.ram;
      if (!r) continue;
      const b = this.s.buildings[d.enc], sp = DZ.SPECIES[d.sp];
      if (!b || d.loose || d.tr || d.fight || d.hunt) { this._endRam(d); continue; }
      r.t += dt; d.anim += dt;
      if (r.phase === 'go') {
        const dx = r.tx - d.x, dy = r.ty - d.y, dist = Math.hypot(dx, dy), v = sp.speed * 1.8;
        if (dist < 0.05 || r.t > 12) { r.phase = 'hit'; r.t = 0; d.moving = 0; d.state = 'fight'; d.anim = 0; d.look = r.a; d.face = Math.cos(r.a) >= 0 ? 1 : -1; continue; }
        const st = Math.min(dist, v * dt);
        d.x += dx / dist * st; d.y += dy / dist * st; d.gx = r.tx; d.gy = r.ty;
        if (Math.abs(dx) > 0.02) d.face = dx > 0 ? 1 : -1;
        d.moving = v; d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[d.sp].space));
      } else if (r.phase === 'hit') {
        d.fightK = Math.min(1, r.t * 3);
        if (!r.done && r.t > 0.35) {
          r.done = true;
          const lv = Math.min(2, b.level - 1), dmg = F.hit[sp.size || 'M'] * F.hitLevel[lv] * rr(0.7, 1.3);
          this._damageFence(b, dmg, r.fx, r.fy, dmg / 12);
          this.emit('fenceHit', { x: r.fx, y: r.fy, sp: d.sp, b, d });
          // clôture à bout : il la percera sous peu
          const s = this.s;
          if (this.fenceOf(b) < F.breach && !s.escapeAt && this.escapeRisk(d, b) > 0) { s.escapeAt = s.hour + rr(0.15, 0.8); s.escapeDino = d.id; }
        }
        if (r.t > 1.1) this._endRam(d);
      }
    }
  };
  P._endRam = function (d) {
    d.ram = null; d.run = 0; d.fightK = 0; d.look = null; d.moving = 0;
    if (d.state === 'fight' || d.state === 'walk') { d.state = 'idle'; d.timer = rr(1, 3); }
  };
})();
