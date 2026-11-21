/* =====================================================================
   DinoZoo — Obstacles des enclos et collisions entre dinosaures.
   Les dinosaures ne se traversent plus et contournent le décor de leur
   enclos : rochers, arbres et plantes, piliers des passerelles
   d'observation. Les plus grands ne passent pas sous le tablier d'une
   passerelle. Logique pure (sans rendu) : le décor est tiré au sort ici
   et le rendu 3D le dessine au même endroit.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const P = DZ.Game.prototype;

  /* Décor intérieur d'un enclos (rochers, arbres), évitant les portes et
     les passerelles. Déterministe : même graine → même décor. */
  DZ.enclosureDecor = function (b, gates) {
    const def = C.buildings[b.type], lv = b.level;
    const r = U.rng(b.seed + lv * 7);
    const area = b.w * b.h, out = [];
    const sh = DZ.encShape(b);
    const free = (p) => !gates || !gates.some((g) => p.x > g.x0 - 0.6 && p.x < g.x1 + 0.6 && p.z > g.y0 - 0.6 && p.z < g.y1 + 0.6);
    const inside = () => { for (let k = 0; k < 30; k++) { const p = { x: b.x + 0.7 + r() * (b.w - 1.4), z: b.y + 0.7 + r() * (b.h - 1.3) }; if (DZ.encSDF(b, p.x, p.z, sh) < -0.9 && free(p)) return p; } return { x: sh.cx, z: sh.cy }; };
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

  /* Emprise au sol (rayon, en cases) des éléments de décor. */
  const ROCK_R = { S: 0.14, M: 0.27, L: 0.45 };
  const TREE_R = { araucaria: 0.13, palmier: 0.11, ginkgo: 0.13, arbremort: 0.09, cycas: 0.2, buisson: 0.26, fougere: 0.18 };
  /* Hauteur des espèces (3D, en cases), pour le passage sous les passerelles. */
  // hauteur des modèles réalistes (voile, plaques et crêtes comprises) ; cou levé ou au repas pour les sauropodes
  DZ.DINO_HEIGHT = {
    compsognathus: 0.41, dryosaurus: 0.62, psittacosaurus: 0.49, pachycephalosaurus: 1, parasaurolophus: 1.18, triceratops: 1.37,
    stegosaurus: 1.61, ankylosaurus: 1.1, diplodocus: 2.22, brachiosaurus: 2.07, velociraptor: 0.67, dilophosaurus: 0.94,
    allosaurus: 1.38, carnotaurus: 1.31, spinosaurus: 1.46, trex: 1.69
  };
  const DECK_CLEAR = () => C.skywalk.height - 0.4; // dessous du tablier et de ses poutres

  /* Obstacles d'un enclos : cercles { x, y, r } et bandes { x0, x1, y0, y1 }
     (tablier d'une passerelle, infranchissable pour les plus grands). */
  P.obstaclesOf = function (b) {
    this._obs = this._obs || new Map();
    const gates = this.gatesOf(b), sky = this.skyRects(b);
    const key = b.level + '|' + b.x + ',' + b.y + ',' + b.w + ',' + b.h + '|' + (b.parts ? b.parts.length : 0) + '|' + JSON.stringify(gates.map((g) => [g.x0, g.y0, g.x1, g.y1])) + JSON.stringify(sky);
    const hit = this._obs.get(b.id);
    if (hit && hit.key === key) return hit;
    const circles = [], strips = [];
    if (C.buildings[b.type].kind === 'land') {
      for (const o of DZ.enclosureDecor(b, gates.concat(sky))) {
        if (o.t === 'rock') circles.push({ x: o.x, y: o.z, r: ROCK_R[o.size] });
        else circles.push({ x: o.x, y: o.z, r: (TREE_R[o.k] || 0.15) * o.sc });
      }
      // piliers des passerelles (mêmes positions que le rendu 3D)
      const sh = DZ.encShape(b);
      for (const run of this.skyRunsOver(b)) {
        for (let u = 1.5; u < run.len - 1; u += 2) for (const s of [-1, 1]) {
          const v = s * 0.3;
          const x = run.dir === 'x' ? run.x + u : run.x + 0.5 - v, y = run.dir === 'x' ? run.y + 0.5 + v : run.y + u;
          if (DZ.encSDF(b, x, y, sh) < 0) circles.push({ x, y, r: 0.1 });
        }
      }
      for (const s of sky) strips.push({ x0: s.x0 + 0.15, x1: s.x1 - 0.15, y0: s.y0 + 0.05, y1: s.y1 - 0.05 });
    }
    const res = { key, circles, strips };
    this._obs.set(b.id, res);
    return res;
  };

  /* Trop grand pour passer sous le tablier d'une passerelle ? */
  P.tooTall = function (d) { return (DZ.DINO_HEIGHT[d.sp] || 0) * this.dinoScale(d) > DECK_CLEAR(); };

  /* Corps d'un dinosaure : trois cercles le long de sa direction (tête, milieu, queue). */
  P.dinoBody = function (d) {
    const sp = DZ.SPECIES[d.sp], k = this.dinoScale(d), len = (sp.len || 1) * k;
    if (d.moving > 0 && d.gx !== undefined && Math.hypot(d.gx - d.x, d.gy - d.y) > 0.05) d._hd = Math.atan2(d.gy - d.y, d.gx - d.x);
    const a = d.look != null ? d.look : d._hd !== undefined ? d._hd : (d.face > 0 ? 0 : Math.PI);
    return { r: 0.08 + len * 0.16, off: len * 0.24, hx: Math.cos(a), hy: Math.sin(a), m: len * len };
  };

  /* Le trajet en ligne droite évite-t-il les obstacles ? */
  P.pathClear = function (b, d, x0, y0, x1, y1) {
    const obs = this.obstaclesOf(b), body = this.dinoBody(d), tall = this.tooTall(d);
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.3));
    for (let k = 1; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      for (const o of obs.circles) if (Math.hypot(x - o.x, y - o.y) < o.r + body.r * 0.8) return false;
      if (tall) for (const s of obs.strips) if (x > s.x0 - body.r && x < s.x1 + body.r && y > s.y0 - body.r && y < s.y1 + body.r) return false;
    }
    return true;
  };

  /* Après les déplacements : on sépare les dinosaures qui se chevauchent
     et on les sort des obstacles. */
  P._dinoCollisions = function (dt) {
    const groups = new Map();
    for (const d of this.s.dinos) {
      if (d.loose || d.cross || d.tr || d.ram) continue;
      if (DZ.SPECIES[d.sp].habitat !== 'land') continue;
      const b = this.s.buildings[d.enc];
      if (!b) continue;
      let g = groups.get(b.id);
      if (!g) groups.set(b.id, g = []);
      g.push(d);
    }
    for (const [bid, list] of groups) {
      const b = this.s.buildings[bid];
      const obs = this.obstaclesOf(b);
      const bodies = list.map((d) => this.dinoBody(d));
      const push = list.map(() => [0, 0]);
      const centers = (d, bd) => [[d.x + bd.hx * bd.off, d.y + bd.hy * bd.off], [d.x, d.y], [d.x - bd.hx * bd.off, d.y - bd.hy * bd.off]];
      // entre dinosaures (sauf deux adversaires d'un même combat ou d'une même chasse)
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if ((A.fight && A.fight === B.fight) || (A.hunt && A.hunt === B.hunt)) continue;
        const a = bodies[i], c = bodies[j];
        if (Math.hypot(A.x - B.x, A.y - B.y) > a.off + c.off + a.r + c.r) continue;
        for (const p of centers(A, a)) for (const q of centers(B, c)) {
          const dx = q[0] - p[0], dy = q[1] - p[1], dist = Math.hypot(dx, dy), min = a.r + c.r;
          if (dist >= min) continue;
          // deux animaux au même point (livraison) : on les écarte dans une direction propre à la paire
          const a0 = (A.id * 2.39996 + B.id) % 6.283;
          const nx = dist > 1e-4 ? dx / dist : Math.cos(a0), ny = dist > 1e-4 ? dy / dist : Math.sin(a0), over = (min - dist) * 0.6;
          const wa = c.m / (a.m + c.m), wb = a.m / (a.m + c.m); // le plus lourd bouge moins
          push[i][0] -= nx * over * wa; push[i][1] -= ny * over * wa;
          push[j][0] += nx * over * wb; push[j][1] += ny * over * wb;
        }
      }
      // décor
      for (let i = 0; i < list.length; i++) {
        const d = list[i], bd = bodies[i], tall = this.tooTall(d);
        for (const p of centers(d, bd)) {
          const px = p[0] + push[i][0], py = p[1] + push[i][1];
          for (const o of obs.circles) {
            const dx = px - o.x, dy = py - o.y, dist = Math.hypot(dx, dy), min = o.r + bd.r * 0.85;
            if (dist >= min) continue;
            const nx = dist > 1e-4 ? dx / dist : 1, ny = dist > 1e-4 ? dy / dist : 0;
            push[i][0] += nx * (min - dist); push[i][1] += ny * (min - dist);
          }
          if (tall) for (const s of obs.strips) {
            const cx = U.clamp(px, s.x0, s.x1), cy = U.clamp(py, s.y0, s.y1);
            const dx = px - cx, dy = py - cy, dist = Math.hypot(dx, dy);
            if (dist >= bd.r) continue;
            if (dist > 1e-4) { push[i][0] += dx / dist * (bd.r - dist); push[i][1] += dy / dist * (bd.r - dist); }
            else { // centre sous le tablier : on sort par le côté le plus proche
              const opts = [[s.x0 - bd.r - px, 0], [s.x1 + bd.r - px, 0], [0, s.y0 - bd.r - py], [0, s.y1 + bd.r - py]];
              opts.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
              push[i][0] += opts[0][0]; push[i][1] += opts[0][1];
            }
          }
        }
      }
      // application, toujours dans la clôture ; un animal bloqué change de but
      let sh = null;
      for (let i = 0; i < list.length; i++) {
        const d = list[i], [px, py] = push[i];
        const mag = Math.hypot(px, py);
        if (mag < 1e-4) { d._stuck = 0; continue; }
        const lim = Math.min(1, 0.25 / mag); // pas de téléportation
        d.x += px * lim; d.y += py * lim;
        sh = sh || DZ.encShape(b);
        this.keepInside(d, b, DZ.SPECIES[d.sp], sh);
        if (d.state === 'walk' && !d.fight && !d.hunt) {
          d._stuck = (d._stuck || 0) + (mag > 0.004 ? dt : 0);
          if (d._stuck > 1.2) { d._stuck = 0; const g = this.walkGoal(b, d); d.gx = g.x; d.gy = g.y; }
        }
      }
    }
  };
})();
