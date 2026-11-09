/* =====================================================================
   DinoZoo — Logique de jeu (sans dépendance au DOM ni au rendu).
   Carte, chemins, bâtiments, visiteurs, économie, dinosaures,
   événements, note du parc, sauvegarde.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util;
  const W = C.map.w, H = C.map.h;
  const TER = { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3, ROCK: 4 };
  const SIZE_RANK = { S: 1, M: 2, L: 3 };
  const ENT = C.map.entrance;
  const idx = (x, y) => y * W + x;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const HOUR_LEN = C.time.daySeconds / (C.time.endHour - C.time.startHour);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  DZ.TER = TER;

  /* ------------------------------------------------------------------
     Génération de la carte
     ------------------------------------------------------------------ */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = U.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  /* Biomes : 0 plaine, 1 forêt, 2 jungle, 3 montagne, 4 plage, 5 mer, 6 lac / rivière, 7 collines */
  const BIOME = { PLAINS: 0, FOREST: 1, JUNGLE: 2, MOUNTAIN: 3, BEACH: 4, SEA: 5, LAKE: 6, HILLS: 7 };
  DZ.BIOME = BIOME;

  function polyDist(px, py, pts) {
    let d = 1e9;
    for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return d;
  }

  /* Carte : relief (élévation), type de terrain et biome par case. */
  function generateTerrain(seed) {
    const r = U.rng(seed);
    const terr = new Uint8Array(W * H), elev = new Float32Array(W * H), biome = new Uint8Array(W * H);
    const big = U.makeFbm(seed + 7, 3, 4), detail = U.makeFbm(seed + 13, 8, 3), moist = U.makeFbm(seed + 21, 3, 3), ridgeN = U.makeFbm(seed + 33, 6, 3);
    const ex = ENT.tileX, ey = ENT.tileY;
    // lac à l'ouest, rivière des montagnes au lac puis à la mer
    const lake = { x: W * (0.2 + r() * 0.05), y: H * (0.48 + r() * 0.06), rx: 11 + r() * 3, ry: 7 + r() * 2 };
    const coastAt = (v) => W * (0.8 + (big(0.37, v * 0.8) - 0.5) * 0.14 + Math.sin(v * 9 + seed) * 0.012);
    const mountainAt = (u) => H * (0.24 + (big(u * 0.9, 0.11) - 0.5) * 0.2);
    const riverIn = [[W * 0.27 + r() * 6, H * 0.06], [W * 0.25 + r() * 6, H * 0.2], [W * 0.22 + r() * 4, H * 0.32], [lake.x + 2, lake.y - lake.ry + 1]];
    const cy = H * (0.57 + r() * 0.04);
    const riverOut = [[lake.x + lake.rx - 1, lake.y + 1], [W * 0.36, cy + 4], [W * 0.46, cy - 2], [W * 0.56, cy + 3], [W * 0.66, cy - 3], [coastAt(cy / H) + 3, cy + 1]];
    const ponds = [];
    for (let k = 0; k < 4; k++) ponds.push({ x: W * (0.38 + r() * 0.34), y: H * (0.68 + r() * 0.18), r: 1.6 + r() * 1.8 });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y), u = x / W, v = y / H, px = x + 0.5, py = y + 0.5;
      const coast = coastAt(v);
      const dCoast = px - coast;
      const mLine = mountainAt(u);
      const m = U.clamp((mLine - py) / 14, 0, 1) * (0.55 + big(u * 2.3, 0.7) * 0.7);
      const ridge = 1 - Math.abs(ridgeN(u, v) * 2 - 1);
      let e = 0.05 + big(u, v) * 0.32 + (detail(u, v) - 0.5) * 0.08;
      const hill = Math.max(0, big(u * 1.7 + 0.3, v * 1.7) - 0.6) * 3.2;
      e += hill;
      e += m * m * (0.4 + Math.pow(ridge, 2) * 9) + m * 0.5;
      // la côte descend vers la mer
      if (dCoast > -6) e *= U.clamp(-dCoast / 6, 0, 1);
      const dRiver = Math.min(polyDist(px, py, riverIn), polyDist(px, py, riverOut));
      const dLake = Math.hypot((px - lake.x) / lake.rx, (py - lake.y) / lake.ry) - 1 + (detail(u * 2, v * 2) - 0.5) * 0.35;
      const zoneEntree = Math.abs(px - (ex + 0.5)) < 16 && py > H - 24;
      if (zoneEntree) e = Math.min(e, 0.12 + (detail(u, v) - 0.5) * 0.05);
      let t = TER.GRASS, b = BIOME.PLAINS;
      let dPond = 9;
      for (const p of ponds) dPond = Math.min(dPond, Math.hypot(px - p.x, py - p.y) - p.r);
      // vallées : le relief s'abaisse en pente douce vers la rivière et le lac
      e = Math.min(e, 0.12 + Math.max(0, dRiver - 1.2) * 0.32, 0.1 + Math.max(0, dLake) * 4);
      const wet = moist(u * 1.3, v * 1.3) + (0.5 - u) * 0.22 + Math.max(0, 1 - dRiver / 7) * 0.18 + Math.max(0, 0.5 - dLake) * 0.25;
      if (dCoast > 0) { t = TER.WATER; b = BIOME.SEA; e = -Math.min(1, dCoast / 8); }
      else if (dCoast > -3 - detail(u, v) * 2) { t = TER.SAND; b = BIOME.BEACH; e = Math.min(e, 0.06); }
      else if (!zoneEntree && (dLake < 0 || dRiver < 1.15 || dPond < 0)) { t = TER.WATER; b = BIOME.LAKE; e = 0; }
      else if (!zoneEntree && (dLake < 0.18 || dRiver < 1.9 || dPond < 0.8)) { t = TER.SAND; b = BIOME.BEACH; e = Math.min(e, 0.08); }
      else if (e > 2.2 && m > 0.12) { t = TER.ROCK; b = BIOME.MOUNTAIN; }
      else if (m > 0.12 || e > 0.9) { b = e > 0.7 ? BIOME.HILLS : BIOME.FOREST; if (e > 1.6) t = TER.ROCK; }
      else if (wet > 0.6 && u < 0.6) b = BIOME.JUNGLE;
      else if (wet > 0.53) b = BIOME.FOREST;
      else b = BIOME.PLAINS;
      if (zoneEntree && t !== TER.WATER) b = BIOME.PLAINS;
      if (t === TER.GRASS && b === BIOME.PLAINS && detail(u * 1.5, v * 1.5) > 0.66) t = TER.DIRT;
      terr[i] = t; elev[i] = e; biome[i] = b;
    }
    return { terr, elev, biome };
  }

  /* Arbres déterministes par case (selon le biome). */
  const TREE_TABLE = {
    [BIOME.PLAINS]: [0.035, [['buisson', 4], ['ginkgo', 2], ['araucaria', 1], ['fougere', 1]]],
    [BIOME.FOREST]: [0.42, [['araucaria', 6], ['ginkgo', 3], ['buisson', 1.5], ['fougere', 1]]],
    [BIOME.JUNGLE]: [0.55, [['palmier', 4], ['cycas', 3], ['fougere', 3], ['buisson', 2], ['ginkgo', 1.5]]],
    [BIOME.HILLS]: [0.22, [['araucaria', 5], ['buisson', 2], ['arbremort', 0.6]]],
    [BIOME.BEACH]: [0.07, [['palmier', 5], ['cycas', 1]]],
    [BIOME.MOUNTAIN]: [0.015, [['arbremort', 1], ['buisson', 1]]]
  };
  function generateTrees(seed, map) {
    const trees = [];
    const at = new Int32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const t = map.terr[i];
      if (t === TER.WATER) continue;
      if (Math.abs(x - ENT.tileX) < 9 && y > H - 14) continue;
      const tab = TREE_TABLE[map.biome[i]];
      if (!tab) continue;
      const h = U.hash(x, y, seed);
      if (h > tab[0]) continue;
      const r = U.rng((x * 73856093) ^ (y * 19349663) ^ seed);
      const kind = U.weighted(r, tab[1]);
      trees.push({ x: x + 0.25 + r() * 0.5, y: y + 0.3 + r() * 0.45, k: kind, sd: (r() * 1e6) | 0, sc: 0.8 + r() * 0.5, i });
      at[i] = trees.length;
    }
    return { trees, at };
  }

  /* ------------------------------------------------------------------
     Jeu
     ------------------------------------------------------------------ */
  class Game extends U.Emitter {
    constructor() {
      super();
      this.visitors = [];
      this.fields = new Map();
      this.netVersion = 0;
      this.speedIndex = 1;
      this.maxGroups = C.visitors.maxGroups.high;
      this.s = null;
      this._norm = this._arrivalNorm();
    }

    /* ---------- Nouvelle partie / chargement ---------- */
    newGame(seed) {
      seed = seed || ((Math.random() * 1e9) | 0);
      this.s = {
        version: 2, seed, day: 1, hour: C.time.startHour,
        money: C.economy.startMoney, totalEarned: 0, rating: C.rating.start,
        buildings: {}, nextId: 1, dinos: [], nextDinoId: 1, nameIdx: Math.floor(Math.random() * 40),
        unlocked: {}, lastGrant: -99, history: [], today: null,
        lastSat: 55, weather: null, criticAt: null, escapeAt: null, event: null, totalVisitors: 0
      };
      this._genMap(seed);
      this.path = new Uint8Array(W * H);
      this.litter = new Uint8Array(W * H);
      this.occ = new Int32Array(W * H);
      this.visitors = [];
      // Entrée et chemins de départ
      const e = this._addBuilding('entree', ENT.x, ENT.y, 0);
      e.fixed = true;
      const top = ENT.tileY - 7;
      for (let y = ENT.tileY; y >= top; y--) this._setPath(ENT.tileX, y);
      for (let x = ENT.tileX - 7; x <= ENT.tileX + 7; x++) this._setPath(x, top);
      this._removeTreesIn(ENT.x - 1, ENT.y - 1, ENT.w + 2, ENT.h + 1);
      this._netChanged();
      this.checkUnlocks(true);
      this.startDay(true);
      this.emit('reset');
    }

    _genMap(seed) {
      const map = generateTerrain(seed);
      this.terrain = map.terr; this.elev = map.elev; this.biome = map.biome;
      const tr = generateTrees(seed, map);
      this.trees = tr.trees; this.treeAt = tr.at;
      this.cleared = new Uint8Array(W * H);
      this.treeVersion = (this.treeVersion || 0) + 1;
    }

    load(data) {
      if (!data || data.version !== 2) return false;
      try {
        this.s = data;
        this._genMap(data.seed);
        if (data.clearedStr) for (const k of data.clearedStr.split(',')) if (k) this.cleared[parseInt(k, 36)] = 1;
        delete data.clearedStr;
        this.path = new Uint8Array(W * H);
        this.litter = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
          this.path[i] = data.pathStr.charCodeAt(i) === 49 ? 1 : 0;
          this.litter[i] = Math.max(0, (data.litterStr.charCodeAt(i) || 48) - 48);
        }
        delete data.pathStr; delete data.litterStr;
        this.occ = new Int32Array(W * H);
        this._rebuildOcc();
        for (const d of this.s.dinos) this._initDinoTransient(d);
        this.visitors = [];
        this._netChanged();
        this.dailyTarget = this.computeDailyTarget();
        this.arrivalAcc = 0;
        this.emit('reset');
        return true;
      } catch (err) {
        console.warn('Sauvegarde illisible', err);
        return false;
      }
    }

    serialize() {
      const s = this.s;
      let pathStr = '', litterStr = '';
      for (let i = 0; i < W * H; i++) { pathStr += this.path[i] ? '1' : '0'; litterStr += String.fromCharCode(48 + Math.min(9, this.litter[i])); }
      const dinos = s.dinos.map((d) => ({
        id: d.id, sp: d.sp, enc: d.enc, name: d.name, x: d.x, y: d.y, face: d.face,
        upHab: d.upHab, upCare: d.upCare, sick: d.sick, sickDays: d.sickDays, happiness: d.happiness, born: d.born
      }));
      const buildings = {};
      for (const id in s.buildings) {
        const b = s.buildings[id];
        buildings[id] = { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, level: b.level, invested: b.invested, seed: b.seed, fixed: b.fixed, built: b.built, earned: Math.round(b.earned || 0) };
      }
      const cl = [];
      for (let i = 0; i < W * H; i++) if (this.cleared[i] && this.treeAt[i]) cl.push(i.toString(36));
      return Object.assign({}, s, { dinos, buildings, pathStr, litterStr, clearedStr: cl.join(','), weather: s.weather });
    }

    /* ---------- Accès à la carte ---------- */
    terrainAt(x, y) { return inMap(x, y) ? this.terrain[idx(x, y)] : -1; }
    isPath(x, y) { return inMap(x, y) && this.path[idx(x, y)] === 1; }
    buildingAt(x, y) { if (!inMap(x, y)) return null; const id = this.occ[idx(x, y)]; return id ? this.s.buildings[id] : null; }
    get buildings() { return this.s.buildings; }
    get dinos() { return this.s.dinos; }

    _rebuildOcc() {
      this.occ.fill(0);
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this.occ[idx(x, y)] = b.id;
      }
    }

    _removeTreesIn(x, y, w, h) {
      let changed = false;
      for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
        const k = idx(i, j);
        if (this.treeAt[k] && !this.cleared[k]) { this.cleared[k] = 1; changed = true; }
      }
      if (changed) this.treeVersion++;
      return changed;
    }
    /* Arbres naturels encore debout. */
    hasTree(t) { return !this.cleared[t.i]; }
    elevAt(x, y) { return inMap(x, y) ? this.elev[idx(x, y)] : 0; }

    _netChanged(region) {
      this.netVersion++;
      this.fields.clear();
      this._binCover = null;
      this._pleasant = null;
      this.emit('mapChanged', region || null);
    }

    /* ---------- Chemins ---------- */
    pathCost(x, y) { return this.terrainAt(x, y) === TER.WATER ? C.path.bridgeCost : C.path.cost; }

    canPath(x, y) {
      if (!inMap(x, y)) return { ok: false, reason: 'Hors de la carte' };
      if (this.path[idx(x, y)]) return { ok: false, reason: 'Déjà un chemin' };
      if (this.occ[idx(x, y)]) return { ok: false, reason: 'Emplacement occupé' };
      if (this.terrain[idx(x, y)] === TER.ROCK) return { ok: false, reason: 'Rocher infranchissable' };
      if (this.s.money < this.pathCost(x, y)) return { ok: false, reason: 'Fonds insuffisants' };
      return { ok: true };
    }

    _setPath(x, y) {
      this.path[idx(x, y)] = 1;
      this._removeTreesIn(x, y, 1, 1);
    }

    placePath(x, y) {
      const c = this.canPath(x, y);
      if (!c.ok) return c;
      const cost = this.pathCost(x, y);
      this._spend(cost, 'construction');
      this._setPath(x, y);
      this._netChanged({ x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 });
      this.emit('pathPlaced', { x, y, cost });
      return { ok: true, cost };
    }

    removePath(x, y) {
      if (!this.isPath(x, y)) return { ok: false };
      if (x === ENT.tileX && y === ENT.tileY) return { ok: false, reason: 'Le chemin d\'entrée est indispensable' };
      this.path[idx(x, y)] = 0;
      this.litter[idx(x, y)] = 0;
      const refund = Math.round(this.pathCost(x, y) * C.path.refund);
      this._earn(refund, null);
      this._netChanged({ x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 });
      this.emit('demolished', { x: x + 0.5, y: y + 0.5, refund });
      return { ok: true, refund };
    }

    /* ---------- Bâtiments ---------- */
    canPlace(type, x, y, ignoreId, free) {
      const def = C.buildings[type];
      if (!def || def.cat === 'fixed') return { ok: false, reason: 'Inconnu' };
      if (x < 0 || y < 0 || x + def.w > W || y + def.h > H) return { ok: false, reason: 'Hors de la carte' };
      for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) {
        const k = idx(i, j);
        const t = this.terrain[k];
        if (t === TER.WATER) return { ok: false, reason: 'Impossible de construire sur l\'eau' };
        if (t === TER.ROCK) return { ok: false, reason: 'Terrain rocheux' };
        if (this.occ[k] && this.occ[k] !== ignoreId) return { ok: false, reason: 'Emplacement occupé' };
        if (this.path[k]) return { ok: false, reason: 'Un chemin passe ici' };
      }
      if (!free && this.s.money < def.cost) return { ok: false, reason: 'Fonds insuffisants' };
      return { ok: true };
    }

    _addBuilding(type, x, y, cost) {
      const def = C.buildings[type];
      const b = { id: this.s.nextId++, type, x, y, w: def.w, h: def.h, level: 1, invested: cost, seed: (Math.random() * 1e6) | 0, built: this.s.day };
      this.s.buildings[b.id] = b;
      for (let j = y; j < y + def.h; j++) for (let i = x; i < x + def.w; i++) this.occ[idx(i, j)] = b.id;
      return b;
    }

    build(type, x, y) {
      const c = this.canPlace(type, x, y);
      if (!c.ok) return c;
      const def = C.buildings[type];
      this._spend(def.cost, 'construction');
      const b = this._addBuilding(type, x, y, def.cost);
      this._removeTreesIn(x, y, def.w, def.h);
      this._netChanged({ x0: x - 1, y0: y - 1, x1: x + def.w, y1: y + def.h });
      this.emit('built', b);
      return { ok: true, building: b };
    }

    isEnclosure(b) { return b && C.buildings[b.type].cat === 'enclos'; }
    def(b) { return C.buildings[b.type]; }

    upgradeCost(b) {
      const def = C.buildings[b.type];
      if (!def.upgrade || b.level >= C.maxLevel) return null;
      return def.upgrade[b.level - 1];
    }

    upgrade(id) {
      const b = this.s.buildings[id];
      if (!b) return { ok: false };
      const cost = this.upgradeCost(b);
      if (cost == null) return { ok: false, reason: 'Niveau maximal atteint' };
      if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
      this._spend(cost, 'construction');
      b.level++;
      b.invested += cost;
      this._updateHappiness();
      this.emit('upgraded', b);
      this.emit('mapChanged', { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h });
      return { ok: true };
    }

    demolish(id) {
      const b = this.s.buildings[id];
      if (!b || b.fixed) return { ok: false, reason: 'Ce bâtiment ne peut pas être démoli' };
      let refund = Math.round(b.invested * C.economy.refundRate);
      for (const d of this.s.dinos.filter((d) => d.enc === b.id)) refund += this._dinoValue(d) * C.economy.dinoSellRate;
      refund = Math.round(refund);
      this.s.dinos = this.s.dinos.filter((d) => d.enc !== b.id);
      delete this.s.buildings[id];
      this._rebuildOcc();
      this._earn(refund, null);
      for (const g of this.visitors) if (g.target && g.target.key === b.id) { g.hidden = false; g.state = 'idle'; }
      this._netChanged({ x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h });
      this._updateHappiness();
      this.emit('demolished', { x: b.x + b.w / 2, y: b.y + b.h / 2, refund, building: b });
      return { ok: true, refund };
    }

    moveBuilding(id, nx, ny) {
      const b = this.s.buildings[id];
      if (!b || b.fixed) return { ok: false, reason: 'Ce bâtiment ne peut pas être déplacé' };
      const c = this.canPlace(b.type, nx, ny, b.id, true);
      if (!c.ok) return c;
      const old = { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h };
      const dx = nx - b.x, dy = ny - b.y;
      b.x = nx; b.y = ny;
      for (const d of this.s.dinos) if (d.enc === b.id) { d.x += dx; d.y += dy; d.gx += dx; d.gy += dy; }
      this._removeTreesIn(nx, ny, b.w, b.h);
      this._rebuildOcc();
      for (const g of this.visitors) if (g.target && g.target.key === b.id) { g.hidden = false; g.state = 'idle'; }
      this._netChanged(old);
      this.emit('mapChanged', { x0: nx - 1, y0: ny - 1, x1: nx + b.w, y1: ny + b.h });
      this.emit('moved', b);
      return { ok: true };
    }

    /* ---------- Champs de déplacement (BFS sur les chemins) ---------- */
    accessTiles(b) {
      if (b._accV === this.netVersion) return b._acc;
      const out = [];
      const add = (x, y) => { if (this.isPath(x, y)) out.push(idx(x, y)); };
      for (let x = b.x; x < b.x + b.w; x++) { add(x, b.y - 1); add(x, b.y + b.h); }
      for (let y = b.y; y < b.y + b.h; y++) { add(b.x - 1, y); add(b.x + b.w, y); }
      b._acc = out; b._accV = this.netVersion;
      return out;
    }

    field(key) {
      let f = this.fields.get(key);
      if (f) return f;
      let seeds;
      if (key === 'exit') seeds = [idx(ENT.tileX, ENT.tileY)];
      else {
        const b = this.s.buildings[key];
        if (!b) return null;
        seeds = this.accessTiles(b);
      }
      f = new Int16Array(W * H).fill(-1);
      const q = new Int32Array(W * H);
      let qh = 0, qt = 0;
      for (const s of seeds) if (this.path[s] && f[s] < 0) { f[s] = 0; q[qt++] = s; }
      while (qh < qt) {
        const c = q[qh++];
        const cx = c % W, cy = (c / W) | 0;
        for (const d of DIRS) {
          const nx = cx + d[0], ny = cy + d[1];
          if (!inMap(nx, ny)) continue;
          const n = idx(nx, ny);
          if (this.path[n] && f[n] < 0) { f[n] = f[c] + 1; q[qt++] = n; }
        }
      }
      this.fields.set(key, f);
      return f;
    }

    isConnected(b) {
      if (b.type === 'entree') return true;
      if (b._conV === this.netVersion) return b._con;
      const f = this.field('exit');
      b._con = this.accessTiles(b).some((i) => f[i] >= 0);
      b._conV = this.netVersion;
      return b._con;
    }

    /* Zones couvertes par une poubelle et agrément des chemins */
    binCover() {
      if (this._binCover) return this._binCover;
      const m = new Uint8Array(W * H);
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        if (b.type !== 'poubelle') continue;
        const r = C.buildings.poubelle.radius;
        for (let y = b.y - r; y <= b.y + r; y++) for (let x = b.x - r; x <= b.x + r; x++) if (inMap(x, y)) m[idx(x, y)] = 1;
      }
      this._binCover = m;
      return m;
    }

    pleasant() {
      if (this._pleasant) return this._pleasant;
      const m = new Float32Array(W * H);
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        const def = C.buildings[b.type];
        if (!def.pleasant) continue;
        const r = b.type === 'banc' ? 1 : 2;
        for (let y = b.y - r; y < b.y + b.h + r; y++) for (let x = b.x - r; x < b.x + b.w + r; x++) if (inMap(x, y)) m[idx(x, y)] += def.pleasant;
      }
      for (const t of this.trees) {
        if (this.cleared[t.i]) continue;
        const tx = Math.floor(t.x), ty = Math.floor(t.y);
        for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (inMap(x, y)) m[idx(x, y)] += 0.3;
      }
      this._pleasant = m;
      return m;
    }

    /* ---------- Dinosaures ---------- */
    capacity(b) {
      const def = C.buildings[b.type];
      return def.space ? Math.floor(def.space * C.enclosureLevels.capacity[b.level - 1]) : 0;
    }
    usedSpace(b) {
      let s = 0;
      for (const d of this.s.dinos) if (d.enc === b.id) s += C.dinos[d.sp].space;
      return s;
    }
    dinosIn(b) { return this.s.dinos.filter((d) => d.enc === b.id); }

    habitatOk(spId, b) {
      const sp = DZ.SPECIES[spId], def = C.buildings[b.type];
      if (def.cat !== 'enclos') return false;
      if (sp.habitat === 'air') return def.kind === 'air';
      if (sp.habitat === 'water') return def.kind === 'water';
      return def.kind === 'land' && SIZE_RANK[sp.size] <= SIZE_RANK[def.size];
    }

    canAddDino(spId, b) {
      const sp = DZ.SPECIES[spId], bal = C.dinos[spId];
      if (!this.s.unlocked[spId]) return { ok: false, reason: 'Espèce verrouillée' };
      if (!b || !this.isEnclosure(b)) return { ok: false, reason: 'Choisissez un enclos' };
      if (!this.habitatOk(spId, b)) {
        const def = C.buildings[b.type];
        if (sp.habitat === 'air') return { ok: false, reason: 'Il faut une volière' };
        if (sp.habitat === 'water') return { ok: false, reason: 'Il faut un lagon marin' };
        if (def.kind !== 'land') return { ok: false, reason: 'Il faut un enclos terrestre' };
        return { ok: false, reason: 'Enclos trop petit (' + (sp.size === 'L' ? 'grand' : 'moyen') + ' enclos requis)' };
      }
      if (this.usedSpace(b) + bal.space > this.capacity(b)) return { ok: false, reason: 'Plus de place dans cet enclos' };
      if (this.s.money < bal.price) return { ok: false, reason: 'Fonds insuffisants' };
      return { ok: true, warning: this.wouldConflict(spId, b) };
    }

    wouldConflict(spId, b) {
      const species = new Set(this.dinosIn(b).map((d) => d.sp));
      species.add(spId);
      return this._conflictIn(species);
    }

    _conflictIn(species) {
      if (species.size < 2) return null;
      for (const s of species) if (DZ.SPECIES[s].predator) {
        for (const o of species) if (o !== s) return { predator: s, prey: o };
      }
      return null;
    }

    conflictOf(b) { return this._conflictIn(new Set(this.dinosIn(b).map((d) => d.sp))); }

    buyDino(spId, bid) {
      const b = this.s.buildings[bid];
      const c = this.canAddDino(spId, b);
      if (!c.ok) return c;
      const bal = C.dinos[spId];
      this._spend(bal.price, 'dinos');
      const p = this.randomPointIn(b, spId);
      const d = {
        id: this.s.nextDinoId++, sp: spId, enc: b.id,
        name: DZ.DINO_NAMES[this.s.nameIdx++ % DZ.DINO_NAMES.length],
        x: p.x, y: p.y, face: R() < 0.5 ? 1 : -1, upHab: 0, upCare: 0, sick: false, sickDays: 0, happiness: 70, born: this.s.day
      };
      this._initDinoTransient(d);
      this.s.dinos.push(d);
      this._updateHappiness();
      this.emit('dinoAdded', d);
      if (c.warning) this.notify('⚠️', `Attention : le ${DZ.SPECIES[c.warning.predator].name} risque d'attaquer le ${DZ.SPECIES[c.warning.prey].name} !`, 'bad');
      return { ok: true, dino: d };
    }

    _initDinoTransient(d) {
      d.state = 'idle'; d.timer = rr(0.5, 3); d.gx = d.x; d.gy = d.y; d.phase = R() * 6; d.moving = 0;
      d.anim = 0; d.headT = 0; d.alt = 20 + R() * 20; d.heading = R() * U.TAU; d.surf = 0; d.t = R() * 100;
    }

    _dinoValue(d) {
      const bal = C.dinos[d.sp], up = C.economy.dinoUpgrades;
      return bal.price * (1 + (d.upHab ? up.habitat.costRate : 0) + (d.upCare ? up.care.costRate : 0));
    }

    sellDino(id) {
      const d = this.s.dinos.find((x) => x.id === id);
      if (!d) return { ok: false };
      const refund = Math.round(this._dinoValue(d) * C.economy.dinoSellRate);
      this.s.dinos = this.s.dinos.filter((x) => x !== d);
      this._earn(refund, null);
      this._updateHappiness();
      this.emit('dinoRemoved', d);
      return { ok: true, refund };
    }

    dinoUpgradeCost(d, kind) {
      return Math.round(C.dinos[d.sp].price * C.economy.dinoUpgrades[kind].costRate);
    }

    upgradeDino(id, kind) {
      const d = this.s.dinos.find((x) => x.id === id);
      if (!d) return { ok: false };
      const field = kind === 'habitat' ? 'upHab' : 'upCare';
      if (d[field]) return { ok: false, reason: 'Déjà amélioré' };
      const cost = this.dinoUpgradeCost(d, kind);
      if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
      this._spend(cost, 'dinos');
      d[field] = 1;
      this._updateHappiness();
      this.emit('dinoUpgraded', d);
      return { ok: true };
    }

    treatCost(d) { return Math.max(C.economy.treatMin, Math.round(C.dinos[d.sp].price * C.economy.treatRate)); }

    treatDino(id) {
      const d = this.s.dinos.find((x) => x.id === id);
      if (!d || !d.sick) return { ok: false };
      const cost = this.treatCost(d);
      if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
      this._spend(cost, 'dinos');
      d.sick = false; d.sickDays = 0;
      this._updateHappiness();
      this.emit('dinoTreated', d);
      this.notify('💉', `${d.name} le ${DZ.SPECIES[d.sp].name} est guéri !`, 'good');
      return { ok: true };
    }

    _updateHappiness() {
      const lv = C.enclosureLevels, up = C.economy.dinoUpgrades;
      for (const d of this.s.dinos) {
        const b = this.s.buildings[d.enc];
        if (!b) continue;
        const sp = DZ.SPECIES[d.sp];
        let h = 62 + lv.happiness[b.level - 1];
        if (d.upHab) h += up.habitat.happiness;
        if (d.upCare) h += up.care.happiness;
        if (sp.social && !this.s.dinos.some((o) => o !== d && o.enc === d.enc && o.sp === d.sp)) h -= C.socialAlonePenalty;
        if (this.conflictOf(b)) h -= 20;
        if (d.sick) h -= 30;
        d.happiness = U.clamp(h, 0, 100);
      }
    }

    dinoAttraction(d) {
      const up = C.economy.dinoUpgrades;
      let a = C.dinos[d.sp].attraction;
      a *= 1 + (d.upHab ? up.habitat.attraction : 0) + (d.upCare ? up.care.attraction : 0);
      a *= 0.6 + d.happiness / 250;
      if (d.sick) a *= 0.3;
      return a;
    }

    enclosureAttraction(b) {
      let a = 0;
      for (const d of this.s.dinos) if (d.enc === b.id) a += this.dinoAttraction(d);
      return a * C.enclosureLevels.attraction[b.level - 1];
    }

    randomPointIn(b, spId) {
      const sp = DZ.SPECIES[spId];
      const m = this.interior(b, sp);
      return { x: rr(m.x0, m.x1), y: rr(m.y0, m.y1) };
    }

    interior(b, sp) {
      const def = C.buildings[b.type];
      if (def.kind === 'water') return { x0: b.x + 0.9, x1: b.x + b.w - 0.9, y0: b.y + 0.9, y1: b.y + b.h - 0.8 };
      if (def.kind === 'air') return { x0: b.x + 0.8, x1: b.x + b.w - 0.8, y0: b.y + 0.8, y1: b.y + b.h - 0.6 };
      const big = sp && sp.size === 'L' ? 0.4 : 0;
      return { x0: b.x + 0.6 + big, x1: b.x + b.w - 0.6 - big, y0: b.y + 1.0 + big * 0.5, y1: b.y + b.h - 0.4 };
    }

    updateDinos(dt) {
      for (const d of this.s.dinos) {
        const b = this.s.buildings[d.enc];
        if (!b) continue;
        const sp = DZ.SPECIES[d.sp];
        d.t += dt;
        if (sp.habitat === 'air') this._updateFlyer(d, b, sp, dt);
        else if (sp.habitat === 'water') this._updateSwimmer(d, b, sp, dt);
        else this._updateWalker(d, b, sp, dt);
      }
    }

    _updateWalker(d, b, sp, dt) {
      d.timer -= dt;
      d.anim += dt;
      const speed = sp.speed * (d.sick ? 0.5 : 1);
      if (d.state === 'walk') {
        const dx = d.gx - d.x, dy = d.gy - d.y, dist = Math.hypot(dx, dy);
        if (dist < 0.05 || d.timer < -12) { d.state = 'idle'; d.timer = rr(1, 4); d.moving = 0; if (R() < 0.3) d.face = -d.face; }
        else {
          const st = Math.min(dist, speed * dt);
          d.x += dx / dist * st; d.y += dy / dist * st;
          if (Math.abs(dx) > 0.02) d.face = dx > 0 ? 1 : -1;
          d.moving = speed;
          d.phase += st * 6.5 / Math.max(0.5, Math.sqrt(C.dinos[d.sp].space));
        }
        return;
      }
      d.moving = 0;
      if (d.timer > 0) return;
      // nouvelle activité
      const h = this.s.hour;
      const feeding = (h > 9 && h < 10) || (h > 16 && h < 17);
      const r = R();
      let roarP = sp.roar * (d.sick ? 0.2 : 1);
      if (r < roarP) { d.state = 'roar'; d.timer = 1.8; d.anim = 0; this.emit('roar', d); }
      else if (r < roarP + (feeding ? 0.45 : 0.18)) { d.state = 'eat'; d.timer = rr(3, 6); d.anim = 0; }
      else if (r < roarP + 0.28 + (d.sick ? 0.4 : 0)) { d.state = 'rest'; d.timer = rr(4, 8); d.anim = 0; }
      else {
        const p = this.randomPointIn(b, d.sp);
        d.gx = p.x; d.gy = p.y; d.state = 'walk'; d.timer = 0; d.anim = 0;
      }
    }

    _updateFlyer(d, b, sp, dt) {
      const m = this.interior(b, sp);
      d.anim += dt;
      if (d.gx === undefined || Math.hypot(d.gx - d.x, d.gy - d.y) < 0.4 || d.gx < m.x0 || d.gx > m.x1) {
        const p = this.randomPointIn(b, d.sp); d.gx = p.x; d.gy = p.y;
      }
      const target = Math.atan2(d.gy - d.y, d.gx - d.x);
      let diff = target - d.heading;
      while (diff > Math.PI) diff -= U.TAU;
      while (diff < -Math.PI) diff += U.TAU;
      d.heading += U.clamp(diff, -2.2 * dt, 2.2 * dt);
      const v = sp.speed * 0.8 * (d.sick ? 0.5 : 1);
      d.x += Math.cos(d.heading) * v * dt;
      d.y += Math.sin(d.heading) * v * dt;
      d.x = U.clamp(d.x, m.x0, m.x1); d.y = U.clamp(d.y, m.y0, m.y1);
      d.face = Math.cos(d.heading) >= 0 ? 1 : -1;
      d.alt = 28 + Math.sin(d.t * 0.5) * 10;
      d.phase += dt * (Math.sin(d.t * 0.3) > 0.2 ? 0 : 7); // planés et battements
      d.moving = v;
      if (R() < sp.roar * dt * 0.1) this.emit('roar', d);
    }

    _updateSwimmer(d, b, sp, dt) {
      const m = this.interior(b, sp);
      d.anim += dt;
      if (d.gx === undefined || Math.hypot(d.gx - d.x, d.gy - d.y) < 0.4) { const p = this.randomPointIn(b, d.sp); d.gx = p.x; d.gy = p.y; }
      const target = Math.atan2(d.gy - d.y, d.gx - d.x);
      let diff = target - d.heading;
      while (diff > Math.PI) diff -= U.TAU;
      while (diff < -Math.PI) diff += U.TAU;
      d.heading += U.clamp(diff, -1.4 * dt, 1.4 * dt);
      const v = sp.speed * 0.6;
      d.x = U.clamp(d.x + Math.cos(d.heading) * v * dt, m.x0, m.x1);
      d.y = U.clamp(d.y + Math.sin(d.heading) * v * dt, m.y0, m.y1);
      d.face = Math.cos(d.heading) >= 0 ? 1 : -1;
      d.phase += dt * 3;
      d.moving = v;
      // remontée à la surface de temps en temps
      d.surf = Math.max(0, Math.sin(d.t * 0.35 + d.id)) ** 6;
      if (d.surf > 0.97 && !d._splashed) { d._splashed = true; this.emit('splash', d); }
      if (d.surf < 0.5) d._splashed = false;
    }

    /* ---------- Attractivité ---------- */
    computeAttraction() {
      let dinos = 0, services = 0, decor = 0;
      const species = new Set(), families = new Set();
      const perSpecies = {};
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        const def = C.buildings[b.type];
        if (def.cat === 'enclos') {
          if (!this.isConnected(b)) continue;
          const mult = C.enclosureLevels.attraction[b.level - 1];
          for (const d of this.s.dinos) if (d.enc === b.id) {
            species.add(d.sp); families.add(DZ.SPECIES[d.sp].family);
            (perSpecies[d.sp] = perSpecies[d.sp] || []).push(this.dinoAttraction(d) * mult);
          }
        } else if (def.cat === 'service') {
          if (this.isConnected(b)) services += def.attraction[b.level - 1];
        } else if (def.cat === 'deco') {
          decor += def.attraction || 0;
        }
      }
      // chaque individu supplémentaire d'une même espèce attire un peu moins
      for (const sp in perSpecies) {
        const list = perSpecies[sp].sort((a, b) => b - a);
        let f = 1;
        for (const a of list) { dinos += a * f; f *= C.duplicateFactor; }
      }
      decor = Math.min(decor, C.decorAttractionCap);
      const diversity = species.size * C.diversityBonus + families.size * C.familyBonus;
      const clean = this.cleanliness();
      const total = (dinos + services + decor + diversity) * (0.8 + 0.2 * clean / 100);
      return { total, dinos, services, decor, diversity, species: species.size, families: families.size, clean };
    }

    ratingFactor() {
      const v = C.visitors;
      return v.ratingFactorMin + (v.ratingFactorMax - v.ratingFactorMin) * (this.s.rating / 5);
    }

    computeDailyTarget() {
      const v = C.visitors;
      const a = this.computeAttraction().total;
      let n = (v.base + v.k * Math.pow(Math.max(0, a), v.p)) * this.ratingFactor();
      const ev = this.s.event;
      if (ev === 'affluence') n *= C.events.affluenceMult;
      if (ev === 'storm') n *= C.events.stormMult;
      return Math.round(n);
    }

    ticketPrice() { return Math.round(C.economy.ticketBase + this.s.rating * C.economy.ticketPerStar); }

    cleanliness() {
      let sum = 0, n = 0;
      for (let i = 0; i < W * H; i++) if (this.path[i]) { sum += this.litter[i]; n++; }
      if (!n) return 100;
      return U.clamp(100 - (sum / n) * 45, 0, 100);
    }

    /* ---------- Argent ---------- */
    _earn(amount, cat) {
      this.s.money += amount;
      if (cat) {
        this.s.totalEarned += amount;
        if (this.s.today) this.s.today[cat] = (this.s.today[cat] || 0) + amount;
      }
      this.emit('money', amount);
    }
    _spend(amount, cat) {
      this.s.money -= amount;
      if (cat && this.s.today) this.s.today[cat] = (this.s.today[cat] || 0) + amount;
      this.emit('money', -amount);
    }

    /* ---------- Boucle principale ---------- */
    setSpeed(i) { this.speedIndex = i; this.emit('speed', i); }
    get speed() { return C.time.speeds[this.speedIndex]; }

    update(dtReal) {
      const sp = this.speed;
      if (!sp || !this.s) return;
      let simDt = Math.min(dtReal, 0.1) * sp;
      const n = Math.ceil(simDt / 0.05);
      const step = simDt / n;
      for (let i = 0; i < n; i++) this.step(step);
    }

    step(dt) {
      const s = this.s;
      const prevHour = s.hour;
      s.hour += dt / HOUR_LEN;
      const dh = dt / HOUR_LEN;
      // événements programmés
      if (s.criticAt && prevHour < s.criticAt && s.hour >= s.criticAt) {
        this.notify('📝', 'Un critique gastronomique et touristique visite le parc aujourd\'hui ! Soignez vos visiteurs.', 'info');
      }
      if (s.escapeAt && prevHour < s.escapeAt && s.hour >= s.escapeAt) this._triggerEscape();
      if (s.weather && prevHour < s.weather.from && s.hour >= s.weather.from) this.emit('stormStart');
      this._spawn(dh);
      this.updateVisitors(dt, dh);
      this.updateDinos(dt);
      if (Math.floor(prevHour) !== Math.floor(s.hour)) {
        // la fréquentation suit les nouveautés du parc pendant la journée
        if (s.hour < C.time.lastEntryHour) this.dailyTarget = this.computeDailyTarget();
        this.emit('hour', Math.floor(s.hour));
      }
      if (s.hour >= C.time.endHour) this.endDay();
    }

    isStorming() {
      const w = this.s.weather;
      return !!(w && this.s.hour >= w.from && this.s.hour < w.to);
    }
    stormIntensity() {
      const w = this.s.weather;
      if (!w) return 0;
      const h = this.s.hour;
      if (h < w.from - 0.6 || h > w.to + 0.6) return 0;
      return U.clamp(Math.min(h - (w.from - 0.6), (w.to + 0.6) - h) / 0.8, 0, 1);
    }

    /* ---------- Journées ---------- */
    startDay(first) {
      const s = this.s;
      s.hour = C.time.startHour;
      s.today = { day: s.day, visitors: 0, tickets: 0, shops: 0, food: 0, upkeepDinos: 0, upkeepBuildings: 0, construction: 0, dinos: 0, events: 0, satSum: 0, satN: 0 };
      s.event = null; s.weather = null; s.criticAt = null; s.escapeAt = null;
      if (!first && s.day >= C.events.firstDay && R() < C.events.chance) this._rollEvent();
      // évasion possible si un grand prédateur vit derrière une simple palissade
      for (const id in s.buildings) {
        const b = s.buildings[id];
        if (b.level !== 1 || !this.isEnclosure(b)) continue;
        if (this.dinosIn(b).some((d) => DZ.SPECIES[d.sp].predator && DZ.SPECIES[d.sp].size === 'L') && R() < C.events.escapeChance) {
          s.escapeAt = rr(10, 16); s.escapeEnc = b.id; break;
        }
      }
      this.dailyTarget = this.computeDailyTarget();
      this.arrivalAcc = 0;
      this.emit('dayStart', s.day);
    }

    _rollEvent() {
      const s = this.s;
      const w = C.events.weights;
      const entries = [['affluence', w.affluence], ['storm', w.storm], ['sponsor', w.sponsor]];
      if (s.dinos.length) entries.push(['sick', w.sick]);
      if (s.day >= 4) entries.push(['critic', w.critic]);
      const ev = U.weighted(R, entries);
      s.event = ev;
      if (ev === 'affluence') this.notify('🎉', 'Journée de forte affluence ! Les visiteurs se pressent aux portes du parc.', 'good');
      else if (ev === 'storm') {
        const from = rr(10, 13);
        s.weather = { from, to: from + rr(3.5, 5.5) };
        this.notify('⛈️', 'Un orage est annoncé cet après-midi : moins de visiteurs aujourd\'hui.', 'bad');
      } else if (ev === 'sponsor') {
        const amount = C.events.sponsorBase + C.events.sponsorPerDay * s.day;
        this._earn(amount, 'events');
        this.notify('🤝', `Un mécène passionné de paléontologie vous offre ${U.money(amount)} !`, 'good');
      } else if (ev === 'sick') {
        const healthy = s.dinos.filter((d) => !d.sick);
        if (healthy.length) this._makeSick(U.pick(R, healthy));
      } else if (ev === 'critic') {
        s.criticAt = rr(11, 15);
      }
    }

    _makeSick(d) {
      d.sick = true; d.sickDays = 0;
      this._updateHappiness();
      this.notify('🤒', `${d.name} le ${DZ.SPECIES[d.sp].name} est malade ! Soignez-le (${U.money(this.treatCost(d))}) avant ${C.events.sickDaysToDeath} jours.`, 'bad', { type: 'treat', dino: d.id });
    }

    _triggerEscape() {
      const s = this.s;
      const b = s.buildings[s.escapeEnc];
      s.escapeAt = null;
      if (!b || b.level !== 1) return;
      const d = this.dinosIn(b).find((x) => DZ.SPECIES[x.sp].predator && DZ.SPECIES[x.sp].size === 'L');
      if (!d) return;
      const cost = C.events.escapeRepair;
      this._spend(cost, 'eventsCost');
      s.rating = U.clamp(s.rating - C.events.escapeRatingPenalty, 0, 5);
      for (const g of this.visitors) { g.panic = true; g.sat -= 20; g.mood = 'peur'; g.bubbleT = 0; if (g.state !== 'exit') { g.hidden = false; this.goExit(g); } }
      this.emit('escape', { dino: d, building: b });
      this.notify('🚨', `Alerte ! ${d.name} le ${DZ.SPECIES[d.sp].name} a enfoncé la palissade ! Les visiteurs fuient. Réparation : ${U.money(cost)}. Améliorez la clôture !`, 'bad', { type: 'select', building: b.id });
    }

    endDay() {
      const s = this.s, t = s.today, E = C.events;
      // départ forcé des derniers visiteurs
      for (const g of this.visitors) this._recordExit(g);
      this.visitors = [];
      // entretien
      let dinoUp = 0, bUp = 0;
      for (const d of s.dinos) dinoUp += C.dinos[d.sp].upkeep;
      for (const id in s.buildings) {
        const b = s.buildings[id], def = C.buildings[b.type];
        if (def.upkeep) bUp += def.upkeep[b.level - 1];
      }
      s.money -= dinoUp + bUp;
      t.upkeepDinos = dinoUp; t.upkeepBuildings = bUp;
      this.emit('money', -(dinoUp + bUp));
      // santé des dinosaures
      const dead = [];
      for (const d of s.dinos) {
        if (d.sick) {
          d.sickDays++;
          if (d.sickDays > E.sickDaysToDeath) dead.push(d);
        } else if (s.day >= E.firstDay && R() < E.naturalSickness * (d.upCare ? C.economy.dinoUpgrades.care.sicknessFactor : 1)) {
          this._makeSick(d);
        }
      }
      for (const d of dead) {
        s.dinos = s.dinos.filter((x) => x !== d);
        s.rating = U.clamp(s.rating - E.deathRatingPenalty, 0, 5);
        this.notify('🕯️', `${d.name} le ${DZ.SPECIES[d.sp].name} n'a pas survécu à sa maladie.`, 'bad');
        this.emit('dinoRemoved', d);
      }
      // conflits entre prédateurs et proies
      for (const id in s.buildings) {
        const b = s.buildings[id];
        if (!this.isEnclosure(b)) continue;
        const c = this.conflictOf(b);
        if (c && R() < E.conflictChance) {
          const victim = this.dinosIn(b).find((d) => d.sp === c.prey);
          if (victim) {
            s.dinos = s.dinos.filter((x) => x !== victim);
            s.rating = U.clamp(s.rating - E.conflictRatingPenalty, 0, 5);
            this.notify('⚠️', `Drame dans l'enclos : le ${DZ.SPECIES[c.predator].name} a attaqué ${victim.name} le ${DZ.SPECIES[c.prey].name}. Séparez carnivores et herbivores !`, 'bad', { type: 'select', building: b.id });
            this.emit('dinoRemoved', victim);
          }
        }
      }
      this._updateHappiness();
      // note du parc
      const oldRating = s.rating;
      const score = this.dayScore();
      const sm = C.rating.smoothing;
      s.rating = U.clamp(s.rating * (1 - sm) + score.stars * sm, 0, 5);
      if (s.criticAt) {
        const delta = U.clamp((score.satisfaction - 62) / 60, -1, 1) * E.criticMax;
        s.rating = U.clamp(s.rating + delta, 0, 5);
        this.notify('📰', delta >= 0
          ? `Le critique est conquis ! Son article élogieux fait grimper la note (+${delta.toFixed(2)} ★).`
          : `Critique sévère dans la presse : la note baisse (${delta.toFixed(2)} ★).`, delta >= 0 ? 'good' : 'bad');
      }
      // nettoyage nocturne
      for (let i = 0; i < W * H; i++) if (this.litter[i]) this.litter[i] = Math.floor(this.litter[i] * 0.55);
      // aide anti-blocage
      if (s.money < C.economy.grant.threshold && s.day - s.lastGrant >= C.economy.grant.cooldownDays) {
        s.lastGrant = s.day;
        this._earn(C.economy.grant.amount, 'events');
        this.notify('🏛️', `La Fondation paléontologique vous accorde une subvention de ${U.money(C.economy.grant.amount)}.`, 'good');
      }
      const events = t.events - (t.eventsCost || 0);
      const income = t.tickets + t.shops + t.food;
      const summary = {
        day: s.day, visitors: Math.round(t.visitors), tickets: t.tickets, shops: t.shops, food: t.food,
        events, upkeepDinos: dinoUp, upkeepBuildings: bUp, construction: t.construction, dinos: t.dinos,
        income, net: income + events - dinoUp - bUp,
        satisfaction: score.satisfaction, rating: s.rating, ratingDelta: s.rating - oldRating, cleanliness: score.cleanliness
      };
      s.history.push(summary);
      if (s.history.length > 40) s.history.shift();
      s.lastSat = score.satisfaction;
      s.day++;
      this.checkUnlocks(false);
      this.emit('dayEnd', summary);
      this.startDay(false);
    }

    dayScore() {
      const s = this.s, t = s.today, wts = C.rating.weights;
      const satisfaction = t.satN > 0 ? t.satSum / t.satN : s.lastSat;
      const cleanliness = this.cleanliness();
      const att = this.computeAttraction();
      const diversity = Math.min(1, att.species / C.rating.diversityTarget) * 100;
      let lvSum = 0, lvN = 0;
      for (const id in s.buildings) {
        const b = s.buildings[id];
        if (this.isEnclosure(b) && this.dinosIn(b).length) { lvSum += (b.level - 1) / 2; lvN++; }
      }
      const quality = lvN ? lvSum / lvN * 100 : 0;
      const welfare = s.dinos.length ? s.dinos.reduce((a, d) => a + d.happiness, 0) / s.dinos.length : 50;
      const score = wts.satisfaction * satisfaction + wts.cleanliness * cleanliness + wts.diversity * diversity + wts.quality * quality + wts.welfare * welfare;
      return { satisfaction, cleanliness, diversity, quality, welfare, score, stars: score / 20 };
    }

    checkUnlocks(silent) {
      const s = this.s;
      for (const id of DZ.SPECIES_ORDER) {
        if (s.unlocked[id]) continue;
        const b = C.dinos[id];
        if (s.day >= b.unlockDay && s.rating >= b.unlockRating) {
          s.unlocked[id] = silent ? 1 : s.day; // jour du déblocage
          if (!silent) this.notify('🦖', `Nouvelle espèce disponible : ${DZ.SPECIES[id].name} !`, 'good', { type: 'catalog', species: id });
        }
      }
    }

    notify(icon, text, kind, action) { this.emit('notify', { icon, text, kind: kind || 'info', action }); }

    /* ------------------------------------------------------------------
       Visiteurs
       ------------------------------------------------------------------ */
    _arrivalNorm() {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += this._arrivalShape((i + 0.5) / 100);
      return sum / 100;
    }
    _arrivalShape(x) { return Math.pow(Math.sin(Math.PI * x), 1.3); }

    agentScale() {
      const groups = this.dailyTarget / 2.4;
      return Math.max(1, groups / this.maxGroups);
    }

    _spawn(dh) {
      const s = this.s, T = C.time;
      if (s.hour < T.openHour || s.hour > T.lastEntryHour) return;
      const x = (s.hour - T.openHour) / (T.lastEntryHour - T.openHour);
      const rate = this.dailyTarget * this._arrivalShape(x) / (this._norm * (T.lastEntryHour - T.openHour));
      this.arrivalAcc += rate * dh * (1 + (R() - 0.5) * 2 * C.visitors.randomness);
      const scale = this.agentScale();
      while (this.arrivalAcc >= 2.4 * scale) {
        const g = this._spawnGroup(scale);
        this.arrivalAcc -= g.members.length * scale;
      }
    }

    _spawnGroup(scale) {
      const V = C.visitors, s = this.s;
      const size = U.weighted(R, V.groupSizes);
      const members = [];
      for (let i = 0; i < size; i++) {
        const child = i > 0 && size >= 2 && R() < V.childChance && !(size === 2 && R() < 0.6);
        members.push({ child, v: (R() * 1000) | 0, ph: R() * 6 });
      }
      const g = {
        id: (this._gid = (this._gid || 0) + 1), members, scale,
        x: ENT.tileX + 0.5 + rr(-0.35, 0.35), y: H + 0.6, tx: ENT.tileX, ty: ENT.tileY, nx: null, ny: null,
        lane: rr(-0.26, 0.26), state: 'enter', target: null,
        sat: V.startSatisfaction + rr(-6, 6), hunger: rr(5, 35), bladder: rr(0, 30),
        hr: rr(0.8, 1.2), br: rr(0.8, 1.2),
        seen: [], shops: 0, stayUntil: s.hour + rr(V.stayHours[0], V.stayHours[1]),
        mood: 'content', bubbleT: 0, litter: 0, wd: 0, dirX: 0, dirY: -1, hidden: false, wander: 0
      };
      const ticket = this.ticketPrice() * size * scale;
      this._earn(ticket, 'tickets');
      s.today.visitors += size * scale;
      s.totalVisitors = (s.totalVisitors || 0) + size * scale;
      this.visitors.push(g);
      this.emit('ticket', { g, amount: ticket });
      return g;
    }

    visitorsInPark() {
      let n = 0;
      for (const g of this.visitors) n += g.members.length * g.scale;
      return Math.round(n);
    }

    updateVisitors(dt, dh) {
      const V = C.visitors, storm = this.isStorming();
      const dead = [];
      for (const g of this.visitors) {
        g.hunger += V.hungerRate * dh * g.hr;
        g.bladder += V.bladderRate * dh * g.br;
        g.sat -= V.boredom * dh;
        if (storm && !g.hidden) g.sat -= 4 * dh;
        if (g.hunger > 88) g.sat -= V.needPenalty * dh;
        if (g.bladder > 88) g.sat -= V.needPenalty * dh;
        g.sat = U.clamp(g.sat, 0, 100);
        g.bubbleT -= dt;
        this._updateMood(g);
        switch (g.state) {
          case 'enter': {
            const done = this._moveStraight(g, ENT.tileX + 0.5 + g.lane * 0.5, ENT.tileY + 0.5, dt);
            if (done) { g.tx = ENT.tileX; g.ty = ENT.tileY; g.nx = null; this.decide(g); }
            break;
          }
          case 'walk': this._moveAlong(g, dt); break;
          case 'wander': this._moveWander(g, dt); break;
          case 'act': {
            if (g.standX !== undefined && !g.hidden) this._moveStraight(g, g.standX, g.standY, dt * 0.5);
            g.actT -= dh;
            if (g.actT <= 0) this._finishActivity(g);
            break;
          }
          case 'exit': {
            const done = this._moveStraight(g, ENT.tileX + 0.5 + g.lane * 0.5, H + 0.8, dt * (g.panic ? 1.8 : 1));
            if (done) dead.push(g);
            break;
          }
          default: this.decide(g);
        }
      }
      if (dead.length) {
        for (const g of dead) this._recordExit(g);
        const set = new Set(dead);
        this.visitors = this.visitors.filter((g) => !set.has(g));
      }
    }

    _recordExit(g) {
      const t = this.s.today;
      const w = g.members.length * g.scale;
      t.satSum += g.sat * w; t.satN += w;
    }

    _updateMood(g) {
      let m = 'content';
      if (g.panic) m = 'peur';
      else if (g.bladder > 78) m = 'pressé';
      else if (g.hunger > 78) m = 'affamé';
      else if (g.sat > 80) m = 'ravi';
      else if (g.sat < 30) m = 'mécontent';
      if (m !== g.mood) { g.mood = m; g.bubbleT = m !== 'content' ? 2.5 : 0; }
      if (g.bubbleT < -14 && m !== 'content') g.bubbleT = 2.2;
    }

    _moveStraight(g, x, y, dt) {
      const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
      const st = C.visitors.speed * dt * (g.panic ? 1.8 : 1);
      if (d <= st) { g.x = x; g.y = y; return true; }
      g.x += dx / d * st; g.y += dy / d * st;
      g.dirX = dx / d; g.dirY = dy / d;
      g.wd += st;
      return false;
    }

    _moveAlong(g, dt) {
      let budget = C.visitors.speed * dt * (g.panic ? 1.8 : 1);
      let guard = 6;
      while (budget > 1e-4 && guard-- > 0) {
        if (g.nx === null) {
          if (!this.isPath(g.tx, g.ty)) { g.state = 'exit'; return; }
          const f = g.target ? this.field(g.target.key) : null;
          if (!f) { this.decide(g); return; }
          const here = f[idx(g.tx, g.ty)];
          if (here < 0) { this.decide(g, true); return; }
          if (here === 0) { this._arrive(g); return; }
          let opts = [];
          for (const d of DIRS) {
            const nx = g.tx + d[0], ny = g.ty + d[1];
            if (inMap(nx, ny) && f[idx(nx, ny)] === here - 1) opts.push([nx, ny]);
          }
          if (!opts.length) { this.decide(g, true); return; }
          const o = opts[(g.id + g.tx * 7 + g.ty * 13) % opts.length];
          g.nx = o[0]; g.ny = o[1];
        }
        const ddx = g.nx - g.tx, ddy = g.ny - g.ty;
        const gx = g.nx + 0.5 - ddy * g.lane, gy = g.ny + 0.5 + ddx * g.lane;
        const dx = gx - g.x, dy = gy - g.y, dist = Math.hypot(dx, dy);
        if (dist <= budget) {
          g.x = gx; g.y = gy; budget -= dist; g.wd += dist;
          g.tx = g.nx; g.ty = g.ny; g.nx = null;
          this._onTile(g);
        } else {
          g.x += dx / dist * budget; g.y += dy / dist * budget; g.wd += budget;
          g.dirX = dx / dist; g.dirY = dy / dist;
          budget = 0;
        }
      }
    }

    _moveWander(g, dt) {
      if (g.nx === null) {
        if (g.wanderSteps <= 0) { this.decide(g); return; }
        const opts = [];
        for (const d of DIRS) if (this.isPath(g.tx + d[0], g.ty + d[1])) opts.push(d);
        if (!opts.length) { this.goExit(g); return; }
        const d = U.pick(R, opts);
        g.nx = g.tx + d[0]; g.ny = g.ty + d[1];
        g.wanderSteps--;
      }
      const done = this._moveStraight(g, g.nx + 0.5, g.ny + 0.5, dt);
      if (done) { g.tx = g.nx; g.ty = g.ny; g.nx = null; this._onTile(g); }
    }

    _onTile(g) {
      const i = idx(g.tx, g.ty);
      if (g.litter > 0 && R() < 0.18) {
        g.litter--;
        if (!this.binCover()[i] && this.litter[i] < 9) { this.litter[i]++; this.emit('litter', { x: g.tx, y: g.ty }); }
      }
      if (this.litter[i] >= 2) g.sat -= Math.min(0.5, 0.12 * (this.litter[i] - 1));
      const p = this.pleasant()[i];
      if (p > 0) g.sat = Math.min(100, g.sat + Math.min(0.7, p * 0.07));
    }

    decide(g, unreachable) {
      const s = this.s, V = C.visitors;
      g.nx = null;
      if (s.hour >= C.time.closeHour || s.hour >= g.stayUntil || g.sat < V.leaveSatisfaction || g.panic) return this.goExit(g);
      if (!this.isPath(g.tx, g.ty)) { g.state = 'exit'; return; }
      const here = idx(g.tx, g.ty);
      const nearest = (type) => {
        let best = null, bd = 1e9;
        for (const id in s.buildings) {
          const b = s.buildings[id];
          if (b.type !== type) continue;
          const f = this.field(b.id);
          const d = f[here];
          if (d >= 0 && d < bd) { bd = d; best = b; }
        }
        return best;
      };
      let target = null, kind = null;
      if (g.bladder > V.bladderSeek) { target = nearest('toilettes'); kind = 'toilettes'; }
      if (!target && g.hunger > V.hungerSeek) { target = nearest('restaurant'); kind = 'restaurant'; }
      // envie de souvenirs après quelques enclos
      if (!target && g.shops === 0 && g.seen.length >= 2 && R() < 0.55) { target = nearest('boutique'); kind = 'boutique'; }
      if (!target && g.shops === 0 && g.seen.length >= 1 && g.hunger > 35 && R() < 0.3) { target = nearest('restaurant'); kind = 'restaurant'; }
      if (!target) {
        let bestScore = 0;
        for (const id in s.buildings) {
          const b = s.buildings[id];
          const def = C.buildings[b.type];
          let score = 0;
          if (def.cat === 'enclos') {
            if (g.seen.includes(b.id)) continue;
            const a = this.enclosureAttraction(b);
            if (a <= 0) continue;
            const d = this.field(b.id)[here];
            if (d < 0) continue;
            score = (8 + a) / (1 + d * 0.05) * rr(0.6, 1.4);
          } else continue;
          if (score > bestScore) { bestScore = score; target = b; kind = 'enclos'; }
        }
      }
      if (target) {
        g.target = { key: target.id, kind };
        g.state = 'walk';
        g.wander = 0;
        return;
      }
      g.wander++;
      if (g.wander > 2 || (g.seen.length > 0 && g.wander > 1)) return this.goExit(g);
      g.state = 'wander'; g.wanderSteps = 4 + ((R() * 5) | 0); g.target = null;
    }

    goExit(g) {
      g.nx = null;
      g.hidden = false;
      const f = this.field('exit');
      if (!this.isPath(g.tx, g.ty) || f[idx(g.tx, g.ty)] < 0) { g.state = 'exit'; return; }
      g.target = { key: 'exit', kind: 'exit' };
      g.state = 'walk';
    }

    _arrive(g) {
      const t = g.target;
      if (!t) return this.decide(g);
      if (t.kind === 'exit') { g.state = 'exit'; return; }
      const b = this.s.buildings[t.key];
      if (!b) return this.decide(g);
      g.state = 'act';
      g.actBuilding = b.id;
      // se tourner vers le bâtiment et se placer au bord du chemin
      const cx = U.clamp(g.tx + 0.5, b.x, b.x + b.w), cy = U.clamp(g.ty + 0.5, b.y, b.y + b.h);
      const dx = cx - (g.tx + 0.5), dy = cy - (g.ty + 0.5);
      const len = Math.hypot(dx, dy) || 1;
      g.dirX = dx / len; g.dirY = dy / len;
      if (t.kind === 'enclos') {
        g.actT = rr(0.45, 0.95);
        g.hidden = false;
        g.standX = g.tx + 0.5 + g.dirX * 0.28 + (-g.dirY) * rr(-0.32, 0.32);
        g.standY = g.ty + 0.5 + g.dirY * 0.28 + g.dirX * rr(-0.32, 0.32);
      } else {
        g.hidden = true;
        g.standX = undefined;
        g.actT = t.kind === 'restaurant' ? rr(0.5, 0.8) : t.kind === 'toilettes' ? rr(0.15, 0.3) : rr(0.25, 0.45);
      }
    }

    _finishActivity(g) {
      const t = g.target;
      const b = t && this.s.buildings[t.key];
      g.hidden = false;
      g.standX = undefined;
      const people = g.members.length * g.scale;
      if (b) {
        const def = C.buildings[b.type];
        const lv = b.level - 1;
        if (t.kind === 'enclos') {
          g.seen.push(b.id);
          const a = this.enclosureAttraction(b);
          const novelty = Math.max(0.4, 1 - g.seen.length * 0.08);
          const gain = Math.min(24, 4 + Math.sqrt(a) * 1.6) * novelty;
          g.sat = Math.min(100, g.sat + gain);
          if (gain > 15) { g.mood = 'ravi'; g.bubbleT = 2.5; }
          this.emit('watched', { g, b, gain });
        } else if (t.kind === 'boutique') {
          g.shops++;
          g.sat = Math.min(100, g.sat + 3 + lv * 2);
          if (R() < def.chance[lv]) {
            const amount = Math.round(def.spend[lv] * people * rr(0.8, 1.25));
            this._earn(amount, 'shops');
            this.emit('spend', { x: g.x, y: g.y, amount, b });
          }
        } else if (t.kind === 'restaurant') {
          const amount = Math.round(def.spend[lv] * people * rr(0.85, 1.2));
          this._earn(amount, 'food');
          this.emit('spend', { x: g.x, y: g.y, amount, b });
          g.hunger = rr(0, 10);
          g.sat = Math.min(100, g.sat + 5 + lv * 3);
          g.litter = R() < def.litter[lv] ? g.members.length : 0;
        } else if (t.kind === 'toilettes') {
          g.bladder = rr(0, 8);
          g.sat = Math.min(100, g.sat + def.satisfaction[lv]);
        }
      }
      g.target = null;
      this.decide(g);
    }

    /* ---------- Infos pour l'interface ---------- */
    stats() {
      const s = this.s;
      return {
        money: s.money, day: s.day, hour: s.hour, rating: s.rating,
        inPark: this.visitorsInPark(), today: Math.round(s.today.visitors),
        totalEarned: s.totalEarned, ticket: this.ticketPrice(), dailyTarget: this.dailyTarget
      };
    }
  }

  DZ.Game = Game;
  DZ.GameConst = { W, H, TER, idx, inMap, SIZE_RANK, HOUR_LEN };
})();
