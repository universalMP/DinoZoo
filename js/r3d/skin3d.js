/* =====================================================================
   DinoZoo 3D — Modèles réalistes (générés avec Meshy) : outils communs,
   visiteurs, plantes et chargement progressif.
   Les dinosaures ont leur propre squelette : voir r3d/rigfit.js
   (ajustement) et r3d/skel3d.js (animation).
   ===================================================================== */
(function () {
  const G = DZ.G, M4 = G.m4;
  const R = G.Renderer3D.prototype;

  const dec = (b64, Ctor) => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Ctor(u8.buffer);
  };

  /* Pose de repos du pantin procédural : liste [maillage, matrice]. Sert à
     donner au modèle réaliste la même taille que le pantin. */
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
  // sortes de plantes réalistes : feuillage sur cartes (G.LEAVES, plus bas) ; l'arbre mort reste un modèle Meshy
  G.PLANTS = { araucaria: 'cartes', palmier: 'cartes', cycas: 'cartes', fougere: 'cartes', ginkgo: 'cartes', buisson: 'cartes', arbremort: 't_arbremort' };
  R.plantModel = function (kind) {
    const id = G.PLANTS[kind];
    if (!id || this.noModels) return null;
    this.plantCache = this.plantCache || new Map();
    if (this.plantCache.has(kind)) { const pm = this.plantCache.get(kind); return pm && pm.tex ? pm : null; }
    // feuillage réaliste sur cartes quand ses textures sont là, sinon le modèle Meshy
    const leaf = G.LEAVES[kind];
    if (leaf && DZ.MODEL_FILES && DZ.MODEL_FILES.indexOf(leaf) >= 0) {
      const L = DZ.MODELS && DZ.MODELS[leaf], B = DZ.MODELS && DZ.MODELS[G.BARK];
      if (!L || !B) { this.requestModel(leaf); this.requestModel(G.BARK); return null; }
      let pm = null;
      try { pm = this.buildCardPlant(kind, L, B); } catch (e) { console.warn('Feuillage ' + kind + ' ignoré :', e); }
      this.plantCache.set(kind, pm);
      return null;
    }
    const M = DZ.MODELS && DZ.MODELS[id];
    if (!M) { this.requestModel(id); return null; }
    let pm = null;
    try { pm = this.buildPlant(kind, M); } catch (e) { console.warn('Plante ' + kind + ' ignorée :', e); }
    this.plantCache.set(kind, pm);
    return null; // prête quand sa texture est chargée
  };

  /* ------------------------------------------------------------------
     Feuillage sur cartes : un tronc texturé d'écorce et des frondes,
     branches ou rameaux en bandes courbes, texturés d'une photo de
     feuillage (Meshy text-to-image) dont le fond blanc devient
     transparent. Une texture par sorte : feuillage à gauche (80 %),
     écorce à droite.
     ------------------------------------------------------------------ */
  G.LEAVES = { palmier: 'l_palmier', araucaria: 'l_araucaria', ginkgo: 'l_ginkgo', cycas: 'l_cycas', fougere: 'l_fougere', buisson: 'l_buisson' };
  G.BARK = 'l_ecorce';
  const LEAF_U = 0.8, BARK_U0 = 0.82, BARK_U1 = 0.99;
  R.buildCardPlant = function (kind, L, B) {
    const gl = this.gl, H = this.treeMesh(kind, 0).info.h;
    const V = [], I = [];
    const r = (DZ.util.rng)(97 + kind.length * 13);
    const vert = (p, n, u, v) => { V.push(p[0], p[1], p[2], n[0], n[1], n[2], 1, 1, 1, 1, u, v, 0, 0, 0, 0, 1, 0, 0, 0); return V.length / 20 - 1; };
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // tronc : cylindre effilé le long d'une courbe (points [x, y, z, rayon])
    const trunk = (pts) => {
      const seg = 7, base = V.length / 20;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const t = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]), a = norm(cross(t, [0, 0, 1])), b = cross(t, a);
        for (let k = 0; k <= seg; k++) {
          const ang = k / seg * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
          const nn = [a[0] * c + b[0] * sn, a[1] * c + b[1] * sn, a[2] * c + b[2] * sn];
          vert([p[0] + nn[0] * p[3], p[1] + nn[1] * p[3], p[2] + nn[2] * p[3]], nn, BARK_U0 + (BARK_U1 - BARK_U0) * k / seg, 1 - i / (pts.length - 1));
        }
      }
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < seg; k++) {
        const a0 = base + i * (seg + 1) + k, b0 = a0 + seg + 1;
        I.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    };
    // carte de feuillage : bande de la base vers la pointe, qui s'incurve (droop) ;
    // dir = direction de départ, side = axe de la largeur ; normale adoucie vers l'extérieur
    const card = (o, dir, side, len, wid, droop, segs, out) => {
      segs = segs || 5;
      const base = V.length / 20;
      let p = o.slice(), d = norm(dir);
      const up = norm(cross(side, d));
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w = wid * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI));
        // normale de « couronne » : vers l'extérieur et le ciel (éclairage doux et régulier du feuillage)
        const n = out ? norm([out[0], out[1] + 0.9, out[2]]) : norm([up[0] * 0.3, Math.abs(up[1]) + 1, up[2] * 0.3]);
        vert([p[0] - side[0] * w / 2, p[1] - side[1] * w / 2, p[2] - side[2] * w / 2], n, 0, 1 - t);
        vert([p[0] + side[0] * w / 2, p[1] + side[1] * w / 2, p[2] + side[2] * w / 2], n, LEAF_U, 1 - t);
        // la bande avance et s'abaisse peu à peu
        p = [p[0] + d[0] * len / segs, p[1] + d[1] * len / segs, p[2] + d[2] * len / segs];
        d = norm([d[0], d[1] - droop / segs, d[2]]);
      }
      for (let i = 0; i < segs; i++) { const a0 = base + i * 2; I.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    };
    const radial = (a, el) => [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
    const sideOf = (a) => [-Math.sin(a), 0, Math.cos(a)];
    if (kind === 'palmier') {
      const lean = r() * 0.12, top = [lean * H, H * 0.8, 0];
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([lean * H * t * t, H * 0.8 * t, 0, H * (0.034 - t * 0.012)]); }
      trunk(pts);
      for (let i = 0; i < 13; i++) {
        const a = i / 13 * Math.PI * 2 + r() * 0.3, el = (i % 2 ? 0.85 : 0.5) + r() * 0.25;
        card(top, radial(a, el), sideOf(a), H * (0.52 + r() * 0.1), H * 0.32, 2.4 + r() * 0.6, 7, radial(a, 0));
      }
    } else if (kind === 'araucaria') {
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, H * 0.98 * t, 0, H * (0.03 - t * 0.024)]); }
      trunk(pts);
      const levels = 8;
      for (let l = 0; l < levels; l++) {
        const t = l / (levels - 1), y = H * (0.32 + t * 0.62), n = 6 + (l % 2);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + l * 0.55 + r() * 0.2, len = H * (0.4 * (1 - t * 0.7) + 0.08), d = radial(a, 0.12 + t * 0.4);
          // chaque branche : une carte à plat et une carte de chant (volume vu de partout)
          card([0, y, 0], d, sideOf(a), len, H * 0.3, 0.6, 4, radial(a, 0));
          card([0, y, 0], d, norm(cross(d, sideOf(a))), len, H * 0.22, 0.6, 4, radial(a, 0));
        }
      }
      for (let i = 0; i < 3; i++) { const a = i * 2.1; card([0, H * 0.9, 0], radial(a, 1.25), sideOf(a), H * 0.16, H * 0.16, 0, 2, [0, 1, 0]); }
    } else if (kind === 'ginkgo') {
      trunk([[0, 0, 0, H * 0.04], [0.01 * H, H * 0.3, 0, H * 0.03], [0, H * 0.55, 0.01 * H, H * 0.018]]);
      for (let b = 0; b < 3; b++) { const a = b * 2.1; trunk([[0, H * 0.45, 0, H * 0.018], [Math.cos(a) * H * 0.14, H * 0.66, Math.sin(a) * H * 0.14, H * 0.008]]); }
      const c = [0, H * 0.7, 0];
      for (let i = 0; i < 42; i++) {
        const a = r() * Math.PI * 2, el = Math.asin(Math.min(1, r() * 1.3 - 0.35));
        const o = radial(a, el), p = [c[0] + o[0] * H * 0.17, c[1] + o[1] * H * 0.15, c[2] + o[2] * H * 0.17];
        card(p, norm([o[0], o[1] + 0.3, o[2]]), sideOf(a + r()), H * 0.34, H * 0.34, 0.3, 3, o);
      }
    } else if (kind === 'cycas') {
      trunk([[0, 0, 0, H * 0.085], [0, H * 0.16, 0, H * 0.08], [0, H * 0.3, 0, H * 0.06]]);
      for (let i = 0; i < 17; i++) {
        const a = i / 17 * Math.PI * 2 + r() * 0.25, el = 0.25 + (i % 3) * 0.25 + r() * 0.15;
        card([0, H * 0.3, 0], radial(a, el), sideOf(a), H * (0.62 + r() * 0.1), H * 0.27, 0.7, 5, radial(a, 0));
      }
    } else if (kind === 'fougere') {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + r() * 0.3, el = 0.75 + (i % 2) * 0.35 + r() * 0.15;
        card([0, 0.01, 0], radial(a, el), sideOf(a), H * (0.95 + r() * 0.2), H * 0.5, 1.3, 6, radial(a, 0));
      }
    } else if (kind === 'buisson') {
      const c = [0, H * 0.32, 0];
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2, el = Math.asin(Math.min(1, r() * 1.25 - 0.3));
        const o = radial(a, el), p = [c[0] + o[0] * H * 0.2, Math.max(0.02, c[1] + o[1] * H * 0.18), c[2] + o[2] * H * 0.2];
        card(p, norm([o[0], o[1] + 0.4, o[2]]), sideOf(a + r()), H * 0.5, H * 0.5, 0.4, 3, o);
      }
    }
    // matériau 15 (végétation texturée, balancée par le vent)
    for (let i = 0; i < V.length; i += 20) V[i + 9] = 15 / 15;
    const verts = Float32Array.from(V);
    let rr = 0, y1 = 0;
    for (let i = 0; i < verts.length; i += 20) { rr = Math.max(rr, Math.hypot(verts[i], verts[i + 2])); y1 = Math.max(y1, verts[i + 1]); }
    const mesh = G.uploadSkin(gl, { verts, idx: Uint32Array.from(I), bounds: { x0: -rr, y0: 0, z0: -rr, x1: rr, y1, z1: rr } });
    mesh.info = { h: H };
    const pm = { mesh, tex: null, tint: kind === 'fougere' || kind === 'ginkgo' ? [0.72, 0.76, 0.66] : [0.8, 0.84, 0.76] };
    // texture : feuillage détouré (fond blanc → transparent) et bande d'écorce
    const li = new Image(), bi = new Image();
    let left = 2;
    const done = () => {
      if (--left) return;
      const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g2 = cv.getContext('2d');
      g2.drawImage(li, 0, 0, Math.round(S * LEAF_U), S);
      g2.drawImage(bi, Math.round(S * (BARK_U0 - 0.01)), 0, S - Math.round(S * (BARK_U0 - 0.01)), S);
      const im = g2.getImageData(0, 0, Math.round(S * LEAF_U), S), d = im.data;
      let sr = 0, sg = 0, sb = 0, c = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lo = Math.min(d[i], d[i + 1], d[i + 2]), hi = Math.max(d[i], d[i + 1], d[i + 2]);
        // blanc ou gris très clair et peu coloré : fond
        const bg = Math.min(1, Math.max(0, (lo - 200) / 40)) * Math.min(1, Math.max(0, 1 - (hi - lo - 18) / 30));
        d[i + 3] = Math.round(255 * (1 - bg));
        if (bg < 0.3) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; c++; }
      }
      // le fond prend la couleur moyenne du feuillage (pas de liseré blanc au loin)
      if (c) for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 128) { d[i] = sr / c; d[i + 1] = sg / c; d[i + 2] = sb / c; }
      g2.putImageData(im, 0, 0);
      pm.tex = mesh.tex = G.texture(gl, cv);
      clearTimeout(this._plantT);
      this._plantT = setTimeout(() => { this.world.markDirty(null); this._dirtyWorld = true; }, 400);
    };
    li.onload = bi.onload = done;
    li.src = L.tex; bi.src = B.tex;
    return pm;
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
     Bâtiments et équipements réalistes : un modèle Meshy par type, posé
     dans son emprise (box = [x0, z0, x1, z1] en cases, face vers +Z).
     Les accessoires de chaque niveau d'amélioration (bacs à fleurs,
     lampadaires…) restent procéduraux : G.buildingExtras (models3d.js).
     yaw : quart de tour du modèle ; h : hauteur imposée (balançoires : la
     poutre doit porter les balançoires animées), uniform : sans tasser.
     ------------------------------------------------------------------ */
  G.PROPS = {
    entree: { id: 'p_entree', box: [0.05, 0.1, 2.95, 1.95] },
    boutique: { id: 'p_boutique', box: [0.15, 0.2, 1.85, 1.75] },
    restaurant: { id: 'p_restaurant', box: [0.05, 0.05, 2.95, 1.95] },
    toilettes: { id: 'p_toilettes', box: [0.1, 0.06, 1.9, 0.94], yaw: 2 },
    balancoires: { id: 'p_balancoires', box: [0.02, 0.02, 1.98, 1.98], h: () => DZ.PLAY.SWING.top + 0.06 }, // la poutre porte les balançoires animées
    toboggan: { id: 'p_toboggan', box: [0.02, 0.02, 1.98, 2.98], yaw: 1, h: 1.35, uniform: true },
    fauxdino: { id: 'p_fauxdino', box: [0.02, 0.02, 2.98, 2.98], h: 1.6, uniform: true },
    fontaine: { id: 'p_fontaine', box: [0.12, 0.12, 1.88, 1.88] }
  };
  R.propModel = function (type) {
    const P = G.PROPS[type];
    if (!P || this.noModels) return null;
    this.propCache = this.propCache || new Map();
    if (this.propCache.has(type)) { const pm = this.propCache.get(type); return pm && pm.tex ? pm : null; }
    const M = DZ.MODELS && DZ.MODELS[P.id];
    if (!M) { this.requestModel(P.id); return null; }
    let pm = null;
    try { pm = this.buildProp(type, P, M); } catch (e) { console.warn('Bâtiment ' + type + ' ignoré :', e); }
    this.propCache.set(type, pm);
    return null; // prêt quand sa texture est chargée
  };
  R.buildProp = function (type, P, M) {
    const gl = this.gl, n = M.n;
    const qp = dec(M.pos, Uint16Array), qn = dec(M.nor, Int8Array), qt = dec(M.uv, Uint16Array);
    const idx = M.wide ? dec(M.idx, Uint32Array) : dec(M.idx, Uint16Array);
    const yaw = (P.yaw || 0) * Math.PI / 2, c = Math.round(Math.cos(yaw)), sn = Math.round(Math.sin(yaw));
    // dimensions du modèle après le quart de tour
    const mw = M.hi[0] - M.lo[0], md = M.hi[2] - M.lo[2], w = sn ? md : mw, d = sn ? mw : md;
    const [x0, z0, x1, z1] = P.box;
    // ajusté à l'emprise ; h : hauteur imposée, en gardant les proportions (uniform) ou en tassant seulement
    let k = Math.min((x1 - x0) / w, (z1 - z0) / d), ky = k;
    const hT = typeof P.h === 'function' ? P.h() : P.h;
    if (hT && P.uniform) ky = k = Math.min(k, hT / M.hi[1]);
    else if (hT) ky = hT / M.hi[1];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const verts = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) {
      const o = i * 20;
      const mx = M.lo[0] + qp[i * 3] / 65535 * mw, my = qp[i * 3 + 1] / 65535 * M.hi[1], mz = M.lo[2] + qp[i * 3 + 2] / 65535 * md;
      verts[o] = cx + (mx * c + mz * sn) * k; verts[o + 1] = my * ky; verts[o + 2] = cz + (-mx * sn + mz * c) * k;
      const nx = qn[i * 4] / 127, ny = qn[i * 4 + 1] / 127, nz = qn[i * 4 + 2] / 127;
      verts[o + 3] = nx * c + nz * sn; verts[o + 4] = ny * k / ky; verts[o + 5] = -nx * sn + nz * c;
      const nl = Math.hypot(verts[o + 3], verts[o + 4], verts[o + 5]) || 1; verts[o + 3] /= nl; verts[o + 4] /= nl; verts[o + 5] /= nl;
      verts[o + 6] = 1; verts[o + 7] = 1; verts[o + 8] = 1; verts[o + 9] = 14 / 15;
      verts[o + 10] = qt[i * 2] / 65535; verts[o + 11] = qt[i * 2 + 1] / 65535;
    }
    const hgt = M.hi[1] * ky;
    const mesh = G.uploadSkin(gl, { verts, idx: Uint32Array.from(idx), bounds: { x0: cx - w * k / 2, y0: 0, z0: cz - d * k / 2, x1: cx + w * k / 2, y1: hgt, z1: cz + d * k / 2 } });
    const pm = { mesh, tex: null, h: hgt, w: w * k, d: d * k, cx, cz };
    if (M.tex) {
      const img = new Image();
      img.onload = () => {
        pm.tex = mesh.tex = G.texture(gl, img);
        this._dirtyStatic = true; this.ghostCache = {};
        const ui = DZ.app && DZ.app.ui;
        if (ui && ui.thumbs) { for (const key of Object.keys(ui.thumbs)) if (key === 'b_' + type) delete ui.thumbs[key]; if (ui.buildItems) { clearTimeout(this._thB); this._thB = setTimeout(() => ui.buildItems(), 250); } }
      };
      img.src = M.tex;
    }
    return pm;
  };
  /* Dessin des bâtiments réalistes posés (liste remplie par rebuildStatic). */
  R.drawProps = function (prog) {
    if (!this.props || !this.props.length) return;
    const gl = this.gl, u = prog.u;
    for (const [mesh, m] of this.props) {
      if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mesh.tex); }
      this.drawMesh(prog, mesh, m);
    }
    if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.whiteTex()); }
  };
  R.drawPropAt = function (prog, type, m) {
    const pm = this.propModel(type);
    if (!pm) return;
    const gl = this.gl, u = prog.u;
    if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, pm.tex); }
    this.drawMesh(prog, pm.mesh, m);
    if (u.uTex) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.whiteTex()); }
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
      if (this.skelCache) this.skelCache.delete(id);
      if (id.startsWith('p_')) { this._dirtyStatic = true; this.ghostCache = {}; } // bâtiment réaliste arrivé : on redessine
      if (id.startsWith('l_') || id.startsWith('t_')) { clearTimeout(this._plantT); this._plantT = setTimeout(() => { this.world.markDirty(null); this._dirtyWorld = true; }, 300); } // végétation : forêts reconstruites
      cbs.forEach((f) => f());
    };
    document.head.appendChild(sc);
    return false;
  };
  /* Après le démarrage : visiteurs d'abord, puis espèces du parc, puis les autres. */
  R.preloadModels = function () {
    if (!DZ.MODEL_FILES) return;
    const present = new Set(this.game.dinos.map((d) => d.sp));
    const first = (id) => id.startsWith('t_') || id.startsWith('l_') ? 3 : id.startsWith('p_') ? 2 : id.startsWith('v_') ? 1 : 0; // plantes, bâtiments, visiteurs, puis dinosaures
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
