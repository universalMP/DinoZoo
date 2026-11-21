/* =====================================================================
   DinoZoo 3D — Modèles réalistes (générés avec Meshy) sur le squelette
   des dinosaures procéduraux.

   Le pantin procédural (r3d/dino3d.js) reste la référence : il fournit,
   à chaque image, une matrice par pièce (corps, queue, cou, tête,
   mâchoire, cuisses, jambes, pieds, bras). Un modèle de DZ.MODELS est
   ajusté une fois sur la pose de repos du pantin ; chaque sommet est
   attaché aux pièces les plus proches (jusqu'à 4, poids lissés). Ensuite
   chaque pièce devient un os : le modèle suit toutes les animations
   existantes (marche, repos, repas, cri, combat, transport…).
   ===================================================================== */
(function () {
  const G = DZ.G, M4 = G.m4;
  const R = G.Renderer3D.prototype;

  const dec = (b64, Ctor) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Ctor(u8.buffer);
  };

  /* Pose de repos du pantin : liste [maillage, matrice], tête droite. */
  R.bindPose = function (id) {
    const fake = { id: -98, sp: id, x: 0, y: 0, face: 1, phase: 0, moving: 0, state: 'idle', anim: 0, heading: 0, gx: 1, gy: 0, alt: 18, surf: 0.6 };
    const parts = [];
    const saveH = this.world.heightAt;
    this.world.heightAt = () => 0;
    this._binding = true;
    this.dinoState.delete(-98);
    try { this.dinoPose(fake, 98 * 3.1, parts, 0); } // seedT = 0 : aucune oscillation
    finally { this._binding = false; this.world.heightAt = saveH; this.dinoState.delete(-98); }
    return parts;
  };

  R.skinModel = function (id) {
    this.skinCache = this.skinCache || new Map();
    if (this.skinCache.has(id)) return this.skinCache.get(id);
    if (this.noModels) return null;
    const M = DZ.MODELS && DZ.MODELS[id];
    if (!M) { this.requestModel(id); return null; } // pas encore chargé
    let res = null;
    if (DZ.SPECIES[id]) {
      try { res = this.buildSkin(id, M); } catch (e) { console.warn('Modèle 3D ' + id + ' ignoré :', e); res = null; }
    }
    this.skinCache.set(id, res);
    return res;
  };

  R.buildSkin = function (id, M) {
    const gl = this.gl;
    const parts = this.bindPose(id);
    const nb = parts.length;
    if (nb > G.MAX_BONES) throw new Error(nb + ' os, maximum ' + G.MAX_BONES);
    // points d'échantillon de chaque pièce, en pose de repos
    const samples = [];
    let px0 = 1e9, py0 = 1e9, pz0 = 1e9, px1 = -1e9, py1 = -1e9, pz1 = -1e9;
    for (const [mesh, mat] of parts) {
      const v = mesh.raw;
      if (!v) throw new Error('pièce sans sommets');
      const n = v.length / 10, step = Math.max(1, Math.floor(n / 220));
      const pts = [];
      for (let k = 0; k < n; k += step) {
        const p = M4.apply(mat, v[k * 10], v[k * 10 + 1], v[k * 10 + 2]);
        pts.push(p[0], p[1], p[2]);
        px0 = Math.min(px0, p[0]); px1 = Math.max(px1, p[0]); py0 = Math.min(py0, p[1]); py1 = Math.max(py1, p[1]); pz0 = Math.min(pz0, p[2]); pz1 = Math.max(pz1, p[2]);
      }
      samples.push(Float32Array.from(pts));
    }
    // modèle : décompression et ajustement sur la silhouette du pantin
    const n = M.n;
    const qp = dec(M.pos, Uint16Array), qn = dec(M.nor, Int8Array), qt = dec(M.uv, Uint16Array);
    const idx = M.wide ? dec(M.idx, Uint32Array) : dec(M.idx, Uint16Array);
    let sx = (px1 - px0) / (M.hi[0] - M.lo[0]), sy = (py1 - py0) / M.hi[1];
    sy = Math.min(sx * 1.25, Math.max(sx * 0.85, sy)); // pas d'écrasement : le modèle garde ses proportions
    let sz = (sx + sy) / 2; // largeur : proportions du modèle
    const zc = (pz0 + pz1) / 2;
    if (DZ.SPECIES[id].habitat !== 'land') {
      // volants et marins : longueur et envergure, sans déformer le modèle
      const k = (sx + (pz1 - pz0) / (M.hi[2] - M.lo[2])) / 2;
      sx = sy = sz = k;
      py0 = (py0 + py1) / 2 - M.hi[1] * k / 2;
      px0 = (px0 + px1) / 2 - (M.hi[0] - M.lo[0]) * k / 2;
    }
    const P = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const x = M.lo[0] + qp[k * 3] / 65535 * (M.hi[0] - M.lo[0]);
      const y = qp[k * 3 + 1] / 65535 * M.hi[1];
      const z = M.lo[2] + qp[k * 3 + 2] / 65535 * (M.hi[2] - M.lo[2]);
      P[k * 3] = px0 + (x - M.lo[0]) * sx; P[k * 3 + 1] = py0 + y * sy; P[k * 3 + 2] = zc + z * sz;
    }
    // poids : pièces les plus proches, lissées sur une courte distance
    const sig = (px1 - px0) * 0.03;
    const verts = new Float32Array(n * 20);
    const d = new Float32Array(nb);
    let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
    for (let k = 0; k < n; k++) {
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      for (let b = 0; b < nb; b++) {
        const s = samples[b];
        let m = 1e9;
        for (let j = 0; j < s.length; j += 3) { const dx = s[j] - x, dy = s[j + 1] - y, dz = s[j + 2] - z; const q = dx * dx + dy * dy + dz * dz; if (q < m) m = q; }
        d[b] = Math.sqrt(m);
      }
      const order = Array.from({ length: nb }, (_, b) => b).sort((a, b) => d[a] - d[b]).slice(0, 4);
      const dmin = d[order[0]];
      const w = order.map((b) => Math.exp(-Math.pow((d[b] - dmin) / sig, 2)));
      const ws = w.reduce((a, b) => a + b, 0);
      const o = k * 20;
      verts[o] = x; verts[o + 1] = y; verts[o + 2] = z;
      // normales : l'échelle non uniforme les déforme un peu, on corrige
      const nx = qn[k * 4] / 127 / sx, ny = qn[k * 4 + 1] / 127 / sy, nz = qn[k * 4 + 2] / 127 / sz, nl = Math.hypot(nx, ny, nz) || 1;
      verts[o + 3] = nx / nl; verts[o + 4] = ny / nl; verts[o + 5] = nz / nl;
      verts[o + 6] = 1; verts[o + 7] = 1; verts[o + 8] = 1; verts[o + 9] = 14 / 15;
      verts[o + 10] = qt[k * 2] / 65535; verts[o + 11] = qt[k * 2 + 1] / 65535;
      for (let j = 0; j < 4; j++) { verts[o + 12 + j] = order[j]; verts[o + 16 + j] = w[j] / ws; }
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z);
    }
    const mesh = G.uploadSkin(gl, { verts, idx: Uint32Array.from(idx), bounds: { x0: bx0, y0: by0, z0: bz0, x1: bx1, y1: by1, z1: bz1 } });
    // texture (image embarquée : fonctionne aussi depuis file://)
    const skin = { mesh, nb, invBind: parts.map(([, mat]) => M4.invert(mat)), tex: null };
    mesh.tex = null;
    if (M.tex) {
      const img = new Image();
      img.onload = () => { skin.tex = mesh.tex = G.texture(gl, img); this.refreshThumbs(id); };
      img.src = M.tex;
    }
    return skin;
  };

  /* Remplace les pièces du pantin (à partir de start) par le modèle. */
  R.skinSwap = function (d, out, start) {
    if (this._binding) return;
    const skin = this.skinModel(d.sp);
    if (!skin || !skin.mesh.tex || out.length - start !== skin.nb) return;
    const bones = new Float32Array(G.MAX_BONES * 16);
    const tmp = new Float32Array(16);
    for (let i = 0; i < skin.nb; i++) { M4.mul(out[start + i][1], skin.invBind[i], tmp); bones.set(tmp, i * 16); }
    out.length = start;
    out.push([skin.mesh, this.ident || (this.ident = M4.create()), bones]);
  };

  /* Tracé d'un maillage à squelette (appelé par drawMesh). */
  R.drawSkinned = function (prog, mesh, bones) {
    const gl = this.gl, u = prog.u;
    if (!u.uSkin) return;
    gl.uniform1f(u.uSkin, 1);
    gl.uniformMatrix4fv(u.uBones, false, bones);
    if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mesh.tex); }
    gl.uniformMatrix4fv(u.uModel, false, this.ident);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.uniform1f(u.uSkin, 0);
  };

  /* ------------------------------------------------------------------
     Visiteurs réalistes : un modèle Meshy par silhouette, dessiné en lot
     (instances). Les jambes et les bras sont repérés sur le modèle (pose
     en A) ; le shader les fait pivoter à la hanche et à l'épaule.
     ------------------------------------------------------------------ */
  const PERSON_H = 0.38; // hauteur des visiteurs procéduraux
  G.PEOPLE = { adult: ['v_man', 'v_woman', 'v_senior', 'v_young'], child: ['v_boy', 'v_girl'] };
  R.peopleModel = function (id) {
    this.peopleCache = this.peopleCache || new Map();
    if (this.peopleCache.has(id)) return this.peopleCache.get(id);
    if (this.noModels) return null;
    const M = DZ.MODELS && DZ.MODELS[id];
    if (!M) { this.requestModel(id); return null; }
    let res = null;
    try { res = this.buildPerson(id, M); } catch (e) { console.warn('Visiteur ' + id + ' ignoré :', e); }
    this.peopleCache.set(id, res);
    return res;
  };
  R.buildPerson = function (id, M) {
    const gl = this.gl, n = M.n;
    const qp = dec(M.pos, Uint16Array), qn = dec(M.nor, Int8Array), qt = dec(M.uv, Uint16Array);
    const idx = M.wide ? dec(M.idx, Uint32Array) : dec(M.idx, Uint16Array);
    const k = PERSON_H / M.hi[1];
    const P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      P[i * 3] = (M.lo[0] + qp[i * 3] / 65535 * (M.hi[0] - M.lo[0])) * k;
      P[i * 3 + 1] = qp[i * 3 + 1] / 65535 * M.hi[1] * k;
      P[i * 3 + 2] = (M.lo[2] + qp[i * 3 + 2] / 65535 * (M.hi[2] - M.lo[2])) * k;
    }
    const H = PERSON_H;
    // proportions humaines : entrejambe à 46 % de la taille (43 % chez l'enfant)
    const crotch = (G.PEOPLE.child.indexOf(id) >= 0 ? 0.43 : 0.46) * H;
    const hip = crotch + 0.05 * H, shoulder = 0.8 * H;
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const verts = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], o = i * 20;
      verts[o] = x; verts[o + 1] = y; verts[o + 2] = z;
      verts[o + 3] = qn[i * 4] / 127; verts[o + 4] = qn[i * 4 + 1] / 127; verts[o + 5] = qn[i * 4 + 2] / 127;
      verts[o + 6] = 1; verts[o + 7] = 1; verts[o + 8] = 1; verts[o + 9] = 14 / 15;
      verts[o + 10] = qt[i * 2] / 65535; verts[o + 11] = qt[i * 2 + 1] / 65535;
      const side = sm(-0.01 * H, 0.01 * H, x);
      // bras d'abord (en pose A, ils sont hors du tronc), puis jambes sous l'entrejambe
      const arm = sm(0.115 * H, 0.15 * H, Math.abs(x)) * sm(0.3 * H, 0.36 * H, y) * (1 - sm(0.84 * H, 0.88 * H, y));
      const leg = sm(hip + 0.03 * H, crotch - 0.02 * H, y) * (1 - arm);
      verts[o + 16] = leg * side; verts[o + 17] = leg * (1 - side);
      verts[o + 18] = x > 0 ? arm : 0; verts[o + 19] = x < 0 ? arm : 0;
    }
    let y1 = 0;
    for (let i = 1; i < n * 3; i += 3) y1 = Math.max(y1, P[i]);
    const mesh = G.enableInstancing(gl, G.uploadSkin(gl, { verts, idx: Uint32Array.from(idx), bounds: { x0: -0.1, y0: 0, z0: -0.1, x1: 0.1, y1, z1: 0.1 } }));
    const pm = { mesh, hip, shoulder, tex: null, data: null, count: 0 };
    if (M.tex) { const img = new Image(); img.onload = () => { pm.tex = mesh.tex = G.texture(gl, img); }; img.src = M.tex; }
    return pm;
  };
  /* Légère variation de teinte par visiteur (les vêtements de la texture sont fixes). */
  const TINTS = [];
  for (let i = 0; i < 16; i++) { const h = (i * 0.618) % 1; TINTS.push([0.9 + 0.14 * Math.abs(Math.sin(h * 6.3)), 0.9 + 0.12 * Math.abs(Math.sin(h * 6.3 + 2)), 0.88 + 0.14 * Math.abs(Math.sin(h * 6.3 + 4)), 0]); }
  R.personTint = function (v) { return TINTS[(v * 7 + (v >> 4)) % TINTS.length]; };
  /* Silhouette prête pour ce visiteur (ou null : visiteur procédural). */
  R.personVariant = function (v, child) {
    const list = child ? G.PEOPLE.child : G.PEOPLE.adult;
    const pm = this.peopleModel(list[(v >> 3) % list.length]);
    return pm && pm.tex ? pm : null;
  };
  R.beginPeople = function () {
    for (const pm of (this.peopleCache || new Map()).values()) if (pm) pm.count = 0;
  };
  R.addPerson = function (pm, m, legA, legB, armA, armB, tint) {
    const need = (pm.count + 1) * G.INST_FLOATS;
    if (!pm.data || pm.data.length < need) { const d = new Float32Array(Math.max(64 * G.INST_FLOATS, need * 2)); if (pm.data) d.set(pm.data); pm.data = d; }
    this.writeInst(pm.data, pm.count++, m, tint || [1, 1, 1, 0], [legA, legB, armA], [armB, 0, 0], [0, 0, 0]);
  };
  R.endPeople = function () {
    for (const pm of (this.peopleCache || new Map()).values()) if (pm && pm.data) G.setInstances(this.gl, pm.mesh, pm.data, pm.count);
  };
  R.drawPeople = function (prog) {
    const gl = this.gl, u = prog.u;
    if (!u.uPeople || !this.peopleCache) return;
    gl.uniform1f(u.uPeople, 1);
    for (const pm of this.peopleCache.values()) {
      if (!pm || !pm.count || !pm.tex) continue;
      gl.uniform1f(u.uHip, pm.hip); gl.uniform1f(u.uShoulder, pm.shoulder);
      if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, pm.tex); }
      this.drawInst(prog, pm.mesh);
    }
    gl.uniform1f(u.uPeople, 0);
    if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.whiteTex()); }
  };

  /* ------------------------------------------------------------------
     Végétation réaliste : un modèle Meshy par sorte de plante, dessiné en
     lot à la place de la version détaillée procédurale (la version
     simplifiée reste pour les arbres lointains).
     ------------------------------------------------------------------ */
  G.PLANTS = { araucaria: 't_araucaria', palmier: 't_palmier', cycas: 't_cycas', fougere: 't_fougere', ginkgo: 't_ginkgo', buisson: 't_fougere', /* le buisson Meshy était raté : touffe de feuilles de la fougère */ arbremort: 't_arbremort' };
  R.plantModel = function (kind) {
    const id = G.PLANTS[kind];
    if (!id || this.noModels) return null;
    this.plantCache = this.plantCache || new Map();
    if (this.plantCache.has(kind)) { const pm = this.plantCache.get(kind); return pm && pm.tex ? pm : null; }
    const M = DZ.MODELS && DZ.MODELS[id];
    if (!M) { this.requestModel(id); return null; }
    let pm = null;
    try { pm = this.buildPlant(kind, M); } catch (e) { console.warn('Plante ' + kind + ' ignorée :', e); }
    this.plantCache.set(kind, pm);
    return null; // prête quand sa texture est chargée
  };
  R.buildPlant = function (kind, M) {
    const gl = this.gl, n = M.n;
    const qp = dec(M.pos, Uint16Array), qn = dec(M.nor, Int8Array), qt = dec(M.uv, Uint16Array);
    const idx = M.wide ? dec(M.idx, Uint32Array) : dec(M.idx, Uint16Array);
    const info = this.treeMesh(kind, 0).info; // même hauteur que la plante procédurale
    const k = info.h / M.hi[1];
    const verts = new Float32Array(n * 20);
    let r = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 20;
      const x = (M.lo[0] + qp[i * 3] / 65535 * (M.hi[0] - M.lo[0])) * k, y = qp[i * 3 + 1] / 65535 * M.hi[1] * k, z = (M.lo[2] + qp[i * 3 + 2] / 65535 * (M.hi[2] - M.lo[2])) * k;
      verts[o] = x; verts[o + 1] = y; verts[o + 2] = z;
      verts[o + 3] = qn[i * 4] / 127; verts[o + 4] = qn[i * 4 + 1] / 127; verts[o + 5] = qn[i * 4 + 2] / 127;
      verts[o + 6] = 1; verts[o + 7] = 1; verts[o + 8] = 1; verts[o + 9] = 15 / 15;
      verts[o + 10] = qt[i * 2] / 65535; verts[o + 11] = qt[i * 2 + 1] / 65535;
      r = Math.max(r, Math.hypot(x, z));
    }
    const mesh = G.uploadSkin(gl, { verts, idx: Uint32Array.from(idx), bounds: { x0: -r, y0: 0, z0: -r, x1: r, y1: info.h, z1: r } });
    mesh.info = info;
    const pm = { mesh, tex: null };
    if (M.tex) {
      const img = new Image();
      img.onload = () => {
        pm.tex = mesh.tex = G.texture(gl, img);
        // les forêts sont redessinées avec la nouvelle plante (une seule fois, groupé)
        clearTimeout(this._plantT);
        this._plantT = setTimeout(() => { this.world.markDirty(null); this._dirtyWorld = true; }, 400);
      };
      img.src = M.tex;
    }
    return pm;
  };

  /* ------------------------------------------------------------------
     Chargement progressif : un script par modèle (js/models/<id>.js),
     ajouté à la page à la demande. Fonctionne aussi depuis file://.
     ------------------------------------------------------------------ */
  R.requestModel = function (id, done) {
    if (DZ.MODELS && DZ.MODELS[id]) { if (done) done(); return true; }
    if (!DZ.MODEL_FILES || DZ.MODEL_FILES.indexOf(id) < 0) { if (done) done(); return false; }
    this._loading = this._loading || {};
    const L = this._loading[id];
    if (L) { if (done) L.push(done); return false; }
    const cbs = this._loading[id] = done ? [done] : [];
    const sc = document.createElement('script');
    sc.src = 'js/models/' + id + '.js';
    sc.onload = sc.onerror = () => {
      if (this.skinCache) this.skinCache.delete(id);
      cbs.forEach((f) => f());
    };
    document.head.appendChild(sc);
    return false;
  };
  /* Après le démarrage : visiteurs d'abord, puis espèces du parc, puis les autres. */
  R.preloadModels = function () {
    if (!DZ.MODEL_FILES) return;
    const present = new Set(this.game.dinos.map((d) => d.sp));
    const first = (id) => id.startsWith('t_') ? 2 : id.startsWith('v_') ? 1 : 0; // plantes, visiteurs, puis dinosaures
    const list = DZ.MODEL_FILES.slice().sort((a, b) => (first(b) - first(a)) || (present.has(b) - present.has(a)));
    const next = () => {
      const id = list.shift();
      if (!id) return;
      this.requestModel(id, () => setTimeout(next, 100));
    };
    next(); next(); next(); // trois téléchargements à la fois
  };
  /* Vignettes de la boutique : redessinées quand le modèle est prêt. */
  R.refreshThumbs = function (id) {
    const ui = DZ.app && DZ.app.ui;
    if (!ui || !ui.thumbs) return;
    for (const k of Object.keys(ui.thumbs)) if (k === 'd_' + id || k.startsWith('p_' + id)) delete ui.thumbs[k];
    if (ui.tab === 'dinos' && ui.buildItems) { clearTimeout(this._thT); this._thT = setTimeout(() => ui.buildItems(), 250); }
  };

  /* Texture blanche par défaut sur l'unité 2 (aucun conflit de type d'échantillonneur). */
  R.whiteTex = function () {
    if (this._white) return this._white;
    const gl = this.gl;
    this._white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return this._white;
  };
})();
