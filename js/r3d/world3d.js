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
          const k = ty * W + tx;
          if (g.path[k]) { hh = Math.max(0.02, g.elev[k]); a = 0; c = COL.pave; }
          if (!isNaN(occH[k])) {
            hh = occH[k]; a = occA[k];
            const b = g.buildingAt(tx, ty), def = C.buildings[b.type];
            if (def.cat === 'enclos') {
              const lv = b.level, rr = U.hash(tx * 3, ty * 7, b.seed);
              if (def.kind === 'water') {
                const inner = tx > b.x && tx < b.x + b.w - 1 && ty > b.y && ty < b.y + b.h - 1;
                c = inner ? COL.bed : (lv === 1 ? COL.sand : [0.62, 0.6, 0.55]);
                if (inner) { hh = hh - 0.36; a = 0; }
              } else if (def.kind === 'air') c = rr < 0.3 ? COL.dirt : COL.plains[1];
              else c = lv === 1 ? (rr < 0.45 ? COL.dirt : COL.dry) : lv === 2 ? (rr < 0.25 ? COL.mud : COL.plains[0]) : (rr < 0.15 ? COL.sand : COL.lush);
            } else if (!['arbre', 'palmier', 'fougere'].includes(b.type)) c = COL.pave;
          }
        }
        th[i] = hh; amp[i] = a;
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      // berges humides autour de l'eau douce
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const tx = x - MARGIN, ty = y - MARGIN, i = y * w + x;
        if (this.terr(tx, ty) === TER.WATER || amp[i] === 0) continue;
        let nearW = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.terr(tx + dx, ty + dy) === TER.WATER) nearW = true;
        if (nearW) { col[i * 3] = COL.wetSand[0]; col[i * 3 + 1] = COL.wetSand[1]; col[i * 3 + 2] = COL.wetSand[2]; th[i] = Math.min(th[i], -0.02); }
      }
      this.f = { th, amp, col, w, h };
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

    vertexHeight(x, z) {
      const f = this.f;
      let h = this.sample(f.th, x, z, 1);
      const a = this.sample(f.amp, x, z, 1);
      const u = ((x + MARGIN) / this.EW) % 1, v = ((z + MARGIN) / this.EH) % 1;
      h += (this.noise(u, v) - 0.5) * 0.16 * a;
      if (a > 1.8) h += (1 - Math.abs(this.ridge(u, v) * 2 - 1)) * (a - 1.8) * 0.7;
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
        const col = this.sample(this.f.col, x, z, 3);
        // les pentes raides deviennent rocheuses
        const slope = Math.hypot(hl - hr, hd - hu) * RES / 2;
        let cc = col;
        if (slope > 0.9 && h > 0.4) cc = U.mixRgb(col, COL.rock, U.clamp((slope - 0.9) / 1.2, 0, 0.85));
        const v = 0.93 + U.hash(i, j, 5) * 0.14;
        mb.vert(x, h, z, (hl - hr) * RES / 2, 1, (hd - hu) * RES / 2, [cc[0] * v, cc[1] * v, cc[2] * v]);
      }
      for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        mb.quad(a, a + nx, a + nx + 1, a + 1);
      }
      c.minH = mn; c.maxH = mx;
      return mb.finish();
    }

    buildPaths(c) {
      const g = this.game, mb = new G.MB(), ent = C.map.entrance;
      for (let y = Math.max(0, c.y0); y < Math.min(H, c.y1); y++) for (let x = Math.max(0, c.x0); x < Math.min(W, c.x1); x++) {
        if (!g.isPath(x, y)) continue;
        const n = { u: g.isPath(x, y - 1), d: g.isPath(x, y + 1) || (x === ent.tileX && y === ent.tileY), l: g.isPath(x - 1, y), r: g.isPath(x + 1, y) };
        const water = this.terr(x, y) === TER.WATER;
        const base = water ? 0 : Math.max(0.02, g.elev[y * W + x]);
        mb.push().t(x + 0.5, base, y + 0.5);
        if (water) {
          const vertical = (n.u || n.d) && !(n.l || n.r);
          if (vertical) mb.ry(Math.PI / 2);
          const deck = 0.07;
          mb.material('wood');
          for (let k = 0; k < 7; k++) mb.push().t(-0.5 + (k + 0.5) / 7, deck - 0.03, 0).col(k % 2 ? '#8a6545' : '#7b583a').box(1 / 7 - 0.012, 0.03, 0.86).pop();
          mb.col('#5a3e26');
          for (const s of [-1, 1]) {
            mb.push().t(0, deck - 0.07, s * 0.4).box(1.02, 0.05, 0.08).pop();
            mb.push().t(0, deck + 0.17, s * 0.44).box(1.02, 0.035, 0.04).pop();
            for (const px of [-0.45, 0.05]) mb.push().t(px, -0.9, s * 0.44).box(0.06, deck + 1.1, 0.06).pop();
          }
          mb.pop();
          continue;
        }
        const tint = 0.95 + U.hash(x, y, 9) * 0.1;
        mb.material('stone').col([0.69 * tint, 0.64 * tint, 0.55 * tint]);
        mb.face([-0.5, 0.03, 0.5], [0.5, 0.03, 0.5], [0.5, 0.03, -0.5], [-0.5, 0.03, -0.5]);
        mb.col('#6c6354');
        const curb = (cx, cz, w, d) => mb.push().t(cx, -0.12, cz).box(w, 0.175, d).pop();
        if (!n.u) curb(0, -0.46, 1, 0.08);
        if (!n.d) curb(0, 0.46, 1, 0.08);
        if (!n.l) curb(-0.46, 0, 0.08, 1);
        if (!n.r) curb(0.46, 0, 0.08, 1);
        // jupe : rejoint le terrain voisin s'il est plus bas
        mb.material('stone').col('#5a5246');
        if (n.u && Math.abs(g.elev[(y - 1) * W + x] - g.elev[y * W + x]) > 0.04) mb.push().t(0, -0.2, -0.5).box(1, 0.23, 0.02).pop();
        if (n.l && Math.abs(g.elev[y * W + x - 1] - g.elev[y * W + x]) > 0.04) mb.push().t(-0.5, -0.2, 0).box(0.02, 0.23, 1).pop();
        mb.pop();
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
        if (x >= 0 && y >= 0 && x < W && y < H && (g.isPath(x, y) || g.buildingAt(x, y))) continue;
        const bio = this.biomeAt(x, y);
        const h = U.hash(x, y, seed + 5);
        const p = t === TER.ROCK || bio === BI.MOUNTAIN ? 0.12 : bio === BI.HILLS ? 0.06 : bio === BI.FOREST ? 0.02 : 0.006;
        if (h > p) continue;
        const px = x + 0.3 + U.hash(x, y, 2) * 0.4, pz = y + 0.3 + U.hash(x, y, 3) * 0.4;
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
        if (g.isPath(x, y)) continue;
        const b = g.buildingAt(x, y);
        if (b) { const def = C.buildings[b.type]; if (def.cat !== 'enclos' || def.kind === 'water') continue; }
        const n = Math.round(density * (t === TER.SAND ? 0.3 : t === TER.DIRT ? 0.6 : 1));
        for (let k = 0; k < n; k++) {
          const px = x + U.hash(x, y, seed + k * 3), pz = y + U.hash(x, y, seed + k * 3 + 1);
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
      const a = add(x1, z0 - F), b = add(x1 + F, z0 - F), c2 = add(x1 + F, z1 + F), d = add(x1, z1 + F);
      mb.quad(a, d, c2, b);
      void sea;
      const water = mb.finish();
      const land = new G.MB();
      land.material('ground');
      const skirt = (xa, za, xb, zb, y, col) => land.col(col).face([xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za]);
      skirt(x0 - F, z1, x1, z1 + F, 0.5, [0.2, 0.32, 0.12]);
      skirt(x0 - F, z0, x0, z1, 0.6, [0.2, 0.32, 0.12]);
      skirt(x0 - F, z0 - F, x1, z0, 4.5, [0.5, 0.5, 0.5]);
      return { water, land: land.finish() };
    }
  }

  G.World3D = World3D;
})();
