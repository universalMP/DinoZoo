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
  /* Vitesse de fuite : une famille avec de jeunes enfants court moins vite. */
  const panicK = (g) => g.panic ? (g.kids ? 1.3 : 1.8) : 1;

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

  /* Disposition du domaine. Génération 2 : tirée au hasard à chaque
     nouvelle partie (côté de la mer, côte et baie, montagnes, massif
     isolé, lacs, rivière, étangs, côté de la jungle). Génération 1 :
     disposition d'origine, pour que les anciennes sauvegardes
     retrouvent exactement leur carte. */
  function mapLayout(seed, gen) {
    if (gen < 2) return { flip: false, coast: 0.8, coastWig: 0.14, bay: null, mount: 0.24, massif: null, wetDir: 1, hillCut: 0.6 };
    const r = U.rng((seed ^ 0x5bd1e995) >>> 0);
    return {
      flip: r() < 0.5,
      coast: 0.72 + r() * 0.13,
      coastWig: 0.08 + r() * 0.14,
      bay: r() < 0.55 ? { v: 0.18 + r() * 0.45, depth: 0.05 + r() * 0.08, w: 0.05 + r() * 0.07 } : null,
      mount: 0.15 + r() * 0.17,
      massif: r() < 0.6 ? { u: 0.08 + r() * 0.42, v: 0.32 + r() * 0.3, r: 9 + r() * 11 } : null,
      wetDir: r() < 0.5 ? 1 : -1,
      hillCut: 0.55 + r() * 0.1,
      lakes: r() < 0.4 ? 2 : 1,
      ponds: 2 + Math.floor(r() * 5),
      r
    };
  }

  /* Carte : relief (élévation), type de terrain et biome par case.
     Calculée dans un repère où la mer est à l'est, puis retournée si la
     disposition place la mer à l'ouest. */
  function generateTerrain(seed, gen) {
    const r = U.rng(seed);
    const L = mapLayout(seed, gen);
    const terr = new Uint8Array(W * H), elev = new Float32Array(W * H), biome = new Uint8Array(W * H), shore = new Float32Array(W * H);
    const big = U.makeFbm(seed + 7, 3, 4), detail = U.makeFbm(seed + 13, 8, 3), moist = U.makeFbm(seed + 21, 3, 3), ridgeN = U.makeFbm(seed + 33, 6, 3);
    const ex = ENT.tileX;
    const coastAt = (v) => W * (L.coast + (big(0.37, v * 0.8) - 0.5) * L.coastWig + Math.sin(v * 9 + seed) * 0.012 - (L.bay ? L.bay.depth * Math.exp(-Math.pow((v - L.bay.v) / L.bay.w, 2)) : 0));
    const mountainAt = (u) => H * (L.mount + (big(u * 0.9, 0.11) - 0.5) * 0.2);
    let lakes, riverIn, riverOut;
    const ponds = [];
    if (gen < 2) {
      // lac à l'ouest, rivière des montagnes au lac puis à la mer
      const lake = { x: W * (0.2 + r() * 0.05), y: H * (0.48 + r() * 0.06), rx: 11 + r() * 3, ry: 7 + r() * 2 };
      riverIn = [[W * 0.27 + r() * 6, H * 0.06], [W * 0.25 + r() * 6, H * 0.2], [W * 0.22 + r() * 4, H * 0.32], [lake.x + 2, lake.y - lake.ry + 1]];
      const cy = H * (0.57 + r() * 0.04);
      riverOut = [[lake.x + lake.rx - 1, lake.y + 1], [W * 0.36, cy + 4], [W * 0.46, cy - 2], [W * 0.56, cy + 3], [W * 0.66, cy - 3], [coastAt(cy / H) + 3, cy + 1]];
      for (let k = 0; k < 4; k++) ponds.push({ x: W * (0.38 + r() * 0.34), y: H * (0.68 + r() * 0.18), r: 1.6 + r() * 1.8 });
      lakes = [lake];
    } else {
      const q = L.r, landMax = L.coast - 0.2;
      const lake = { x: W * (0.1 + q() * (landMax - 0.1)), y: H * (Math.max(L.mount + 0.14, 0.36) + q() * 0.2), rx: 9 + q() * 6, ry: 6 + q() * 3 };
      lakes = [lake];
      if (L.lakes > 1) for (let k = 0; k < 20; k++) {
        const l2 = { x: W * (0.08 + q() * landMax), y: H * (0.3 + q() * 0.42), rx: 5 + q() * 5, ry: 4 + q() * 3 };
        if (Math.hypot(l2.x - lake.x, l2.y - lake.y) > 34 && !(Math.abs(l2.x - W * 0.5) < 24 && l2.y > H - 36)) { lakes.push(l2); break; }
      }
      // rivière : des montagnes au lac, puis en méandres jusqu'à la mer
      const sx = W * (0.08 + q() * (landMax - 0.08));
      riverIn = [[sx, H * 0.04]];
      for (let k = 1; k <= 3; k++) { const t = k / 4; riverIn.push([U.lerp(sx, lake.x, t) + (q() - 0.5) * 12, U.lerp(H * 0.04, lake.y - lake.ry, t)]); }
      riverIn.push([lake.x + (q() - 0.5) * 4, lake.y - lake.ry + 1]);
      const cy = U.clamp(lake.y + (q() - 0.3) * H * 0.25, H * 0.3, H * 0.72);
      const x0 = lake.x + lake.rx - 1, amp = 3 + q() * 5, ph = q() * 6, xe = coastAt(cy / H);
      riverOut = [[x0, lake.y + 1]];
      for (let k = 1; k < 6; k++) { const t = k / 6; riverOut.push([U.lerp(x0, xe - 2, t), U.lerp(lake.y + 1, cy, Math.min(1, t * 1.3)) + Math.sin(t * 7 + ph) * amp]); }
      riverOut.push([xe + 3, cy + 1]);
      for (let k = 0; k < L.ponds; k++) ponds.push({ x: W * (0.1 + q() * (L.coast - 0.2)), y: H * (0.5 + q() * 0.4), r: 1.6 + q() * 1.8 });
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(L.flip ? W - 1 - x : x, y), u = x / W, v = y / H, px = x + 0.5, py = y + 0.5;
      const coast = coastAt(v);
      const dCoast = px - coast;
      const mLine = mountainAt(u);
      let m = U.clamp((mLine - py) / 14, 0, 1) * (0.55 + big(u * 2.3, 0.7) * 0.7);
      if (L.massif) m = Math.max(m, U.clamp(1.15 - Math.hypot(px - L.massif.u * W, py - L.massif.v * H) / L.massif.r, 0, 1) * (0.55 + big(u * 2.3 + 0.5, v) * 0.7));
      const ridge = 1 - Math.abs(ridgeN(u, v) * 2 - 1);
      let e = 0.05 + big(u, v) * 0.32 + (detail(u, v) - 0.5) * 0.08;
      const hill = Math.max(0, big(u * 1.7 + 0.3, v * 1.7) - L.hillCut) * 3.2;
      e += hill;
      e += m * m * (0.4 + Math.pow(ridge, 2) * 9) + m * 0.5;
      // la côte descend vers la mer
      if (dCoast > -6) e *= U.clamp(-dCoast / 6, 0, 1);
      const dRiver = Math.min(polyDist(px, py, riverIn), polyDist(px, py, riverOut));
      let dLake = 9, dLakeS = 99;
      for (const lk of lakes) {
        const dl = Math.hypot((px - lk.x) / lk.rx, (py - lk.y) / lk.ry) - 1 + (detail(u * 2, v * 2) - 0.5) * 0.35;
        if (dl < dLake) dLake = dl;
        dLakeS = Math.min(dLakeS, dl * Math.min(lk.rx, lk.ry));
      }
      const zoneEntree = Math.abs((L.flip ? W - px : px) - (ex + 0.5)) < 16 && py > H - 24;
      if (zoneEntree) e = Math.min(e, 0.12 + (detail(u, v) - 0.5) * 0.05);
      let t = TER.GRASS, b = BIOME.PLAINS;
      let dPond = 9;
      for (const p of ponds) dPond = Math.min(dPond, Math.hypot(px - p.x, py - p.y) - p.r);
      // vallées : le relief s'abaisse en pente douce vers la rivière et le lac
      e = Math.min(e, 0.12 + Math.max(0, dRiver - 1.2) * 0.32, 0.1 + Math.max(0, dLake) * 4);
      const wet = moist(u * 1.3, v * 1.3) + (0.5 - u) * 0.22 * L.wetDir + Math.max(0, 1 - dRiver / 7) * 0.18 + Math.max(0, 0.5 - dLake) * 0.25;
      if (dCoast > 0) { t = TER.WATER; b = BIOME.SEA; e = -Math.min(1, dCoast / 8); }
      else if (dCoast > -3 - detail(u, v) * 2) { t = TER.SAND; b = BIOME.BEACH; e = Math.min(e, 0.06); }
      else if (!zoneEntree && (dLake < 0 || dRiver < 1.15 || dPond < 0)) { t = TER.WATER; b = BIOME.LAKE; e = 0; }
      else if (!zoneEntree && (dLake < 0.18 || dRiver < 1.9 || dPond < 0.8)) { t = TER.SAND; b = BIOME.BEACH; e = Math.min(e, 0.08); }
      else if (e > 2.2 && m > 0.12) { t = TER.ROCK; b = BIOME.MOUNTAIN; }
      else if (m > 0.12 || e > 0.9) { b = e > 0.7 ? BIOME.HILLS : BIOME.FOREST; if (e > 1.6) t = TER.ROCK; }
      else if (wet > 0.6 && (L.wetDir > 0 ? u < 0.6 : u > 0.3)) b = BIOME.JUNGLE;
      else if (wet > 0.53) b = BIOME.FOREST;
      else b = BIOME.PLAINS;
      if (zoneEntree && t !== TER.WATER) b = BIOME.PLAINS;
      if (t === TER.GRASS && b === BIOME.PLAINS && detail(u * 1.5, v * 1.5) > 0.66) t = TER.DIRT;
      terr[i] = t; elev[i] = e; biome[i] = b;
      // distance signée à l'eau (négative dans l'eau), plus fine que la grille : rivages arrondis
      const sdW = Math.min(-dCoast, dRiver - 1.15, dLakeS, dPond);
      shore[i] = zoneEntree ? Math.max(sdW, Math.min(3, -dCoast)) : sdW;
    }
    return { terr, elev, biome, shore, layout: { seaSide: L.flip ? 'W' : 'E' } };
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
     Forme organique des enclos : rectangle très arrondi et légèrement
     ondulé, inscrit dans l'emprise. Distance signée (négative dedans).
     ------------------------------------------------------------------ */
  function partShape(def, x, y, w, h, seed, ext) {
    let hw = w / 2 - 0.12, hh = h / 2 - 0.12;
    const r = def.kind === 'air' ? Math.min(hw, hh) : Math.min(hw, hh) * (def.kind === 'water' ? 0.75 : 0.55);
    if (ext) {
      // partie d'un enclos réuni : prolongée sous ses voisines (pas de clôture entre elles)
      x -= ext[0]; y -= ext[1]; w += ext[0] + ext[2]; h += ext[1] + ext[3];
      hw = w / 2 - 0.12; hh = h / 2 - 0.12;
    }
    return { cx: x + w / 2, cy: y + h / 2, hw, hh, r, s: (seed % 1000) / 159, amp: def.kind === 'air' ? 0.05 : Math.min(0.3, Math.min(hw, hh) * 0.07) };
  }
  /* Emprises d'un enclos : un rectangle, ou plusieurs pour un enclos agrandi. */
  DZ.encParts = (b) => b.parts || [[b.x, b.y, b.w, b.h]];
  DZ.encShape = function (b) {
    const def = C.buildings[b.type];
    if (!b.parts) return partShape(def, b.x, b.y, b.w, b.h, b.seed);
    // enclos réuni : union lissée des formes de chaque partie, bornée par leurs emprises
    const multi = b.parts.map((p, i) => {
      const ext = [0, 0, 0, 0];
      for (const q of b.parts) {
        if (q === p) continue;
        const oy = Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1]), ox = Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0]);
        if (oy > 0 && q[0] + q[2] === p[0]) ext[0] = Math.max(ext[0], q[2]);
        if (oy > 0 && p[0] + p[2] === q[0]) ext[2] = Math.max(ext[2], q[2]);
        if (ox > 0 && q[1] + q[3] === p[1]) ext[1] = Math.max(ext[1], q[3]);
        if (ox > 0 && p[1] + p[3] === q[1]) ext[3] = Math.max(ext[3], q[3]);
      }
      return partShape(def, p[0], p[1], p[2], p[3], b.seed + i * 337, ext);
    });
    let main = multi[0];
    for (const m of multi) if (m.hw * m.hh > main.hw * main.hh) main = m;
    return { multi, rects: b.parts, main, cx: main.cx, cy: main.cy, hw: b.w / 2 - 0.12, hh: b.h / 2 - 0.12, r: main.r };
  };
  const smin = (a, b, k) => { const h = U.clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  DZ.encSDF = function (b, x, y, sh) {
    sh = sh || DZ.encShape(b);
    if (sh.multi) {
      let d = rrSDF(sh.multi[0], x, y), box = 1e9;
      for (let i = 1; i < sh.multi.length; i++) d = smin(d, rrSDF(sh.multi[i], x, y), 0.8);
      // le lissage ne déborde jamais des emprises (coins rentrants)
      for (const r of sh.rects) {
        const qx = Math.abs(x - (r[0] + r[2] / 2)) - r[2] / 2, qy = Math.abs(y - (r[1] + r[3] / 2)) - r[3] / 2;
        box = Math.min(box, Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
      }
      return box > 0 ? Math.max(d, box) : d;
    }
    return rrSDF(sh, x, y);
  };
  /* Nom affiché d'un bâtiment (un enclos réuni devient « Enclos agrandi »). */
  DZ.bName = (b) => b.parts ? 'Enclos agrandi' : C.buildings[b.type].name;
  /* « le T-Rex », « l'Allosaurus » : article défini devant un nom d'espèce. */
  DZ.leSp = (id) => { const n = DZ.SPECIES[id].name; return /^[AEIOUYÉÈH]/i.test(n) ? 'l\'' + n : 'le ' + n; };
  function rrSDF(sh, x, y) {
    const px = x - sh.cx, py = y - sh.cy;
    const qx = Math.abs(px) - (sh.hw - sh.r), qy = Math.abs(py) - (sh.hh - sh.r);
    let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - sh.r;
    const a = Math.atan2(py / sh.hh, px / sh.hw);
    d += sh.amp * (Math.sin(a * 3 + sh.s) * 0.6 + Math.sin(a * 5 + sh.s * 2.3) * 0.4);
    return d;
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
    newGame(seed, player) {
      seed = seed || ((Math.random() * 1e9) | 0);
      this.s = {
        version: 2, seed, mapGen: 2, day: 1, hour: C.time.startHour,
        player: Object.assign({ name: 'Directeur', gender: 'h', avatar: 0, set: false }, player || {}),
        deliveries: [], nextDel: 1, births: [], links: {}, nextLink: 1,
        money: C.economy.startMoney, totalEarned: 0, rating: C.rating.start,
        buildings: {}, nextId: 1, dinos: [], nextDinoId: 1, nameIdx: Math.floor(Math.random() * 40),
        unlocked: {}, lastGrant: -99, history: [], today: null,
        lastSat: 55, weather: null, criticAt: null, escapeAt: null, event: null, totalVisitors: 0
      };
      this._genMap(seed, 2);
      this.path = new Uint8Array(W * H);
      this.litter = new Uint8Array(W * H);
      this.occ = new Int32Array(W * H);
      this.linkAt = new Int32Array(W * H);
      this.sky = new Uint8Array(W * H);
      this.fights = [];
      this.hunts = [];
      this.transfers = [];
      this.visitors = [];
      // Entrée et chemins de départ
      const e = this._addBuilding('entree', ENT.x, ENT.y, 0);
      e.fixed = true;
      const top = ENT.tileY - 7;
      for (let y = ENT.tileY; y >= top; y--) this._setPath(ENT.tileX, y);
      for (let x = ENT.tileX - 7; x <= ENT.tileX + 7; x++) this._setPath(x, top);
      this._removeTreesIn(ENT.x - 1, ENT.y - 1, ENT.w + 2, ENT.h + 1);
      this._netChanged();
      this._initPlayer();
      this.checkUnlocks(true);
      this.startDay(true);
      this.emit('reset');
    }

    /* Profil du joueur (nom, genre, avatar) choisi au début d'une partie. */
    setPlayer(p) {
      Object.assign(this.s.player, p, { set: true });
      this.emit('player', this.s.player);
    }

    _genMap(seed, gen) {
      const map = generateTerrain(seed, gen || 1);
      this.terrain = map.terr; this.elev = map.elev; this.biome = map.biome; this.shore = map.shore;
      this.layout = map.layout;
      const tr = generateTrees(seed, map);
      this.trees = tr.trees; this.treeAt = tr.at;
      this.cleared = new Uint8Array(W * H);
      this.treeVersion = (this.treeVersion || 0) + 1;
    }

    load(data) {
      if (!data || data.version !== 2) return false;
      try {
        this.s = data;
        this._genMap(data.seed, data.mapGen || 1);
        if (data.clearedStr) for (const k of data.clearedStr.split(',')) if (k) this.cleared[parseInt(k, 36)] = 1;
        delete data.clearedStr;
        this.path = new Uint8Array(W * H);
        this.sky = new Uint8Array(W * H);
        this.litter = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
          // 0 : rien, 1 : chemin, 2 / 3 : passerelle d'observation (est-ouest / nord-sud)
          const c = data.pathStr.charCodeAt(i) - 48;
          this.path[i] = c >= 1 && c <= 3 ? 1 : 0;
          if (c === 2 || c === 3) this.sky[i] = c - 1;
          this.litter[i] = Math.max(0, (data.litterStr.charCodeAt(i) || 48) - 48);
        }
        delete data.pathStr; delete data.litterStr;
        this.occ = new Int32Array(W * H);
        this._rebuildOcc();
        if (!data.links) data.links = {};
        if (!data.nextLink) data.nextLink = 1;
        this.linkAt = new Int32Array(W * H);
        this._rebuildLinks();
        this.fights = [];
        this.hunts = [];
        this.transfers = [];
        // champs ajoutés au fil des versions
        if (!data.player) data.player = { name: 'Directeur', gender: 'h', avatar: 0, set: false };
        if (!data.deliveries) data.deliveries = [];
        if (!data.nextDel) data.nextDel = 1;
        if (!data.births) data.births = [];
        // transferts en cours au moment de la sauvegarde : l'animal est arrivé
        for (const x of data.xfers || []) {
          const d = this.s.dinos.find((o) => o.id === x.d), b = this.s.buildings[x.to];
          if (d && b) { d.enc = b.id; const p = this.randomPointIn(b, d.sp); d.x = p.x; d.y = p.y; }
        }
        delete data.xfers;
        for (const d of this.s.dinos) {
          if (!d.sex) d.sex = d.id % 2 ? 'M' : 'F';
          this._initDinoTransient(d);
          d.loose = d.loose ? { phase: 'roam', t: 0 } : null; // toujours en liberté
          const b = this.s.buildings[d.enc];
          if (b && !d.loose) this.keepInside(d, b, DZ.SPECIES[d.sp]);
        }
        this._initPlayer();
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
      for (let i = 0; i < W * H; i++) { pathStr += this.sky[i] ? String(this.sky[i] + 1) : this.path[i] ? '1' : '0'; litterStr += String.fromCharCode(48 + Math.min(9, this.litter[i])); }
      const dinos = s.dinos.map((d) => ({
        id: d.id, sp: d.sp, enc: d.enc, name: d.name, x: d.x, y: d.y, face: d.face,
        upHab: d.upHab, upCare: d.upCare, sick: d.sick, sickDays: d.sickDays, happiness: d.happiness, born: d.born,
        sex: d.sex, young: d.young ? 1 : 0, injured: d.injured ? 1 : 0, bruise: d.bruise, loose: d.loose ? 1 : 0
      }));
      if (this.pl) { s.player.x = Math.round(this.pl.x * 100) / 100; s.player.y = Math.round(this.pl.y * 100) / 100; }
      const buildings = {};
      for (const id in s.buildings) {
        const b = s.buildings[id];
        buildings[id] = { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, level: b.level, invested: b.invested, seed: b.seed, fixed: b.fixed, built: b.built, earned: Math.round(b.earned || 0), cons: b.cons, upg: b.upg, breed: b.breed, parts: b.parts, space: b.space, size: b.size, calm: b.calm };
      }
      const cl = [];
      for (let i = 0; i < W * H; i++) if (this.cleared[i] && this.treeAt[i]) cl.push(i.toString(36));
      const links = {};
      for (const id in s.links) { const l = s.links[id]; links[id] = { id: l.id, a: l.a, b: l.b, x: l.x, y: l.y, w: l.w, h: l.h, dir: l.dir, len: l.len, invested: l.invested, cons: l.cons }; }
      const xfers = (this.transfers || []).filter((tr) => !tr.landed).map((tr) => ({ d: tr.d.id, to: tr.to }));
      return Object.assign({}, s, { dinos, buildings, links, xfers, pathStr, litterStr, clearedStr: cl.join(','), weather: s.weather });
    }

    /* ---------- Accès à la carte ---------- */
    terrainAt(x, y) { return inMap(x, y) ? this.terrain[idx(x, y)] : -1; }
    isPath(x, y) { return inMap(x, y) && this.path[idx(x, y)] === 1; }
    /* Passer d'une case de chemin à sa voisine (dx, dy) : une passerelle
       d'observation ne se prend que par ses escaliers, dans son axe. */
    canStep(c, n, dx) {
      const a = this.sky[c], b = this.sky[n];
      if (!a && !b) return true;
      const v = dx ? 1 : 2;
      return (!a || a === v) && (!b || b === v);
    }
    /* Hauteur d'un point sur une passerelle d'observation : 0 au sol, 1 sur
       le tablier. L'escalier part du milieu de la case de chemin et finit
       dans la première case au-dessus de l'enclos. */
    skyLift(x, y) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!inMap(tx, ty)) return 0;
      const i = idx(tx, ty), sv = this.sky[i];
      const fx = x - tx, fy = y - ty;
      const prof = (s) => s < 0 ? U.clamp((s + 0.5) / 0.5, 0, 1) * 0.45 : Math.min(1, 0.45 + 0.55 * s / 0.6);
      if (sv) {
        const ax = sv === 1 ? 1 : 0, ay = 1 - ax, f = sv === 1 ? fx : fy;
        const same = (k) => inMap(tx + ax * k, ty + ay * k) && this.sky[idx(tx + ax * k, ty + ay * k)] === sv;
        const prev = same(-1), next = same(1);
        if (!prev && next) return prof(f);
        if (prev && !next) return prof(1 - f);
        return 1;
      }
      if (!this.path[i]) return 0;
      let best = 0;
      for (const [dx, dy, f] of [[1, 0, fx], [-1, 0, 1 - fx], [0, 1, fy], [0, -1, 1 - fy]]) {
        const nx = tx + dx, ny = ty + dy;
        if (inMap(nx, ny) && this.sky[idx(nx, ny)] === (dx ? 1 : 2)) best = Math.max(best, prof(f - 1));
      }
      return best;
    }
    buildingAt(x, y) { if (!inMap(x, y)) return null; const id = this.occ[idx(x, y)]; return id ? this.s.buildings[id] : null; }
    get buildings() { return this.s.buildings; }
    get dinos() { return this.s.dinos; }

    _rebuildOcc() {
      this.occ.fill(0);
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        for (const [px, py, pw, ph] of DZ.encParts(b)) for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) this.occ[idx(x, y)] = b.id;
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
      if (this.sky[idx(x, y)] || this.skyFoot(x, y)) return { ok: false, reason: 'Démolissez d\'abord la passerelle d\'observation' };
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
        if (this.linkAt[k]) return { ok: false, reason: 'Une passerelle passe ici' };
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
      b.cons = { t: 0, dur: this.worksHours(def.cost) };
      this._removeTreesIn(x, y, def.w, def.h);
      this._netChanged({ x0: x - 1, y0: y - 1, x1: x + def.w, y1: y + def.h });
      this.emit('built', b);
      this.playerTask(x + def.w / 2, y + def.h / 2, 'build', b.id);
      return { ok: true, building: b };
    }

    /* ---------- Chantiers : construction et amélioration prennent du temps ---------- */
    worksHours(cost, upgrade) {
      const K = C.construction;
      return Math.min(K.maxHours, K.baseHours + cost / 1000 * K.hoursPer1000) * (upgrade ? K.upgradeFactor : 1);
    }
    busy(b) { return !!(b && (b.cons || b.upg)); }
    worksProgress(b) { const w = b && (b.cons || b.upg); return w ? U.clamp(w.t / w.dur, 0, 1) : 1; }
    worksLeft(b) { const w = b && (b.cons || b.upg); return w ? Math.max(0, w.dur - w.t) : 0; }

    _updateWorks(dh) {
      for (const id in this.s.buildings) {
        const b = this.s.buildings[id];
        const w = b.cons || b.upg;
        if (!w) continue;
        w.t += dh;
        if (w.t < w.dur) continue;
        const def = C.buildings[b.type];
        const region = { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h };
        if (b.cons) {
          delete b.cons;
          b._conV = -1;
          if (def.cat !== 'deco') this.notify('✅', `Construction terminée : ${DZ.bName(b)}.`, 'good', { type: 'select', building: b.id });
          this.emit('constructed', b);
          this.emit('mapChanged', region);
        } else if (b.upg.merge) {
          delete b.upg;
          this._updateHappiness();
          this.notify('🔗', `Travaux terminés : les enclos sont réunis. Place disponible : ${this.capacity(b)}.`, 'good', { type: 'select', building: b.id });
          this.emit('upgraded', b);
          this.emit('mapChanged', region);
        } else {
          delete b.upg;
          b.level++;
          this._updateHappiness();
          this.notify('✨', `Travaux terminés : ${DZ.bName(b)} au niveau ${b.level} !`, 'good', { type: 'select', building: b.id });
          this.emit('upgraded', b);
          this.emit('mapChanged', region);
        }
      }
    }

    isEnclosure(b) { return b && C.buildings[b.type].cat === 'enclos'; }
    /* Un enclos réuni coûte (entretien, travaux) au prorata de sa taille. */
    sizeFactor(b) { const def = C.buildings[b.type]; return b.space && def.space ? b.space / def.space : 1; }
    upkeepOf(b) { const def = C.buildings[b.type]; return def.upkeep ? Math.round(def.upkeep[b.level - 1] * this.sizeFactor(b)) : 0; }
    def(b) { return C.buildings[b.type]; }

    upgradeCost(b) {
      const def = C.buildings[b.type];
      if (!def.upgrade || b.level >= C.maxLevel) return null;
      return Math.round(def.upgrade[b.level - 1] * this.sizeFactor(b));
    }

    upgrade(id) {
      const b = this.s.buildings[id];
      if (!b) return { ok: false };
      if (this.busy(b)) return { ok: false, reason: 'Des travaux sont déjà en cours' };
      const cost = this.upgradeCost(b);
      if (cost == null) return { ok: false, reason: 'Niveau maximal atteint' };
      if (this.s.money < cost) return { ok: false, reason: 'Fonds insuffisants' };
      this._spend(cost, 'construction');
      b.invested += cost;
      b.upg = { t: 0, dur: this.worksHours(cost, true), to: b.level + 1 };
      this.emit('upgradeStarted', b);
      this.playerTask(b.x + b.w / 2, b.y + b.h / 2, 'build', b.id);
      return { ok: true, hours: b.upg.dur };
    }

    demolish(id) {
      const b = this.s.buildings[id];
      if (!b || b.fixed) return { ok: false, reason: 'Ce bâtiment ne peut pas être démoli' };
      if (this.transferBusy(b)) return { ok: false, reason: 'Un dinosaure est en cours de transfert' };
      if (this.s.dinos.some((d) => d.enc === b.id && d.loose)) return { ok: false, reason: 'Un de ses dinosaures est en liberté : capturez-le d\'abord' };
      let refund = Math.round(b.invested * C.economy.refundRate);
      for (const d of this.s.dinos.filter((d) => d.enc === b.id)) refund += this._dinoValue(d) * C.economy.dinoSellRate;
      for (const dl of this.s.deliveries) if (dl.enc === b.id && !dl.dropped && !dl.cancelled) { refund += C.dinos[dl.sp].price; dl.cancelled = true; }
      this.s.deliveries = this.s.deliveries.filter((dl) => !(dl.cancelled && this.deliveryPhase(dl).phase === 'prep'));
      refund = Math.round(refund);
      this.s.dinos = this.s.dinos.filter((d) => d.enc !== b.id);
      for (const l of this.linksOf(b)) refund += this._removeLink(l, true);
      for (const r of this.skyRunsOver(b)) refund += this._removeSky(r);
      refund = Math.round(refund);
      this.fights = this.fights.filter((f) => f.enc !== b.id);
      this.hunts = this.hunts.filter((h) => h.enc !== b.id);
      this.playerTask(b.x + b.w / 2, b.y + b.h / 2, 'demolish', null);
      delete this.s.buildings[id];
      this._rebuildOcc();
      this._earn(refund, null);
      for (const g of this.visitors) if (g.target && (g.target.bid || g.target.key) === b.id) { g.hidden = false; g.state = 'idle'; }
      this._netChanged({ x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h });
      this._updateHappiness();
      this.emit('demolished', { x: b.x + b.w / 2, y: b.y + b.h / 2, refund, building: b });
      return { ok: true, refund };
    }

    moveBuilding(id, nx, ny) {
      const b = this.s.buildings[id];
      if (!b || b.fixed) return { ok: false, reason: 'Ce bâtiment ne peut pas être déplacé' };
      if (this.busy(b)) return { ok: false, reason: 'Impossible de déplacer un chantier en cours' };
      if (b.parts) return { ok: false, reason: 'Un enclos agrandi ne peut pas être déplacé' };
      if (this.linksOf(b).length) return { ok: false, reason: 'Démolissez d\'abord ses passerelles' };
      if (this.skyRunsOver(b).length) return { ok: false, reason: 'Démolissez d\'abord la passerelle d\'observation' };
      if (this.transferBusy(b)) return { ok: false, reason: 'Un dinosaure est en cours de transfert' };
      if (this.s.dinos.some((d) => d.enc === b.id && d.loose)) return { ok: false, reason: 'Un de ses dinosaures est en liberté : capturez-le d\'abord' };
      const c = this.canPlace(b.type, nx, ny, b.id, true);
      if (!c.ok) return c;
      const old = { x0: b.x - 1, y0: b.y - 1, x1: b.x + b.w, y1: b.y + b.h };
      const dx = nx - b.x, dy = ny - b.y;
      b.x = nx; b.y = ny;
      for (const d of this.s.dinos) if (d.enc === b.id) { d.x += dx; d.y += dy; d.gx += dx; d.gy += dy; }
      this._removeTreesIn(nx, ny, b.w, b.h);
      this._rebuildOcc();
      for (const g of this.visitors) if (g.target && (g.target.bid || g.target.key) === b.id) { g.hidden = false; g.state = 'idle'; }
      this._netChanged(old);
      this.emit('mapChanged', { x0: nx - 1, y0: ny - 1, x1: nx + b.w, y1: ny + b.h });
      this.emit('moved', b);
      this.playerTask(nx + b.w / 2, ny + b.h / 2, 'build', b.id);
      return { ok: true };
    }

    /* ---------- Champs de déplacement (BFS sur les chemins) ---------- */
    accessTiles(b) {
      if (b._accV === this.netVersion) return b._acc;
      const out = [];
      const add = (x, y) => { if (this.isPath(x, y) && !out.includes(idx(x, y))) out.push(idx(x, y)); };
      for (const [px, py, pw, ph] of DZ.encParts(b)) {
        for (let x = px; x < px + pw; x++) { add(x, py - 1); add(x, py + ph); }
        for (let y = py; y < py + ph; y++) { add(px - 1, y); add(px + pw, y); }
        // passerelle d'observation : on regarde aussi d'en haut
        for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) if (this.sky[idx(x, y)]) add(x, y);
      }
      b._acc = out; b._accV = this.netVersion;
      return out;
    }

    field(key) {
      let f = this.fields.get(key);
      if (f) return f;
      let seeds;
      if (key === 'exit') seeds = [idx(ENT.tileX, ENT.tileY)];
      else if (typeof key === 'string' && key.startsWith('sky:')) {
        // vers le tablier d'une passerelle d'observation au-dessus de l'enclos
        const b = this.s.buildings[+key.slice(4)];
        if (!b) return null;
        seeds = this.accessTiles(b).filter((i) => this.sky[i]);
      } else {
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
          if (this.path[n] && f[n] < 0 && this.canStep(c, n, d[0])) { f[n] = f[c] + 1; q[qt++] = n; }
        }
      }
      this.fields.set(key, f);
      return f;
    }

    /* Centres lissés des cases de chemin : les escaliers deviennent des
       diagonales et les virages s'arrondissent (lissage laplacien des cases
       à deux voisins ; carrefours, extrémités et ponts restent fixes). */
    pathCenters() {
      if (this._pcV === this.netVersion) return this._pc;
      const pc = new Float32Array(W * H * 2);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); pc[i * 2] = x + 0.5; pc[i * 2 + 1] = y + 0.5; }
      const nodes = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (!this.path[i] || this.terrain[i] === TER.WATER || this.sky[i]) continue;
        if (x === ENT.tileX && y === ENT.tileY) continue;
        if (DIRS.some((d) => inMap(x + d[0], y + d[1]) && this.sky[idx(x + d[0], y + d[1])])) continue; // pied d'escalier
        const nb = [];
        for (const d of DIRS) { const nx = x + d[0], ny = y + d[1]; if (inMap(nx, ny) && this.path[idx(nx, ny)]) nb.push(idx(nx, ny)); }
        if (nb.length === 2) nodes.push([i, nb[0], nb[1]]);
      }
      const tmp = new Float32Array(nodes.length * 2);
      for (let it = 0; it < 4; it++) {
        nodes.forEach(([i, a, b2], k) => {
          tmp[k * 2] = pc[i * 2] * 0.5 + (pc[a * 2] + pc[b2 * 2]) * 0.25;
          tmp[k * 2 + 1] = pc[i * 2 + 1] * 0.5 + (pc[a * 2 + 1] + pc[b2 * 2 + 1]) * 0.25;
        });
        nodes.forEach(([i], k) => { pc[i * 2] = tmp[k * 2]; pc[i * 2 + 1] = tmp[k * 2 + 1]; });
      }
      this._pc = pc; this._pcV = this.netVersion;
      return pc;
    }

    isConnected(b) {
      if (b.type === 'entree') return true;
      if (b.cons) return false;
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
      const sp = b.space || def.space;
      return sp ? Math.floor(sp * C.enclosureLevels.capacity[b.level - 1]) : 0;
    }
    usedSpace(b) {
      let s = 0;
      for (const d of this.s.dinos) if (d.enc === b.id) s += this.dinoSpace(d);
      for (const dl of this.s.deliveries) if (dl.enc === b.id && !dl.dropped && !dl.cancelled) s += C.dinos[dl.sp].space;
      for (const tr of this.transfers || []) if (tr.to === b.id && !tr.landed) s += this.dinoSpace(tr.d);
      return s;
    }
    dinoSpace(d) { const sp = C.dinos[d.sp].space; return d.young ? Math.max(1, Math.ceil(sp * C.breeding.babySpace)) : sp; }
    deliveriesTo(b) { return this.s.deliveries.filter((dl) => dl.enc === b.id && !dl.dropped && !dl.cancelled); }
    dinosIn(b) { return this.s.dinos.filter((d) => d.enc === b.id); }

    habitatOk(spId, b) {
      const sp = DZ.SPECIES[spId], def = C.buildings[b.type];
      if (def.cat !== 'enclos') return false;
      if (sp.habitat === 'air') return def.kind === 'air';
      if (sp.habitat === 'water') return def.kind === 'water';
      return def.kind === 'land' && SIZE_RANK[sp.size] <= SIZE_RANK[b.size || def.size];
    }

    canAddDino(spId, b) {
      const sp = DZ.SPECIES[spId], bal = C.dinos[spId];
      if (!this.s.unlocked[spId]) return { ok: false, reason: 'Espèce verrouillée' };
      if (!b || !this.isEnclosure(b)) return { ok: false, reason: 'Choisissez un enclos' };
      if (b.cons) return { ok: false, reason: 'Enclos encore en construction' };
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
      for (const dl of this.deliveriesTo(b)) species.add(dl.sp);
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

    /* Achat : le dinosaure est préparé puis livré par hélicoptère. */
    buyDino(spId, bid, sex) {
      const b = this.s.buildings[bid];
      const c = this.canAddDino(spId, b);
      if (!c.ok) return c;
      const bal = C.dinos[spId];
      this._spend(bal.price, 'dinos');
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const west = this.layout && this.layout.seaSide === 'W';
      const dl = {
        id: this.s.nextDel++, sp: spId, enc: b.id, sex: sex === 'M' || sex === 'F' ? sex : (R() < 0.5 ? 'M' : 'F'), name: '',
        t: 0, prep: this.deliveryHours(spId), x: cx, y: cy,
        sx: west ? -45 : W + 45, sy: U.clamp(cy - 30 + R() * 20, -20, H + 20)
      };
      dl.name = DZ.dinoName(dl.sex, this.s.nameIdx++);
      // plusieurs commandes pour le même enclos : les hélicoptères se suivent
      const queued = this.s.deliveries.filter((x) => x.enc === b.id && !x.dropped && !x.cancelled).length;
      dl.prep += queued * (C.delivery.hover + 0.12);
      this.s.deliveries.push(dl);
      this.emit('deliveryOrdered', dl);
      this.playerTask(cx, cy, 'receive', b.id);
      if (c.warning) this.notify('⚠️', `Attention : ${DZ.leSp(c.warning.predator)} risque d'attaquer ${DZ.leSp(c.warning.prey)} !`, 'bad');
      return { ok: true, delivery: dl };
    }

    deliveryHours(spId) { const D = C.delivery; return D.prepBase + D.prepLog * Math.log10(Math.max(1, C.dinos[spId].price / 500)); }
    deliveryTotal(dl) { const D = C.delivery; return dl.prep + D.flight + D.hover; }
    deliveryPhase(dl) {
      const D = C.delivery;
      let t = dl.t - dl.prep;
      if (t < 0) return { phase: 'prep', u: dl.t / dl.prep, left: -t + D.flight + D.hover };
      if (t < D.flight) return { phase: 'fly', u: t / D.flight, left: D.flight - t + D.hover };
      t -= D.flight;
      if (t < D.hover) return { phase: 'hover', u: t / D.hover, left: D.hover - t };
      t -= D.hover;
      if (t < D.leave) return { phase: 'leave', u: t / D.leave, left: 0 };
      return { phase: 'done', u: 1, left: 0 };
    }
    /* Position de l'hélicoptère (repère des cases ; alt : 0 sol → 1 haute altitude). */
    deliveryPose(dl) {
      const ph = this.deliveryPhase(dl);
      if (ph.phase === 'prep' || ph.phase === 'done') return null;
      const ease = (u) => u * u * (3 - 2 * u);
      const tx = dl.x, ty = dl.y, HOV = 0.42;
      const head = Math.atan2(ty - dl.sy, tx - dl.sx);
      if (ph.phase === 'fly') {
        const e = ease(ph.u);
        return { x: U.lerp(dl.sx, tx, e), y: U.lerp(dl.sy, ty, e), alt: U.lerp(1, HOV, e), heading: head, tilt: Math.sin(ph.u * Math.PI) * 0.22, cable: 0, crate: true, phase: ph.phase, u: ph.u };
      }
      if (ph.phase === 'hover') {
        const w = Math.sin(dl.t * 40) * 0.05;
        return { x: tx + w, y: ty + Math.cos(dl.t * 31) * 0.05, alt: HOV + Math.sin(dl.t * 25) * 0.01, heading: head, tilt: -0.04, cable: ease(Math.min(1, ph.u * 1.25)), crate: true, phase: ph.phase, u: ph.u };
      }
      const e = ease(ph.u);
      return { x: U.lerp(tx, dl.sx, e * e), y: U.lerp(ty, dl.sy, e * e), alt: U.lerp(HOV, 1.15, e), heading: head + Math.PI * Math.min(1, ph.u * 2.5), tilt: Math.sin(ph.u * Math.PI) * 0.18, cable: Math.max(0, 1 - ph.u * 4), crate: false, phase: ph.phase, u: ph.u };
    }

    _updateDeliveries(dh) {
      const list = this.s.deliveries;
      for (let i = list.length - 1; i >= 0; i--) {
        const dl = list[i];
        const before = this.deliveryPhase(dl).phase;
        dl.t += dh;
        const ph = this.deliveryPhase(dl).phase;
        const b = this.s.buildings[dl.enc];
        if (b) { dl.x = b.x + b.w / 2; dl.y = b.y + b.h / 2; }
        if (before === 'prep' && ph !== 'prep') this.emit('heliDepart', dl);
        if (!dl.dropped && (ph === 'leave' || ph === 'done')) { dl.dropped = true; this._dropDino(dl); }
        if (ph === 'done') list.splice(i, 1);
      }
    }

    _dropDino(dl) {
      const b = this.s.buildings[dl.enc];
      if (dl.cancelled || !b) return;
      const p = this.randomPointIn(b, dl.sp);
      const d = {
        id: this.s.nextDinoId++, sp: dl.sp, enc: b.id, name: dl.name, sex: dl.sex,
        x: p.x, y: p.y, face: R() < 0.5 ? 1 : -1, upHab: 0, upCare: 0, sick: false, sickDays: 0, happiness: 70, born: this.s.day
      };
      // il sort de la caisse posée au centre de l'enclos
      const sh = DZ.encShape(b);
      if (DZ.encSDF(b, sh.cx, sh.cy, sh) < -this.shapeMargin(b, DZ.SPECIES[dl.sp])) { d.x = sh.cx; d.y = sh.cy; }
      this._initDinoTransient(d);
      this.s.dinos.push(d);
      this._updateHappiness();
      this.emit('dinoAdded', d);
      this.emit('delivered', { dino: d, delivery: dl });
      this.notify('🚁', `Livraison réussie : ${d.name}, ${DZ.SPECIES[d.sp].name} ${d.sex === 'F' ? 'femelle' : 'mâle'}, découvre son enclos.`, 'good', { type: 'select', building: b.id });
    }

    /* ---------- Reproduction ---------- */
    dinoScale(d) {
      if (!d.young) return 1;
      const B = C.breeding, size = DZ.SPECIES[d.sp].size || 'M';
      const g = U.clamp((this.s.day - d.born + (this.s.hour - C.time.startHour) / (C.time.endHour - C.time.startHour)) / B.growDays[size], 0, 1);
      return B.babyScale + (1 - B.babyScale) * g;
    }
    /* État de la reproduction d'une espèce dans un enclos (pour l'interface). */
    breedingInfo(b, sp) {
      const B = C.breeding, adults = this.dinosIn(b).filter((d) => d.sp === sp && !d.young);
      const m = adults.filter((d) => d.sex === 'M').length, f = adults.filter((d) => d.sex === 'F').length;
      const need = B.days[DZ.SPECIES[sp].size || 'M'];
      const pending = this.s.births.some((x) => x.enc === b.id && x.sp === sp);
      const hap = adults.length ? adults.reduce((a, d) => a + d.happiness, 0) / adults.length : 0;
      return { m, f, pair: m > 0 && f > 0, days: (b.breed && b.breed[sp]) || 0, need, pending, happyOk: hap >= B.minHappiness };
    }
    _breed() {
      const B = C.breeding, s = this.s;
      for (const id in s.buildings) {
        const b = s.buildings[id];
        if (!this.isEnclosure(b) || b.cons) continue;
        const bySp = {};
        for (const d of this.dinosIn(b)) if (!d.young && !d.loose) (bySp[d.sp] = bySp[d.sp] || []).push(d);
        b.breed = b.breed || {};
        for (const sp in b.breed) if (!bySp[sp]) delete b.breed[sp];
        for (const sp in bySp) {
          const list = bySp[sp];
          const m = list.filter((d) => d.sex === 'M' && !d.sick), f = list.filter((d) => d.sex === 'F' && !d.sick);
          if (!m.length || !f.length) { delete b.breed[sp]; continue; }
          const hap = list.reduce((a, d) => a + d.happiness, 0) / list.length;
          if (hap < B.minHappiness) continue; // en pause tant qu'ils ne sont pas heureux
          b.breed[sp] = (b.breed[sp] || 0) + 1;
          if (b.breed[sp] >= B.days[DZ.SPECIES[sp].size || 'M']) {
            b.breed[sp] = 0;
            s.births.push({ enc: b.id, sp, hour: rr(9, 16) });
          }
        }
      }
    }
    _checkBirths(prevHour) {
      const s = this.s;
      for (let i = s.births.length - 1; i >= 0; i--) {
        const br = s.births[i];
        if (!(prevHour < br.hour && s.hour >= br.hour)) continue;
        s.births.splice(i, 1);
        const b = s.buildings[br.enc];
        if (!b) continue;
        const sp = DZ.SPECIES[br.sp];
        const mother = this.dinosIn(b).find((d) => d.sp === br.sp && d.sex === 'F' && !d.young);
        if (!mother) continue;
        if (this.usedSpace(b) + C.dinos[br.sp].space > this.capacity(b)) {
          this.notify('💞', `Le couple de ${sp.name} voudrait agrandir la famille, mais l'enclos est plein. Améliorez-le ou faites de la place.`, 'info', { type: 'select', building: b.id });
          continue;
        }
        const d = {
          id: s.nextDinoId++, sp: br.sp, enc: b.id, name: '', sex: R() < 0.5 ? 'M' : 'F', young: 1,
          x: mother.x + rr(-0.3, 0.3), y: mother.y + rr(-0.3, 0.3), face: mother.face, upHab: 0, upCare: 0, sick: false, sickDays: 0, happiness: 85, born: s.day
        };
        d.name = DZ.dinoName(d.sex, s.nameIdx++);
        this.keepInside(d, b, sp);
        this._initDinoTransient(d);
        s.dinos.push(d);
        this._updateHappiness();
        this.emit('dinoBorn', d);
        this.notify('🐣', `Naissance ! ${d.name}, ${d.sex === 'F' ? 'une petite' : 'un petit'} ${sp.name}, vient de naître.`, 'good', { type: 'select', building: b.id });
      }
    }

    _initDinoTransient(d) {
      d.state = 'idle'; d.timer = rr(0.5, 3); d.gx = d.x; d.gy = d.y; d.phase = R() * 6; d.moving = 0;
      d.anim = 0; d.headT = 0; d.alt = 20 + R() * 20; d.heading = R() * U.TAU; d.surf = 0; d.t = R() * 100;
    }

    _dinoValue(d) {
      const bal = C.dinos[d.sp], up = C.economy.dinoUpgrades;
      return bal.price * (d.young ? C.breeding.babyValue : 1) * (1 + (d.upHab ? up.habitat.costRate : 0) + (d.upCare ? up.care.costRate : 0));
    }

    sellDino(id) {
      const d = this.s.dinos.find((x) => x.id === id);
      if (!d) return { ok: false };
      if (d.tr) return { ok: false, reason: 'Transfert en cours' };
      if (d.loose) return { ok: false, reason: 'Capturez-le d\'abord' };
      const refund = Math.round(this._dinoValue(d) * C.economy.dinoSellRate);
      this.playerTask(d.x, d.y, 'care', d.enc);
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
      this.playerTask(d.x, d.y, 'care', d.enc);
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
      d.sick = false; d.sickDays = 0; d.injured = 0;
      this.playerTask(d.x, d.y, 'treat', d.enc);
      this._updateHappiness();
      this.emit('dinoTreated', d);
      this.notify('💉', `${this.who(d)} est ${d.sex === 'F' ? 'guérie' : 'guéri'} !`, 'good');
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
        if (d.sick) h -= d.injured ? 22 : 30;
        h += this._habitatMood(d, b, sp);
        d.happiness = U.clamp(h, 0, 100);
      }
    }

    dinoAttraction(d) {
      const up = C.economy.dinoUpgrades;
      let a = C.dinos[d.sp].attraction * (d.young ? C.breeding.babyAttraction : 1);
      a *= 1 + (d.upHab ? up.habitat.attraction : 0) + (d.upCare ? up.care.attraction : 0);
      a *= 0.6 + d.happiness / 250;
      if (d.sick) a *= 0.3;
      return a;
    }

    enclosureAttraction(b) {
      let a = 0;
      for (const d of this.s.dinos) if (d.enc === b.id && !d.loose) a += this.dinoAttraction(d);
      return a * C.enclosureLevels.attraction[b.level - 1];
    }

    randomPointIn(b, spId) {
      const sp = DZ.SPECIES[spId];
      const m = this.interior(b, sp);
      const sh = DZ.encShape(b), margin = this.shapeMargin(b, sp);
      for (let k = 0; k < 40; k++) {
        const x = rr(m.x0, m.x1), y = rr(m.y0, m.y1);
        if (DZ.encSDF(b, x, y, sh) < -margin) return { x, y };
      }
      return { x: sh.cx, y: sh.cy };
    }
    /* Le trajet en ligne droite reste-t-il dans l'enclos ? (enclos agrandi : la forme peut avoir des coins rentrants) */
    segmentInside(b, x0, y0, x1, y1, m, sh) {
      sh = sh || DZ.encShape(b);
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
      for (let k = 1; k <= n; k++) if (DZ.encSDF(b, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, sh) > -m) return false;
      return true;
    }
    /* Destination d'une promenade : atteignable en ligne droite sans traverser la clôture. */
    walkGoal(b, d) {
      if (!b.parts) return this.randomPointIn(b, d.sp);
      const sh = DZ.encShape(b), m = this.shapeMargin(b, DZ.SPECIES[d.sp]) * 0.7;
      for (let k = 0; k < 14; k++) { const p = this.randomPointIn(b, d.sp); if (this.segmentInside(b, d.x, d.y, p.x, p.y, m, sh)) return p; }
      for (let k = 0; k < 10; k++) { const p = this.pointNear(b, DZ.SPECIES[d.sp], d.x, d.y, 3); if (p && this.segmentInside(b, d.x, d.y, p.x, p.y, m, sh)) return p; }
      return { x: d.x, y: d.y };
    }
    /* Point au hasard dans un rayon donné (pour les rapprochements et les fuites). */
    pointNear(b, sp, x, y, r) {
      const sh = DZ.encShape(b), margin = this.shapeMargin(b, sp);
      for (let k = 0; k < 24; k++) {
        const a = R() * U.TAU, l = r * Math.sqrt(R()), px = x + Math.cos(a) * l, py = y + Math.sin(a) * l;
        if (DZ.encSDF(b, px, py, sh) < -margin) return { x: px, y: py };
      }
      return null;
    }
    shapeMargin(b, sp) {
      const def = C.buildings[b.type];
      if (def.kind === 'water') return 1.1;
      if (def.kind === 'air') return 0.9;
      // assez loin de la clôture pour que la tête et la queue des plus longs ne la traversent pas
      return Math.max(0.55 + (sp && sp.size === 'L' ? 0.5 : sp && sp.size === 'M' ? 0.25 : 0), sp && sp.len ? 0.2 + sp.len * 0.42 : 0);
    }
    /* Ramène un animal dans la forme de son enclos. */
    keepInside(d, b, sp, sh) {
      sh = sh || DZ.encShape(b);
      const m = this.shapeMargin(b, sp);
      const sd = DZ.encSDF(b, d.x, d.y, sh);
      if (sd > -m && sh.multi) {
        // forme quelconque : on suit la pente de la distance signée
        for (let it = 0; it < 4; it++) {
          const e = 0.05, v = DZ.encSDF(b, d.x, d.y, sh);
          if (v <= -m) break;
          const gx = DZ.encSDF(b, d.x + e, d.y, sh) - DZ.encSDF(b, d.x - e, d.y, sh), gy = DZ.encSDF(b, d.x, d.y + e, sh) - DZ.encSDF(b, d.x, d.y - e, sh);
          const gl = Math.hypot(gx, gy) || 1;
          d.x -= gx / gl * (v + m + 0.03); d.y -= gy / gl * (v + m + 0.03);
        }
        return true;
      }
      if (sd > -m) {
        const dx = sh.cx - d.x, dy = sh.cy - d.y, l = Math.hypot(dx, dy) || 1;
        const push = Math.min(l, sd + m + 0.02);
        d.x += dx / l * push; d.y += dy / l * push;
        return true;
      }
      return false;
    }

    interior(b, sp) {
      const def = C.buildings[b.type];
      if (def.kind === 'water') return { x0: b.x + 0.9, x1: b.x + b.w - 0.9, y0: b.y + 0.9, y1: b.y + b.h - 0.8 };
      if (def.kind === 'air') return { x0: b.x + 0.8, x1: b.x + b.w - 0.8, y0: b.y + 0.8, y1: b.y + b.h - 0.6 };
      const big = sp && sp.size === 'L' ? 0.4 : 0;
      return { x0: b.x + 0.6 + big, x1: b.x + b.w - 0.6 - big, y0: b.y + 1.0 + big * 0.5, y1: b.y + b.h - 0.4 };
    }

    updateDinos(dt) {
      if (this.fights.length) this._updateFights(dt);
      if (this.hunts.length) this._updateHunts(dt);
      for (const d of this.s.dinos) {
        const b = this.s.buildings[d.enc];
        if (!b) continue;
        const sp = DZ.SPECIES[d.sp];
        d.t += dt;
        if (d.tr && d.tr.hold) continue; // transfert : animé à part
        if (d.loose) { this._updateLoose(d, sp, dt); continue; } // évadé, en liberté dans le parc
        if (d.fight || d.hunt) continue; // combats, chasses et transferts sont animés à part
        if (d.cross) { this._updateCrossing(d, b, sp, dt); continue; }
        if (sp.habitat === 'air') this._updateFlyer(d, b, sp, dt);
        else if (sp.habitat === 'water') this._updateSwimmer(d, b, sp, dt);
        else this._updateWalker(d, b, sp, dt);
      }
      // enclos agrandis (formes à coins rentrants) : personne ne traverse la clôture,
      // même en se battant ou en chassant
      let shapes = null;
      for (const d of this.s.dinos) {
        const b = this.s.buildings[d.enc];
        if (!b || !b.parts || d.loose || d.cross || (d.tr && d.tr.lift > 0)) continue;
        shapes = shapes || new Map();
        let sh = shapes.get(b.id);
        if (!sh) { sh = DZ.encShape(b); shapes.set(b.id, sh); }
        this.keepInside(d, b, DZ.SPECIES[d.sp], sh);
      }
    }

    _updateWalker(d, b, sp, dt) {
      d.timer -= dt;
      d.anim += dt;
      const speed = sp.speed * (d.sick ? 0.5 : 1) * (d.run || 1);
      if (d.state === 'walk') {
        const dx = d.gx - d.x, dy = d.gy - d.y, dist = Math.hypot(dx, dy);
        if (dist < 0.05 || d.timer < -12) { d.state = 'idle'; d.timer = rr(1, 4); d.moving = 0; d.run = 0; if (R() < 0.3) d.face = -d.face; }
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
      if (this._maybeCross(d, b, sp)) return;
      if (r < roarP) { d.state = 'roar'; d.timer = 1.8; d.anim = 0; this.emit('roar', d); }
      else if (r < roarP + (feeding ? 0.45 : 0.18)) { d.state = 'eat'; d.timer = rr(3, 6); d.anim = 0; }
      else if (r < roarP + 0.28 + (d.sick ? 0.4 : 0)) { d.state = 'rest'; d.timer = rr(4, 8); d.anim = 0; }
      else {
        const p = this.walkGoal(b, d);
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
      if (this.keepInside(d, b, sp)) { const p = this.randomPointIn(b, d.sp); d.gx = p.x; d.gy = p.y; }
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
      if (this.keepInside(d, b, sp)) { const p = this.randomPointIn(b, d.sp); d.gx = p.x; d.gy = p.y; }
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
          for (const d of this.s.dinos) if (d.enc === b.id && !d.loose) {
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
      dinos += this.linkShow() + this.skyShow();
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
      n *= 1 - (this.s.fear || 0); // la peur après une évasion éloigne les visiteurs
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
      if (!sp || !this.s || this.s.over) return;
      let simDt = Math.min(dtReal, 0.1) * sp;
      const n = Math.ceil(simDt / 0.05);
      const step = simDt / n;
      for (let i = 0; i < n; i++) this.step(step);
    }

    step(dt) {
      const s = this.s;
      if (s.over) return; // partie terminée
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
      this._updateWorks(dh);
      this._updateDeliveries(dh);
      this._updateLinkWorks(dh);
      if (this.transfers.length) this._updateTransfers(dt);
      this._checkFights(dh);
      this._checkHunts(dh);
      if (s.births.length) this._checkBirths(prevHour);
      this._updatePlayer(dt);
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
      // évasion possible derrière une clôture trop faible (voir escapes.js)
      if (!first) this._scheduleEscape();
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
      this.notify('🤒', `${this.who(d)} est malade ! Soignez-${d.sex === 'F' ? 'la' : 'le'} (${U.money(this.treatCost(d))}) avant ${C.events.sickDaysToDeath} jours.`, 'bad', { type: 'treat', dino: d.id });
    }

    endDay() {
      const s = this.s, t = s.today, E = C.events;
      // départ forcé des derniers visiteurs
      for (const g of this.visitors) this._recordExit(g);
      this.visitors = [];
      // entretien
      let dinoUp = 0, bUp = 0;
      for (const d of s.dinos) dinoUp += C.dinos[d.sp].upkeep * (d.young ? C.breeding.babyUpkeep : 1);
      for (const id in s.buildings) {
        const b = s.buildings[id], def = C.buildings[b.type];
        if (def.upkeep) bUp += this.upkeepOf(b);
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
        this.notify('🕯️', `${this.who(d)} n'a pas survécu à ${d.injured ? 'ses blessures' : 'sa maladie'}.`, 'bad');
        this.emit('dinoRemoved', d);
      }
      // (la prédation se joue pendant la journée : voir les chasses dans habitats.js)
      // la peur s'estompe de jour en jour
      if (s.fear) { s.fear *= C.escape.fearDecay; if (s.fear < 0.02) s.fear = 0; }
      this._updateHappiness();
      // reproduction et croissance des petits
      this._breed();
      for (const d of s.dinos) if (d.young && s.day + 1 - d.born >= C.breeding.growDays[DZ.SPECIES[d.sp].size || 'M']) {
        d.young = 0;
        this.notify('🦖', `${this.who(d)} est ${d.sex === 'F' ? 'devenue' : 'devenu'} adulte !`, 'info');
      }
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

    /* ------------------------------------------------------------------
       Directeur ou directrice du parc : l'avatar se rend sur les lieux de
       chaque action (chantier, soins, livraison…). Purement visuel : les
       actions prennent effet tout de suite.
       ------------------------------------------------------------------ */
    _initPlayer() {
      const p = this.s.player;
      const x = p.x !== undefined ? p.x : ENT.tileX + 0.5, y = p.y !== undefined ? p.y : ENT.tileY - 2.5;
      this.pl = { x, y, tasks: [], cur: null, path: null, pi: 0, state: 'idle', t: 0, idleT: 4, dirX: 0, dirY: -1, phase: 0, speed: 0, anim: 0 };
    }
    playerTask(x, y, act, bid) {
      const p = this.pl;
      if (!p) return;
      const last = p.tasks.length ? p.tasks[p.tasks.length - 1] : p.cur;
      if (last && bid != null && last.bid === bid && last.act === act) return;
      p.tasks.push({ x, y, act, bid });
      if (p.tasks.length > 6) p.tasks.shift();
      if (p.state === 'idle' || (p.state === 'work' && p.cur && p.cur.act !== 'build')) { p.state = 'idle'; p.cur = null; }
    }
    _walkable(i, startOcc) {
      const t = this.terrain[i];
      if (t === TER.WATER || t === TER.ROCK) return false;
      const o = this.occ[i];
      return !o || o === startOcc;
    }
    /* Plus court chemin sur les cases praticables (8 directions), puis lissage. */
    _findPath(x0, y0, task) {
      const sx = U.clamp(Math.floor(x0), 0, W - 1), sy = U.clamp(Math.floor(y0), 0, H - 1), start = idx(sx, sy);
      const b = task.bid != null ? this.s.buildings[task.bid] : null;
      const startOcc = this.occ[start];
      const gx = Math.floor(task.x), gy = Math.floor(task.y);
      const isGoal = b
        ? (x, y) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h && !(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
        : (x, y) => Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1;
      const prev = this._bfsPrev || (this._bfsPrev = new Int32Array(W * H));
      const q = this._bfsQ || (this._bfsQ = new Int32Array(W * H));
      prev.fill(-1);
      prev[start] = start;
      let qh = 0, qt = 0, goal = -1;
      q[qt++] = start;
      const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i / W) | 0;
        if (isGoal(x, y) && (i !== start || !b || !(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h))) { goal = i; break; }
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (!inMap(nx, ny)) continue;
          const j = idx(nx, ny);
          if (prev[j] >= 0 || !this._walkable(j, startOcc)) continue;
          if (dx && dy && (!this._walkable(idx(x + dx, y), startOcc) || !this._walkable(idx(x, y + dy), startOcc))) continue;
          prev[j] = i; q[qt++] = j;
        }
      }
      let pts;
      if (goal < 0) {
        // inaccessible à pied (île, bâtiment enclavé) : ligne droite
        pts = [[b ? U.clamp(task.x, b.x - 0.4, b.x + b.w + 0.4) : task.x, b ? U.clamp(task.y, b.y - 0.4, b.y + b.h + 0.4) : task.y]];
      } else {
        const tiles = [];
        for (let i = goal; i !== start; i = prev[i]) tiles.push(i);
        tiles.reverse();
        const raw = tiles.map((i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5]);
        // dernier pas : se placer contre le bâtiment, face au point visé
        if (b && raw.length) { const e = raw[raw.length - 1]; e[0] = U.lerp(e[0], U.clamp(e[0], b.x, b.x + b.w), 0.45); e[1] = U.lerp(e[1], U.clamp(e[1], b.y, b.y + b.h), 0.45); }
        const sight = (a, c) => {
          const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.3);
          for (let k = 1; k < n; k++) { const x = a[0] + (c[0] - a[0]) * k / n, y = a[1] + (c[1] - a[1]) * k / n; if (!this._walkable(idx(Math.floor(x), Math.floor(y)), startOcc)) return false; }
          return true;
        };
        pts = [];
        let cur = [x0, y0], i = 0;
        while (i < raw.length) {
          let j = raw.length - 1;
          while (j > i && !sight(cur, raw[j])) j--;
          pts.push(raw[j]); cur = raw[j]; i = j + 1;
        }
      }
      return pts;
    }
    _playerStart(task) {
      const p = this.pl, P = C.player;
      p.cur = task;
      p.path = this._findPath(p.x, p.y, task);
      p.pi = 0;
      let L = 0, px = p.x, py = p.y;
      for (const [x, y] of p.path) { L += Math.hypot(x - px, y - py); px = x; py = y; }
      p.speed = Math.max(P.walkSpeed, L / P.maxTripSeconds);
      p.state = 'walk';
      if (L < 0.05) this._playerArrive();
    }
    _playerArrive() {
      const p = this.pl, task = p.cur;
      p.state = 'work'; p.anim = 0;
      p.t = task.act === 'build' ? C.player.workSeconds : task.act === 'receive' ? 4 : task.act === 'treat' ? 3.5 : 2.5;
      const b = task.bid != null ? this.s.buildings[task.bid] : null;
      let tx = task.x, ty = task.y;
      if (b && task.act === 'build') { tx = U.clamp(p.x, b.x + 0.5, b.x + b.w - 0.5); ty = U.clamp(p.y, b.y + 0.5, b.y + b.h - 0.5); }
      if (task.act === 'receive' && b) { tx = b.x + b.w / 2; ty = b.y + b.h / 2; }
      const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
      if (l > 0.01) { p.dirX = dx / l; p.dirY = dy / l; }
    }
    _updatePlayer(dt) {
      const p = this.pl;
      if (!p) return;
      if (p.state === 'walk') {
        let move = p.speed * dt;
        p.phase += move * 3.4;
        while (move > 1e-6 && p.pi < p.path.length) {
          const [tx, ty] = p.path[p.pi];
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
          if (d > 1e-4) { p.dirX = dx / d; p.dirY = dy / d; }
          if (d <= move) { p.x = tx; p.y = ty; p.pi++; move -= d; }
          else { p.x += dx / d * move; p.y += dy / d * move; move = 0; }
        }
        if (p.pi >= p.path.length) this._playerArrive();
        return;
      }
      if (p.state === 'work') {
        p.t -= dt; p.anim += dt;
        const b = p.cur && p.cur.bid != null ? this.s.buildings[p.cur.bid] : null;
        const stillWorks = p.cur && p.cur.act === 'build' && b && this.busy(b);
        if (p.t <= 0 && (!stillWorks || p.tasks.length)) { p.cur = null; p.state = 'idle'; p.idleT = rr(6, 12); }
        return;
      }
      if (p.tasks.length) { this._playerStart(p.tasks.shift()); return; }
      p.anim += dt;
      p.idleT -= dt;
      if (p.idleT <= 0) {
        p.idleT = rr(8, 16);
        // va superviser le chantier en cours le plus proche
        let best = null, bd = 1e9;
        for (const id in this.s.buildings) {
          const b = this.s.buildings[id];
          if (!this.busy(b) || C.buildings[b.type].cat === 'deco') continue;
          const d = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y);
          if (d < bd) { bd = d; best = b; }
        }
        if (best && bd > 2) this._playerStart({ x: best.x + best.w / 2, y: best.y + best.h / 2, act: 'build', bid: best.id });
      }
    }

    /* « Luna (Triceratops) » : évite d'accorder l'article avec le sexe. */
    who(d) { return `${d.name} (${DZ.SPECIES[d.sp].name})`; }

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
      const open = this.looseOpenFactor(); // dinosaure en liberté : entrées réduites, ou parc fermé
      if (open <= 0) return;
      const x = (s.hour - T.openHour) / (T.lastEntryHour - T.openHour);
      const rate = this.dailyTarget * this._arrivalShape(x) / (this._norm * (T.lastEntryHour - T.openHour));
      this.arrivalAcc += rate * open * dh * (1 + (R() - 0.5) * 2 * C.visitors.randomness);
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
        kids: members.filter((m) => m.child).length, play: rr(0, 35), played: [],
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
        if (g.kids) g.play += C.play.rate * dh;
        g.sat -= V.boredom * dh;
        if (storm && !g.hidden) g.sat -= 4 * dh;
        if (g.hunger > 88) g.sat -= V.needPenalty * dh;
        if (g.bladder > 88) g.sat -= V.needPenalty * dh;
        g.sat = U.clamp(g.sat, 0, 100);
        g.bubbleT -= dt;
        // dinosaure en liberté : temps de réaction avant la fuite (figés de peur tout près)
        if (g.fearT > 0) { g.fearT -= dt; if (g.fearT <= 0) this._flee(g); else if (g.frozen) continue; }
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
            const done = this._moveStraight(g, ENT.tileX + 0.5 + g.lane * 0.5, H + 0.8, dt * panicK(g));
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
      this._stopPlay(g);
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
      const st = C.visitors.speed * dt * panicK(g);
      if (d <= st) { g.x = x; g.y = y; return true; }
      g.x += dx / d * st; g.y += dy / d * st;
      g.dirX = dx / d; g.dirY = dy / d;
      g.wd += st;
      return false;
    }

    _moveAlong(g, dt) {
      let budget = C.visitors.speed * dt * panicK(g);
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
            if (inMap(nx, ny) && f[idx(nx, ny)] === here - 1 && this.canStep(idx(g.tx, g.ty), idx(nx, ny), d[0])) opts.push([nx, ny]);
          }
          if (!opts.length) { this.decide(g, true); return; }
          const o = opts[(g.id + g.tx * 7 + g.ty * 13) % opts.length];
          g.nx = o[0]; g.ny = o[1];
        }
        const ddx = g.nx - g.tx, ddy = g.ny - g.ty;
        const pcs = this.pathCenters(), ni = idx(g.nx, g.ny);
        const gx = pcs[ni * 2] - ddy * g.lane, gy = pcs[ni * 2 + 1] + ddx * g.lane;
        const dx = gx - g.x, dy = gy - g.y, dist = Math.hypot(dx, dy);
        if (dist <= budget) {
          g.x = gx; g.y = gy; budget -= dist; g.wd += dist;
          g.tx = g.nx; g.ty = g.ny; g.nx = null;
          this._onTile(g);
          if (g.state !== 'walk') return;
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
        for (const d of DIRS) if (this.isPath(g.tx + d[0], g.ty + d[1]) && this.canStep(idx(g.tx, g.ty), idx(g.tx + d[0], g.ty + d[1]), d[0])) opts.push(d);
        if (!opts.length) { this.goExit(g); return; }
        const d = U.pick(R, opts);
        g.nx = g.tx + d[0]; g.ny = g.ty + d[1];
        g.wanderSteps--;
      }
      const pcs = this.pathCenters(), ni = idx(g.nx, g.ny);
      const done = this._moveStraight(g, pcs[ni * 2], pcs[ni * 2 + 1], dt);
      if (done) { g.tx = g.nx; g.ty = g.ny; g.nx = null; this._onTile(g); }
    }

    _onTile(g) {
      const i = idx(g.tx, g.ty);
      if (this.sky[i] && this._skyGlance(g, i)) return;
      if (g.litter > 0 && R() < 0.18 && !this.sky[i]) {
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
          if (b.type !== type || b.cons) continue;
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
      // les enfants veulent jouer
      if (!target && g.kids && g.play > C.play.seek) { target = this._nearestPlay(g, here); kind = 'jeux'; }
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
            score = (8 + a) / (1 + d * 0.05) * rr(0.6, 1.4) * (this.skyRunsOver(b).length ? C.skywalk.appeal : 1);
          } else continue;
          if (score > bestScore) { bestScore = score; target = b; kind = 'enclos'; }
        }
      }
      if (target) {
        g.target = { key: target.id, kind };
        // une passerelle au-dessus de l'enclos : on y monte souvent pour mieux voir
        if (kind === 'enclos' && R() < 0.6 && this.skyRunsOver(target).length) {
          const f = this.field('sky:' + target.id);
          if (f && f[here] >= 0) g.target = { key: 'sky:' + target.id, bid: target.id, kind };
        }
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
      this._stopPlay(g);
      const f = this.field('exit');
      if (!this.isPath(g.tx, g.ty) || f[idx(g.tx, g.ty)] < 0) { g.state = 'exit'; return; }
      g.target = { key: 'exit', kind: 'exit' };
      g.state = 'walk';
    }

    _arrive(g) {
      const t = g.target;
      if (!t) return this.decide(g);
      if (t.kind === 'exit') { g.state = 'exit'; return; }
      const b = this.s.buildings[t.bid || t.key];
      if (!b) return this.decide(g);
      g.state = 'act';
      g.actBuilding = b.id;
      // se tourner vers le bâtiment et se placer au bord du chemin
      const cx = U.clamp(g.tx + 0.5, b.x, b.x + b.w), cy = U.clamp(g.ty + 0.5, b.y, b.y + b.h);
      const dx = cx - (g.tx + 0.5), dy = cy - (g.ty + 0.5);
      const len = Math.hypot(dx, dy) || 1;
      g.dirX = dx / len; g.dirY = dy / len;
      if (t.kind === 'enclos' && this.sky[idx(g.tx, g.ty)]) {
        this._skyWatch(g, b);
      } else if (t.kind === 'jeux') {
        this._startPlay(g, b);
      } else if (t.kind === 'enclos') {
        g.actT = rr(0.45, 0.95);
        g.hidden = false;
        g.view = 1;
        const pcs = this.pathCenters(), ci = idx(g.tx, g.ty);
        g.standX = pcs[ci * 2] + g.dirX * 0.22 + (-g.dirY) * rr(-0.3, 0.3);
        g.standY = pcs[ci * 2 + 1] + g.dirY * 0.22 + g.dirX * rr(-0.3, 0.3);
      } else {
        g.hidden = true;
        g.standX = undefined;
        g.actT = t.kind === 'restaurant' ? rr(0.5, 0.8) : t.kind === 'toilettes' ? rr(0.15, 0.3) : rr(0.25, 0.45);
      }
    }

    _finishActivity(g) {
      const t = g.target;
      const b = t && this.s.buildings[t.bid || t.key];
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
          const gain = Math.min(24, 4 + Math.sqrt(a) * 1.6) * novelty * (g.view || 1);
          g.view = 1;
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
        } else if (t.kind === 'jeux') {
          this._endPlay(g, b);
        }
      }
      this._stopPlay(g);
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
