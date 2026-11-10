/* =====================================================================
   DinoZoo 3D — Monde découpé en tronçons de 16 × 16 cases.
   Terrain en relief (plaines, collines, montagnes enneigées, lac,
   rivière, mer), chemins dallés, ponts, eau, rochers, touffes d'herbe
   et listes d'arbres par tronçon. Seuls les tronçons modifiés sont
   reconstruits. Unités : 1 case = 1 unité ; x à droite, z = ligne de
   la carte, y vers le haut.
   ===================================================================== */
(function () {
  const G = DZ.G, U = DZ.util, C = DZ.CONFIG, TER = DZ.TER, BI = DZ.BIOME;
  const W = C.map.w, H = C.map.h;
  const MARGIN = 24;         // paysage prolongé autour de la carte
  const RES = 2;             // sommets par case
  const CH = 16;             // cases par tronçon
  const WATER_Y = -0.07;
  G.WATER_Y = WATER_Y;
  G.MARGIN = MARGIN;
  G.CHUNK = CH;

  const COL = {
    plains: [[0.4, 0.5, 0.22], [0.45, 0.53, 0.25], [0.36, 0.46, 0.2]],
    forest: [[0.25, 0.36, 0.15], [0.28, 0.39, 0.17]],
    jungle: [[0.19, 0.34, 0.12], [0.22, 0.38, 0.13]],
    hills: [[0.38, 0.44, 0.23], [0.42, 0.45, 0.27]],
    dry: [0.48, 0.46, 0.26], dirt: [0.5, 0.39, 0.25], mud: [0.38, 0.3, 0.2], sand: [0.72, 0.64, 0.47], wetSand: [0.5, 0.44, 0.31],
    rock: [0.46, 0.44, 0.41], darkRock: [0.36, 0.35, 0.33], snow: [0.93, 0.95, 0.97], lush: [0.25, 0.4, 0.15], bed: [0.32, 0.33, 0.25], seaBed: [0.5, 0.47, 0.36], pave: [0.42, 0.38, 0.32]
  };

  class World3D {
    constructor(game) {
      this.game = game;
      this.EW = W + 2 * MARGIN; this.EH = H + 2 * MARGIN;
      this.gw = this.EW * RES + 1; this.gh = this.EH * RES + 1;
      this.heights = new Float32Array(this.gw * this.gh);
      this.cols = Math.ceil(this.EW / CH); this.rows = Math.ceil(this.EH / CH);
      this.chunks = [];
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
        const x0 = -MARGIN + cx * CH, y0 = -MARGIN + cy * CH;
        this.chunks.push({ cx, cy, x0, y0, x1: Math.min(x0 + CH, W + MARGIN), y1: Math.min(y0 + CH, H + MARGIN), dirty: true, minH: 0, maxH: 0 });
      }
      this.bh = new Map(); // hauteur du sol sous chaque bâtiment
    }

    chunkAt(x, y) {
      const cx = Math.floor((x + MARGIN) / CH), cy = Math.floor((y + MARGIN) / CH);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return null;
      return this.chunks[cy * this.cols + cx];
    }
    markDirty(region) {
      if (!region) { for (const c of this.chunks) c.dirty = true; return; }
      for (const c of this.chunks) if (c.x1 > region.x0 - 2 && c.x0 <= region.x1 + 2 && c.y1 > region.y0 - 2 && c.y0 <= region.y1 + 2) c.dirty = true;
    }

    /* Case étendue : hors carte, on prolonge la case du bord la plus proche. */
    edge(x, y) { return [U.clamp(x, 0, W - 1), U.clamp(y, 0, H - 1)]; }
    terr(x, y) {
      const g = this.game;
      if (x >= 0 && y >= 0 && x < W && y < H) return g.terrain[y * W + x];
      const [ex, ey] = this.edge(x, y);
      return g.terrain[ey * W + ex] === TER.WATER && g.biome[ey * W + ex] === BI.SEA ? TER.WATER : -1;
    }
    biomeAt(x, y) { const [ex, ey] = this.edge(x, y); return this.game.biome[ey * W + ex]; }

    /* Profondeur de l'eau (distance à la berge), sur la zone étendue. */
    waterDepth() {
      const w = this.EW, h = this.EH;
      const d = new Uint8Array(w * h);
      const q = new Int32Array(w * h);
      let qh = 0, qt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (this.terr(x - MARGIN, y - MARGIN) !== TER.WATER) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (this.terr(nx - MARGIN, ny - MARGIN) !== TER.WATER) { d[y * w + x] = 1; q[qt++] = y * w + x; break; }
        }
      }
      while (qh < qt) {
        const c = q[qh++], x = c % w, y = (c / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!d[n] && this.terr(nx - MARGIN, ny - MARGIN) === TER.WATER) { d[n] = Math.min(250, d[c] + 1); q[qt++] = n; }
        }
      }
      return d;
    }

    /* Hauteur cible, amplitude du bruit et couleur par case. */
    computeFields() {
      const g = this.game, w = this.EW, h = this.EH;
      const th = new Float32Array(w * h), amp = new Float32Array(w * h), col = new Float32Array(w * h * 3);
      const depth = this.waterDepth();
      const seed = g.s.seed;
      // hauteur des bâtiments : moyenne du relief sous l'emprise
      this.bh.clear();
      const occH = new Float32Array(W * H).fill(NaN), occA = new Float32Array(W * H);
      for (const id in g.buildings) {
        const b = g.buildings[id];
        let sum = 0, n = 0;
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { sum += g.elev[y * W + x]; n++; }
        const hb = n ? Math.max(0.02, sum / n) : 0;
        this.bh.set(b.id, hb);
        const def = C.buildings[b.type];
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { occH[y * W + x] = hb; occA[y * W + x] = def.cat === 'enclos' ? 0.15 : 0; }
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const tx = x - MARGIN, ty = y - MARGIN, i = y * w + x;
        const inside = tx >= 0 && ty >= 0 && tx < W && ty < H;
        const [ex, ey] = this.edge(tx, ty);
        const ei = ey * W + ex;
        const t = this.terr(tx, ty);
        const bio = g.biome[ei];
        const r = U.hash(tx, ty, seed);
        let hh = g.elev[ei], a = 1, c;
        if (t === TER.WATER) {
          const dd = depth[i] || 1;
          if (bio === BI.SEA) { hh = -0.28 - Math.min(dd, 10) * 0.12; c = U.mixRgb(COL.wetSand, COL.seaBed, Math.min(1, dd / 4)); }
          else { hh = -0.22 - Math.min(dd, 3) * 0.09; c = COL.bed; }
          a = 0.35;
        } else if (t === TER.SAND) { c = COL.sand; a = 0.3; hh = Math.min(hh, 0.05); }
        else if (t === TER.ROCK || bio === BI.MOUNTAIN) {
          a = 2.4;
          c = hh > 5.2 ? COL.snow : hh > 3.8 ? U.mixRgb(COL.rock, COL.snow, U.clamp((hh - 3.8) / 1.4, 0, 1) * 0.7) : (r < 0.5 ? COL.rock : COL.darkRock);
        }
        else if (t === TER.DIRT) c = r < 0.5 ? COL.dry : COL.dirt;
        else if (bio === BI.FOREST) c = COL.forest[r < 0.5 ? 0 : 1];
        else if (bio === BI.JUNGLE) c = COL.jungle[r < 0.5 ? 0 : 1];
        else if (bio === BI.HILLS) { c = COL.hills[r < 0.5 ? 0 : 1]; a = 1.6; }
        else c = COL.plains[Math.floor(r * 3)];
        if (!inside && t !== TER.WATER) {
          // au-delà de la carte : le relief s'élève doucement (montagnes au nord)
          const d = Math.max(-tx, tx - W + 1, -ty, ty - H + 1);
          const k = U.smooth(U.clamp(d / MARGIN, 0, 1));
          const target = ty < 0 ? Math.max(hh, 3 + r * 2) : 0.35 + r * 0.6;
          hh = U.lerp(hh, target, k);
          a = U.lerp(a, ty < 0 ? 2.5 : 2, k);
          if (ty < 0 && hh > 4.5) c = U.mixRgb(c, COL.snow, U.clamp((hh - 4.5) / 1.5, 0, 0.8));
        }
        if (inside && t !== TER.WATER) {
          // seuls les bâtiments (pas les enclos ni les chemins) aplanissent leur emprise
          const k = ty * W + tx;
          if (!isNaN(occH[k]) && occA[k] === 0) { const b = g.buildingAt(tx, ty); if (C.buildings[b.type].cat !== 'deco') { hh = occH[k]; a = 0; } }
        }
        th[i] = hh; amp[i] = a;
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      this.f = { th, amp, col, w, h };
      // enclos à proximité de chaque case (pour les formes organiques)
      this.encNear = new Int32Array(W * H);
      for (const id in g.buildings) {
        const b = g.buildings[id];
        if (!g.isEnclosure(b)) continue;
        b._sh = DZ.encShape(b);
        for (let y = Math.max(0, b.y - 2); y < Math.min(H, b.y + b.h + 2); y++) for (let x = Math.max(0, b.x - 2); x < Math.min(W, b.x + b.w + 2); x++) this.encNear[y * W + x] = b.id;
      }
      this.buildPathSegments();
      this.noise = this.noise || U.makeFbm(seed + 77, 32, 3);
      this.ridge = this.ridge || U.makeFbm(seed + 91, 16, 2);
      this.ponds = [];
      for (const id in g.buildings) {
        const b = g.buildings[id], def = C.buildings[b.type];
        if (def.kind === 'land' && b.level >= 2 && b.w * b.h >= 60) {
          const rnd = U.rng(b.seed + b.level * 13);
          this.ponds.push({ x: b.x + b.w * (0.25 + rnd() * 0.5), z: b.y + b.h * (0.55 + rnd() * 0.2), rx: 0.8 + b.w * 0.06, rz: 0.6 + b.h * 0.05, base: this.bh.get(b.id) });
        }
      }
    }

    sample(arr, x, z, comps) {
      const f = this.f;
      const fx = U.clamp(x - 0.5 + MARGIN, 0, f.w - 1.001), fz = U.clamp(z - 0.5 + MARGIN, 0, f.h - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
      const i00 = iz * f.w + ix, i10 = i00 + 1, i01 = i00 + f.w, i11 = i01 + 1;
      if (comps === 1) return (arr[i00] * (1 - ax) + arr[i10] * ax) * (1 - az) + (arr[i01] * (1 - ax) + arr[i11] * ax) * az;
      const out = [0, 0, 0];
      for (let k = 0; k < 3; k++) out[k] = (arr[i00 * 3 + k] * (1 - ax) + arr[i10 * 3 + k] * ax) * (1 - az) + (arr[i01 * 3 + k] * (1 - ax) + arr[i11 * 3 + k] * ax) * az;
      return out;
    }

    /* ---------- Chemins organiques : segments entre centres lissés ---------- */
    buildPathSegments() {
      const g = this.game, pc = g.pathCenters(), ent = C.map.entrance;
      const segs = [], per = new Array(W * H);
      const add = (ax, az, bx, bz, tiles) => { const id = segs.length; segs.push([ax, az, bx, bz]); for (const t of tiles) (per[t] = per[t] || []).push(id); };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!g.path[i]) continue;
        const wi = g.terrain[i] === TER.WATER;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g.path[ny * W + nx]) continue;
          n++;
          if (dx < 0 || dy < 0) continue; // chaque paire une seule fois
          const j = ny * W + nx, wj = g.terrain[j] === TER.WATER;
          if (wi && wj) continue;
          let ax = pc[i * 2], az = pc[i * 2 + 1], bx = pc[j * 2], bz = pc[j * 2 + 1];
          // vers un pont : le pavé s'arrête au bord de la case d'eau
          if (wj) { bx = x + 0.5 + dx * 0.5; bz = y + 0.5 + dy * 0.5; }
          if (wi) { ax = nx + 0.5 - dx * 0.5; az = ny + 0.5 - dy * 0.5; }
          add(ax, az, bx, bz, [i, j]);
        }
        if (!wi && n === 0) add(pc[i * 2], pc[i * 2 + 1], pc[i * 2], pc[i * 2 + 1], [i]);
        if (x === ent.tileX && y === ent.tileY) add(pc[i * 2], pc[i * 2 + 1], x + 0.5, y + 1.2, [i]);
      }
      this.psegs = segs; this.pper = per;
      this.pseen = new Int32Array(segs.length); this.pstamp = 1;
    }
    /* Champ du chemin : > 0 sur le chemin, 0 au bord (union lissée de capsules). */
    pathField(x, z) {
      const ix = Math.floor(x), iz = Math.floor(z);
      if (!this.pper) return -9;
      let d = 9;
      const st = ++this.pstamp;
      for (let ty = iz - 1; ty <= iz + 1; ty++) for (let tx = ix - 1; tx <= ix + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const list = this.pper[ty * W + tx];
        if (!list) continue;
        for (const id of list) {
          if (this.pseen[id] === st) continue;
          this.pseen[id] = st;
          const sg = this.psegs[id];
          const dx = sg[2] - sg[0], dz = sg[3] - sg[1], l2 = dx * dx + dz * dz;
          const t = l2 > 0 ? U.clamp(((x - sg[0]) * dx + (z - sg[1]) * dz) / l2, 0, 1) : 0;
          const dd = Math.hypot(x - sg[0] - dx * t, z - sg[1] - dz * t);
          // union lissée : congés arrondis aux carrefours et aux virages
          const k = 0.28, hh = U.clamp(0.5 + 0.5 * (dd - d) / k, 0, 1);
          d = d * hh + dd * (1 - hh) - k * hh * (1 - hh);
        }
      }
      const u = ((x + MARGIN) / this.EW) % 1, v = ((z + MARGIN) / this.EH) % 1;
      return 0.43 + (this.noise((u * 7) % 1, (v * 7) % 1) - 0.5) * 0.09 - d;
    }
    pathBase(x, z) {
      const g = this.game;
      const fx = U.clamp(x - 0.5, 0, W - 1.001), fz = U.clamp(z - 0.5, 0, H - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz, i = iz * W + ix;
      const e = (g.elev[i] * (1 - ax) + g.elev[i + 1] * ax) * (1 - az) + (g.elev[i + W] * (1 - ax) + g.elev[i + W + 1] * ax) * az;
      return Math.max(0.02, e);
    }
    shoreAt(x, z) {
      const sh = this.game.shore;
      const fx = U.clamp(x - 0.5, 0, W - 1.001), fz = U.clamp(z - 0.5, 0, H - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz, i = iz * W + ix;
      let d = (sh[i] * (1 - ax) + sh[i + 1] * ax) * (1 - az) + (sh[i + W] * (1 - ax) + sh[i + W + 1] * ax) * az;
      // la mer se prolonge à l'est, la rivière hors de la carte
      if (x > W) d -= (x - W);
      return d;
    }
    encAt(x, z) {
      const ix = Math.floor(x), iz = Math.floor(z);
      if (ix < 0 || iz < 0 || ix >= W || iz >= H || !this.encNear) return null;
      const id = this.encNear[iz * W + ix];
      return id ? this.game.buildings[id] : null;
    }

    vertexHeight(x, z) {
      const f = this.f;
      const ss = (a, b, t) => U.smooth(U.clamp((t - a) / (b - a), 0, 1));
      let h = this.sample(f.th, x, z, 1);
      const a = this.sample(f.amp, x, z, 1);
      const u = ((x + MARGIN) / this.EW) % 1, v = ((z + MARGIN) / this.EH) % 1;
      h += (this.noise(u, v) - 0.5) * 0.16 * a;
      if (a > 1.8) h += (1 - Math.abs(this.ridge(u, v) * 2 - 1)) * (a - 1.8) * 0.7;
      // rivages arrondis : berge en pente douce puis lit de l'eau
      const sd = this.shoreAt(x, z);
      if (sd < 1.6) {
        const sea = this.biomeAt(Math.floor(x), Math.floor(z)) === BI.SEA || x > W - 2;
        const land = Math.min(h, 0.03 + Math.max(0, sd) * 0.32);
        const bed = sea ? -0.3 - Math.min(-sd, 10) * 0.12 : -0.2 - Math.min(-sd, 3) * 0.1;
        h = U.lerp(bed, land, ss(-0.9, 0.7, sd));
      }
      // enclos : sol aplani à l'intérieur de la clôture, fondu au-delà
      const b = this.encAt(x, z);
      if (b) {
        const d = DZ.encSDF(b, x, z, b._sh), base = this.bh.get(b.id);
        const w = 1 - ss(-0.1, 1.4, d);
        if (w > 0) h = U.lerp(h, base + (this.noise((u * 3) % 1, (v * 3) % 1) - 0.5) * 0.06 * (d < -1 ? 1 : 0), w);
        if (C.buildings[b.type].kind === 'water' && d < -0.45) h = base - 0.4 * ss(-0.45, -1.7, d);
      }
      // chemins : le terrain s'efface sous le ruban pavé
      const pf = this.pathField(x, z);
      if (pf > -0.45) h = U.lerp(h, this.pathBase(x, z) - 0.01, ss(-0.45, 0.02, pf));
      for (const p of this.ponds) {
        const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
        if (d < 1.3) h = Math.min(h, U.lerp(p.base - 0.3, p.base, U.smooth(U.clamp((d - 0.4) / 0.9, 0, 1))));
      }
      return h;
    }

    heightAt(x, z) {
      const fx = U.clamp((x + MARGIN) * RES, 0, this.gw - 1.001), fz = U.clamp((z + MARGIN) * RES, 0, this.gh - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz), ax = fx - ix, az = fz - iz;
      const H0 = this.heights, w = this.gw, i = iz * w + ix;
      return (H0[i] * (1 - ax) + H0[i + 1] * ax) * (1 - az) + (H0[i + w] * (1 - ax) + H0[i + w + 1] * ax) * az;
    }
    buildingHeight(b) { return this.bh.has(b.id) ? this.bh.get(b.id) : this.footprintHeight(b.x, b.y, b.w, b.h); }
    footprintHeight(x0, y0, w, h) {
      const g = this.game; let s = 0, n = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < W && y < H) { s += g.elev[y * W + x]; n++; }
      return n ? Math.max(0.02, s / n) : 0;
    }

    /* Recalcule les hauteurs d'un tronçon (et sa bordure). */
    updateHeights(c) {
      const i0 = Math.max(0, (c.x0 + MARGIN) * RES - 1), i1 = Math.min(this.gw - 1, (c.x1 + MARGIN) * RES + 1);
      const j0 = Math.max(0, (c.y0 + MARGIN) * RES - 1), j1 = Math.min(this.gh - 1, (c.y1 + MARGIN) * RES + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.heights[j * this.gw + i] = this.vertexHeight(i / RES - MARGIN, j / RES - MARGIN);
    }

    buildTerrain(c) {
      const mb = new G.MB();
      mb.material('ground');
      const gw = this.gw;
      const i0 = (c.x0 + MARGIN) * RES, i1 = (c.x1 + MARGIN) * RES, j0 = (c.y0 + MARGIN) * RES, j1 = (c.y1 + MARGIN) * RES;
      const nx = i1 - i0 + 1;
      let mn = 1e9, mx = -1e9;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = i / RES - MARGIN, z = j / RES - MARGIN;
        const h = this.heights[j * gw + i];
        mn = Math.min(mn, h); mx = Math.max(mx, h);
        const hl = this.heights[j * gw + Math.max(0, i - 1)], hr = this.heights[j * gw + Math.min(gw - 1, i + 1)];
        const hd = this.heights[Math.max(0, j - 1) * gw + i], hu = this.heights[Math.min(this.gh - 1, j + 1) * gw + i];
        const u = ((x + MARGIN) / this.EW) % 1, v = ((z + MARGIN) / this.EH) % 1;
        const wx = x + (this.noise((u * 5 + 0.37) % 1, (v * 5) % 1) - 0.5) * 2.2, wz = z + (this.noise((u * 5) % 1, (v * 5 + 0.61) % 1) - 0.5) * 2.2;
        let col = this.sample(this.f.col, wx, wz, 3);
        const ss = (a, b, t) => U.smooth(U.clamp((t - a) / (b - a), 0, 1));
        // rivages : sable, sable mouillé puis fond
        const sd = this.shoreAt(x, z);
        if (sd < 1.3) {
          const sea = this.biomeAt(Math.floor(x), Math.floor(z)) === BI.SEA || x > W - 2;
          const beach = this.biomeAt(Math.floor(wx), Math.floor(wz)) === BI.BEACH || sea;
          col = U.mixRgb(col, beach ? COL.sand : COL.wetSand, 1 - ss(0.5, 1.3, sd));
          col = U.mixRgb(col, COL.wetSand, 1 - ss(-0.1, 0.45, sd));
          if (sd < -0.1) col = U.mixRgb(col, sea ? COL.seaBed : COL.bed, ss(-0.1, -0.8, sd));
        }
        // sols d'enclos (forme arrondie, taches de terre et d'herbe)
        const eb = this.encAt(x, z);
        if (eb) {
          const def = C.buildings[eb.type], d = DZ.encSDF(eb, x, z, eb._sh), lv = eb.level;
          const n = this.noise((u * 9) % 1, (v * 9) % 1);
          let fc;
          if (def.kind === 'water') fc = d < -0.45 ? U.mixRgb(COL.bed, [0.2, 0.32, 0.34], ss(-0.5, -2, d)) : lv === 1 ? COL.sand : U.mixRgb([0.62, 0.6, 0.55], COL.sand, n * 0.4);
          else if (def.kind === 'air') fc = U.mixRgb(COL.plains[1], COL.dirt, ss(0.45, 0.7, n));
          else if (lv === 1) fc = U.mixRgb(COL.dry, COL.dirt, ss(0.35, 0.65, n));
          else if (lv === 2) fc = U.mixRgb(COL.plains[0], COL.mud, ss(0.55, 0.75, n));
          else fc = U.mixRgb(COL.lush, COL.sand, ss(0.68, 0.8, n));
          // bande piétinée le long de la clôture
          if (def.kind === 'land' && d > -0.7) fc = U.mixRgb(fc, COL.dirt, ss(-0.7, -0.15, d) * 0.6);
          col = U.mixRgb(col, fc, 1 - ss(-0.15, 0.25, d));
        }
        // terre piétinée au bord des chemins
        const pf = this.pathField(x, z);
        if (pf > -0.6) col = U.mixRgb(col, COL.dirt, ss(-0.6, -0.08, pf) * 0.45);
        // les pentes raides deviennent rocheuses
        const slope = Math.hypot(hl - hr, hd - hu) * RES / 2;
        let cc = col;
        if (slope > 0.9 && h > 0.4) cc = U.mixRgb(col, COL.rock, U.clamp((slope - 0.9) / 1.2, 0, 0.85));
        const vv = 0.93 + U.hash(i, j, 5) * 0.14;
        mb.vert(x, h, z, (hl - hr) * RES / 2, 1, (hd - hu) * RES / 2, [cc[0] * vv, cc[1] * vv, cc[2] * vv]);
      }
      for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        mb.quad(a, a + nx, a + nx + 1, a + 1);
      }
      c.minH = mn; c.maxH = mx;
      return mb.finish();
    }

    buildPaths(c) {
      const g = this.game, mb = new G.MB();
      const ent = C.map.entrance;
      // ponts sur les cases d'eau
      for (let y = Math.max(0, c.y0); y < Math.min(H, c.y1); y++) for (let x = Math.max(0, c.x0); x < Math.min(W, c.x1); x++) {
        if (!g.isPath(x, y) || this.terr(x, y) !== TER.WATER) continue;
        const n = { u: g.isPath(x, y - 1), d: g.isPath(x, y + 1) || (x === ent.tileX && y === ent.tileY), l: g.isPath(x - 1, y), r: g.isPath(x + 1, y) };
        const vertical = (n.u || n.d) && !(n.l || n.r);
        mb.push().t(x + 0.5, 0, y + 0.5);
        if (vertical) mb.ry(Math.PI / 2);
        const deck = 0.07;
        mb.material('wood');
        for (let k = 0; k < 7; k++) mb.push().t(-0.5 + (k + 0.5) / 7, deck - 0.03, 0).col(k % 2 ? '#8a6545' : '#7b583a').box(1 / 7 - 0.012, 0.03, 0.86).pop();
        mb.col('#5a3e26');
        for (const s2 of [-1, 1]) {
          mb.push().t(0, deck - 0.07, s2 * 0.4).box(1.02, 0.05, 0.08).pop();
          mb.push().t(0, deck + 0.17, s2 * 0.44).box(1.02, 0.035, 0.04).pop();
          for (const px of [-0.45, 0.05]) mb.push().t(px, -0.9, s2 * 0.44).box(0.06, deck + 1.1, 0.06).pop();
        }
        mb.pop();
      }
      // ruban pavé : contour lissé du champ du chemin
      const S = 0.2;
      const x0 = Math.max(0, c.x0), z0 = Math.max(0, c.y0), x1 = Math.min(W, c.x1), z1 = Math.min(H, c.y1);
      if (x1 <= x0 || z1 <= z0) return mb.empty ? null : mb.finish();
      let any = false;
      for (let y = z0 - 1; y <= z1 && !any; y++) for (let x = x0 - 1; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < H && this.pper[y * W + x]) { any = true; break; }
      if (!any) return mb.empty ? null : mb.finish();
      const nx = Math.round((x1 - x0) / S), nz = Math.round((z1 - z0) / S);
      const F = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) F[j * (nx + 1) + i] = this.pathField(x0 + i * S, z0 + j * S);
      mb.material('stone');
      const stone = [0.66, 0.61, 0.53], edge = [0.36, 0.32, 0.26];
      const vtx = (px, pz, f) => {
        const k = U.smooth(U.clamp(f / 0.12, 0, 1));
        const tn = 0.94 + U.hash(Math.floor(px * 3), Math.floor(pz * 3), 7) * 0.1;
        const cc = [U.lerp(edge[0], stone[0], k) * tn, U.lerp(edge[1], stone[1], k) * tn, U.lerp(edge[2], stone[2], k) * tn];
        return mb.vert(px, this.pathBase(px, pz) + 0.022 + Math.min(Math.max(f, 0), 0.2) * 0.08, pz, 0, 1, 0, cc);
      };
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const v = [F[j * (nx + 1) + i], F[j * (nx + 1) + i + 1], F[(j + 1) * (nx + 1) + i + 1], F[(j + 1) * (nx + 1) + i]];
        if (v[0] < 0 && v[1] < 0 && v[2] < 0 && v[3] < 0) continue;
        const P = [[x0 + i * S, z0 + j * S], [x0 + (i + 1) * S, z0 + j * S], [x0 + (i + 1) * S, z0 + (j + 1) * S], [x0 + i * S, z0 + (j + 1) * S]];
        const poly = [];
        for (let k = 0; k < 4; k++) {
          const a = v[k], b2 = v[(k + 1) % 4];
          if (a >= 0) poly.push([P[k][0], P[k][1], a]);
          if ((a >= 0) !== (b2 >= 0)) { const t = a / (a - b2); poly.push([U.lerp(P[k][0], P[(k + 1) % 4][0], t), U.lerp(P[k][1], P[(k + 1) % 4][1], t), 0]); }
        }
        if (poly.length < 3) continue;
        const ids = poly.map((p) => vtx(p[0], p[1], p[2]));
        for (let k = 1; k < ids.length - 1; k++) mb.tri(ids[0], ids[k + 1], ids[k]);
      }
      return mb.empty ? null : mb.finish();
    }

    buildWater(c) {
      const mb = new G.MB(), S = 2;
      for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (this.terr(x + dx, y + dy) === TER.WATER) { near = true; break; }
        const b = (x >= 0 && y >= 0 && x < W && y < H) ? this.game.buildingAt(x, y) : null;
        const lag = b && C.buildings[b.type].kind === 'water' && x > b.x && x < b.x + b.w - 1 && y > b.y && y < b.y + b.h - 1;
        let pond = false;
        for (const p of this.ponds) if (Math.abs(x + 0.5 - p.x) < p.rx + 1.2 && Math.abs(y + 0.5 - p.z) < p.rz + 1.2) pond = p;
        if (!near && !lag && !pond) continue;
        const wy = lag ? this.bh.get(b.id) - 0.08 : pond ? pond.base - 0.07 : WATER_Y;
        const base = mb.v.length / 10;
        for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
          const px = x + i / S, pz = y + j / S;
          const depth = U.clamp((wy - this.heightAt(px, pz)) / 0.35, 0, 1);
          const k = mb.vert(px, wy, pz, 0, 1, 0, [0, 0, 0]);
          mb.v[k * 10 + 9] = depth;
        }
        for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = base + j * (S + 1) + i; mb.quad(a, a + S + 1, a + S + 2, a + 1); }
      }
      return mb.empty ? null : mb.finish();
    }

    /* Rochers épars (montagnes, collines, forêts) : maillage statique du tronçon. */
    buildDeco(c) {
      const g = this.game, mb = new G.MB(), seed = g.s.seed;
      for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) {
        const t = this.terr(x, y);
        if (t === TER.WATER) continue;
        if (x >= 0 && y >= 0 && x < W && y < H && g.buildingAt(x, y)) continue;
        const bio = this.biomeAt(x, y);
        const h = U.hash(x, y, seed + 5);
        const p = t === TER.ROCK || bio === BI.MOUNTAIN ? 0.12 : bio === BI.HILLS ? 0.06 : bio === BI.FOREST ? 0.02 : 0.006;
        if (h > p) continue;
        const px = x + 0.3 + U.hash(x, y, 2) * 0.4, pz = y + 0.3 + U.hash(x, y, 3) * 0.4;
        if (this.pathField(px, pz) > -0.4) continue;
        G.rockInto(mb, px, this.heightAt(px, pz) - 0.06, pz, h < p * 0.3 ? 'L' : h < p * 0.6 ? 'M' : 'S', (x * 31 + y * 17) & 0xffff);
      }
      return mb.empty ? null : mb.finish();
    }

    /* Arbres d'un tronçon : naturels, hors carte (décor), décoratifs et d'enclos. */
    chunkTrees(c, extra) {
      const g = this.game, out = [];
      const seed = g.s.seed;
      for (let y = Math.max(0, c.y0); y < Math.min(H, c.y1); y++) for (let x = Math.max(0, c.x0); x < Math.min(W, c.x1); x++) {
        const k = g.treeAt[y * W + x];
        if (!k || g.cleared[y * W + x]) continue;
        const t = g.trees[k - 1];
        if (this.pathField(t.x, t.y) > -0.2 || this.shoreAt(t.x, t.y) < 0.1) continue;
        out.push([t.k, t.sd, t.x, t.y, t.sc]);
      }
      // hors carte : forêt et jungle prolongées
      for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H) continue;
        if (this.terr(x, y) === TER.WATER) continue;
        const bio = this.biomeAt(x, y);
        const h = U.hash(x, y, seed + 41);
        const dens = bio === BI.MOUNTAIN ? 0.05 : bio === BI.SEA || bio === BI.BEACH ? 0.1 : 0.36;
        if (h > dens) continue;
        const kk = U.hash(x, y, 43);
        const kind = bio === BI.JUNGLE ? (kk < 0.4 ? 'palmier' : kk < 0.7 ? 'ginkgo' : 'cycas') : bio === BI.BEACH ? 'palmier' : (kk < 0.6 ? 'araucaria' : kk < 0.85 ? 'ginkgo' : 'buisson');
        out.push([kind, (x * 1000 + y * 7) & 0xffff, x + 0.5, y + 0.5, 1 + h * 2]);
      }
      for (const e of extra) if (e[2] >= c.x0 && e[2] < c.x1 && e[3] >= c.y0 && e[3] < c.y1) out.push(e);
      return out;
    }

    tufts(c, density) {
      const g = this.game, out = [], seed = g.s.seed;
      for (let y = Math.max(-2, c.y0); y < Math.min(H + 2, c.y1); y++) for (let x = Math.max(-2, c.x0); x < Math.min(W + 2, c.x1); x++) {
        const t = this.terr(x, y);
        if (t === TER.WATER || t === TER.ROCK || t === -1) continue;
        const b = g.buildingAt(x, y);
        if (b) { const def = C.buildings[b.type]; if (def.cat !== 'enclos' || def.kind === 'water') continue; }
        const n = Math.round(density * (t === TER.SAND ? 0.3 : t === TER.DIRT ? 0.6 : 1));
        for (let k = 0; k < n; k++) {
          const px = x + U.hash(x, y, seed + k * 3), pz = y + U.hash(x, y, seed + k * 3 + 1);
          if (this.pathField(px, pz) > -0.12 || this.shoreAt(px, pz) < 0.15) continue;
          out.push([px, this.heightAt(px, pz), pz, 0.55 + U.hash(x, y, seed + k * 3 + 2) * 0.7, U.hash(x + k, y, 77) * 6.28, t === TER.DIRT ? 0.85 : 1]);
        }
      }
      return out;
    }

    /* Mer au large et paysage lointain (au-delà des tronçons). */
    buildFar() {
      const mb = new G.MB(), x0 = -MARGIN, x1 = W + MARGIN, z0 = -MARGIN, z1 = H + MARGIN, F = 900;
      const sea = mb.v.length / 10;
      const add = (x, z) => { const k = mb.vert(x, WATER_Y, z, 0, 1, 0, [0, 0, 0]); mb.v[k * 10 + 9] = 1; return k; };
      // la mer s'étend à l'horizon du côté où la disposition l'a placée
      const west = this.game.layout && this.game.layout.seaSide === 'W';
      const sx0 = west ? x0 - F : x1, sx1 = west ? x0 : x1 + F;
      const a = add(sx0, z0 - F), b = add(sx1, z0 - F), c2 = add(sx1, z1 + F), d = add(sx0, z1 + F);
      mb.quad(a, d, c2, b);
      void sea;
      const water = mb.finish();
      const land = new G.MB();
      land.material('ground');
      const skirt = (xa, za, xb, zb, y, col) => land.col(col).face([xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za]);
      const lx0 = west ? x0 : x0 - F, lx1 = west ? x1 + F : x1;
      skirt(lx0, z1, lx1, z1 + F, 0.5, [0.2, 0.32, 0.12]);
      if (west) skirt(x1, z0, x1 + F, z1, 0.6, [0.2, 0.32, 0.12]); else skirt(x0 - F, z0, x0, z1, 0.6, [0.2, 0.32, 0.12]);
      skirt(lx0, z0 - F, lx1, z0, 4.5, [0.5, 0.5, 0.5]);
      return { water, land: land.finish() };
    }
  }

  G.World3D = World3D;
})();
