/* =====================================================================
   DinoZoo 3D — Moteur de rendu WebGL 2.
   Caméra orbitale (glisser, rotation, zoom fluide vers le curseur),
   ombres du soleil (carte d'ombre filtrée), ciel et brouillard,
   cycle jour/nuit avec lampes, eau animée, instanciation (arbres,
   herbe, visiteurs), dinosaures articulés, particules, calque 2D
   (bulles d'humeur, pluie, éclairs, vignettage) et vignettes 3D.
   Même interface publique que le moteur 2D : l'interface et la
   logique de jeu ne changent pas.
   ===================================================================== */
(function () {
  const G = DZ.G, U = DZ.util, C = DZ.CONFIG, R = DZ.R, M4 = G.m4;
  const T = C.map.tile, W = C.map.w, H = C.map.h;
  const TAU = Math.PI * 2;
  const QUALITY = {
    high: { shadow: 2048, scale: 1.0, tufts: 6, jungle: 0.32, particles: 600, maxGroups: 'high', godRays: true },
    medium: { shadow: 1024, scale: 0.85, tufts: 3, jungle: 0.2, particles: 300, maxGroups: 'medium', godRays: false },
    low: { shadow: 0, scale: 0.7, tufts: 1, jungle: 0.1, particles: 120, maxGroups: 'low', godRays: false }
  };
  const SKIN = [[0.95, 0.79, 0.65], [0.88, 0.67, 0.52], [0.78, 0.54, 0.38], [0.6, 0.4, 0.27], [0.43, 0.27, 0.19], [0.96, 0.84, 0.74]];
  const SHIRT = ['#b8483a', '#3a6ea5', '#d9a83c', '#4f8a4b', '#e6e0d2', '#74508a', '#cf7438', '#2f4858', '#ad525d', '#86aac2', '#6b7a3a', '#d8c7a0'].map(G.rgb01);
  const PANTS = ['#3a4250', '#5a4a3a', '#2a2a2a', '#7a6a55', '#3f5f7a', '#c4b494', '#4a5a3a'].map(G.rgb01);
  const HAIR = ['#2a1a10', '#5a3a20', '#8a6a3a', '#c9a36a', '#1a1a1a', '#9a9a9a', '#6a2a18'].map(G.rgb01);

  G.webgl2Available = function () {
    try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
  };

  class Renderer3D {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL 2 indisponible');
      this.is3D = true;
      this.P = G.createPrograms(gl);
      // calque 2D par-dessus la scène
      this.overlay = document.createElement('canvas');
      this.overlay.id = 'overlay';
      canvas.parentNode.insertBefore(this.overlay, canvas.nextSibling);
      this.octx = this.overlay.getContext('2d');
      // atlas des enseignes
      this.atlas = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G.makeAtlas());
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      // ciel : triangle plein écran
      this.skyVao = gl.createVertexArray();
      gl.bindVertexArray(this.skyVao);
      const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      // particules
      this.ptVao = gl.createVertexArray();
      gl.bindVertexArray(this.ptVao);
      this.ptBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
      gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
      gl.bindVertexArray(null);
      this.ptData = new Float32Array(8 * 4096);

      this.world = new G.World3D(game);
      this.cam = { tx: C.map.entrance.tileX + 0.5, tz: H - 8, ty: 0.15, dist: 11, tdist: 11, yaw: 0, tyaw: 0, pitchOff: 0, anchor: null };
      this.cgpu = new Map();
      this.treeLod = {};
      this.time = 0;
      this.particles = [];
      this.ghost = null;
      this.selected = null;
      this.highlightEnclosures = null;
      this.quality = 'high';
      this.fps = 60;
      this.dpr = 1;
      this.vw = 1; this.vh = 1;
      this.shake = 0; this.flash = 0;
      this.rain = [];
      this.lights = [];
      this.smoke = [];
      this.fountains = [];
      this.dinoState = new Map();
      this.rigCache = {};
      this.treeMeshes = {};
      this.ghostCache = {};
      this._dirtyWorld = true;
      this._dirtyStatic = true;
      this.view = { x0: 0, y0: 0, x1: W * T, y1: H * T };
      this.mVP = M4.create(); this.mInvVP = M4.create(); this.mLight = M4.create(); this.mTmp = M4.create();
      this.eye = [0, 0, 0];

      const P = G.personMeshes();
      this.personBody = G.enableInstancing(gl, G.upload(gl, P.body));
      this.personLeg = G.enableInstancing(gl, G.upload(gl, P.leg));
      this.tuft = G.upload(gl, G.tuftMesh());
      this.quadMesh = G.upload(gl, (() => { const mb = new G.MB(); mb.material('plain').col([1, 1, 1]).face([0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]); return mb.finish(); })());
      this.ringMesh = G.upload(gl, (() => {
        const mb = new G.MB(); mb.material('plain').col([1, 0.93, 0.66]);
        const n = 40;
        for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; if (i % 2) continue; mb.face([Math.cos(a), 0, Math.sin(a)], [Math.cos(b), 0, Math.sin(b)], [Math.cos(b) * 0.88, 0, Math.sin(b) * 0.88], [Math.cos(a) * 0.88, 0, Math.sin(a) * 0.88]); }
        return mb.finish();
      })());

      game.on('mapChanged', (r) => { this.world.markDirty(r); this._dirtyWorld = true; });
      game.on('reset', () => { this.world.markDirty(null); this._dirtyWorld = true; this._dirtyStatic = true; this.dinoState.clear(); this.world.noise = null; this.world.ridge = null; });
      for (const ev of ['built', 'upgraded', 'moved']) game.on(ev, () => { this._dirtyStatic = true; });
      game.on('demolished', (e) => { if (e.building) this._dirtyStatic = true; });
      game.on('spend', (e) => this.coin(e.x, e.y, e.amount));
      game.on('built', (b) => this.burst3((b.x + b.w / 2), (b.y + b.h / 2), b.w * 0.5, 'build'));
      game.on('upgraded', (b) => this.burst3((b.x + b.w / 2), (b.y + b.h / 2), b.w * 0.6, 'sparkle'));
      game.on('demolished', (e) => this.burst3(e.x, e.y, 0.5, 'dust'));
      game.on('dinoAdded', (d) => this.burst3(d.x, d.y, 0.4, 'sparkle'));
      game.on('roar', (d) => { if ((d.sp === 'trex' || d.sp === 'spinosaurus') && this.cam.dist < 25 && Math.hypot(d.x - this.cam.tx, d.y - this.cam.tz) < this.cam.dist * 1.2) this.shake = Math.max(this.shake, d.sp === 'trex' ? 1 : 0.6); });
      game.on('splash', (d) => this.burst3(d.x, d.y, 0.3, 'splash'));
      game.on('escape', () => { this.shake = 1.2; });
    }

    /* ------------------------------------------------------------------
       Qualité, taille
       ------------------------------------------------------------------ */
    setQuality(q) {
      this.quality = q;
      this.Q = QUALITY[q];
      const gl = this.gl;
      if (this.shadow) { gl.deleteTexture(this.shadow.tex); gl.deleteFramebuffer(this.shadow.fb); this.shadow = null; }
      if (this.Q.shadow) this.shadow = G.shadowTarget(gl, this.Q.shadow);
      this.game.maxGroups = C.visitors.maxGroups[this.Q.maxGroups];
      this.world.markDirty(null); this._dirtyWorld = true; this._dirtyStatic = true;
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * (this.Q ? this.Q.scale : 1);
      this.dpr = dpr;
      const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      const odpr = Math.min(window.devicePixelRatio || 1, 2);
      this.overlay.width = Math.round(w * odpr); this.overlay.height = Math.round(h * odpr);
      this.odpr = odpr;
      this.vw = w; this.vh = h;
    }

    /* ------------------------------------------------------------------
       Caméra
       ------------------------------------------------------------------ */
    get pitch() {
      const c = this.cam;
      const t = U.clamp((c.dist - 2.2) / 55, 0, 1);
      return U.clamp(U.lerp(0.38, 1.12, Math.pow(t, 0.7)) + c.pitchOff, 0.18, 1.45);
    }
    updateMatrices() {
      const c = this.cam, gl = this.gl;
      const p = this.pitch;
      const sx = (Math.random() - 0.5) * 0.04 * this.shake, sy = (Math.random() - 0.5) * 0.03 * this.shake;
      const ty = c.ty;
      this.eye = [c.tx + Math.sin(c.yaw) * Math.cos(p) * c.dist + sx, ty + Math.sin(p) * c.dist + sy, c.tz + Math.cos(c.yaw) * Math.cos(p) * c.dist];
      const view = M4.lookAt(this.eye, [c.tx + sx, ty + sy, c.tz], [0, 1, 0], this.mTmp);
      this.fov = 0.72;
      const proj = M4.persp(this.fov, this.vw / this.vh, Math.max(0.05, c.dist * 0.02), Math.max(400, c.dist * 8));
      M4.mul(proj, view, this.mVP);
      M4.invert(this.mVP, this.mInvVP);
      void gl;
    }
    ray(sx, sy) {
      const x = sx / this.vw * 2 - 1, y = 1 - sy / this.vh * 2;
      const a = M4.apply(this.mInvVP, x, y, -1), b = M4.apply(this.mInvVP, x, y, 1);
      const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], e = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
      return { o, d: [e[0] - o[0], e[1] - o[1], e[2] - o[2]] };
    }
    /* Point du relief sous l'écran (marche le long du rayon puis affine). */
    groundAt(sx, sy, h) {
      if (h === undefined) return this.terrainHit(sx, sy);
      const r = this.ray(sx, sy);
      const y = h || 0;
      if (Math.abs(r.d[1]) < 1e-6) return null;
      const t = (y - r.o[1]) / r.d[1];
      if (t < 0) return null;
      return [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t];
    }
    terrainHit(sx, sy) {
      const r = this.ray(sx, sy);
      const len = Math.hypot(r.d[0], r.d[1], r.d[2]);
      const d = [r.d[0] / len, r.d[1] / len, r.d[2] / len];
      if (d[1] > -1e-4) return null;
      // départ au-dessus du plus haut sommet
      let t = Math.max(0, (11 - r.o[1]) / d[1]);
      const step = Math.max(0.08, this.cam.dist * 0.01);
      let prev = t, hit = null;
      for (let i = 0; i < 4000; i++) {
        const x = r.o[0] + d[0] * t, y = r.o[1] + d[1] * t, z = r.o[2] + d[2] * t;
        if (y < -3) break;
        if (y <= this.world.heightAt(x, z)) { hit = t; break; }
        prev = t; t += step;
      }
      if (hit === null) { const t0 = (0 - r.o[1]) / d[1]; return t0 > 0 ? [r.o[0] + d[0] * t0, r.o[2] + d[2] * t0] : null; }
      let a = prev, b = hit;
      for (let k = 0; k < 10; k++) { const m = (a + b) / 2; const y = r.o[1] + d[1] * m; if (y <= this.world.heightAt(r.o[0] + d[0] * m, r.o[2] + d[2] * m)) b = m; else a = m; }
      return [r.o[0] + d[0] * b, r.o[2] + d[2] * b];
    }
    project(x, y, z) {
      const p = M4.apply(this.mVP, x, y, z);
      if (p[3] <= 0.01) return null;
      return { x: (p[0] / p[3] * 0.5 + 0.5) * this.vw, y: (0.5 - p[1] / p[3] * 0.5) * this.vh, w: p[3] };
    }
    /* Interface compatible avec le moteur 2D (coordonnées « pixels monde ») */
    screenToWorld(sx, sy) {
      const g = this.groundAt(sx, sy) || [this.cam.tx, this.cam.tz];
      return { x: g[0] * T, y: g[1] * T };
    }
    worldToScreen(wx, wy) {
      const p = this.project(wx / T, this.world.heightAt(wx / T, wy / T), wy / T);
      return p || { x: -9999, y: -9999 };
    }
    pan(dx, dy) {
      const c = this.cam;
      const s = c.dist * 2 * Math.tan(this.fov / 2) / this.vh;
      const k = 1 / Math.max(0.45, Math.sin(this.pitch));
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      c.tx -= rx * dx * s; c.tz -= rz * dx * s;
      c.tx += fx * dy * s * k; c.tz += fz * dy * s * k;
      this.clampCam();
    }
    rotate(dx, dy) {
      const c = this.cam;
      c.yaw -= dx * 0.006; c.tyaw = c.yaw;
      c.pitchOff = U.clamp(c.pitchOff + dy * 0.004, -0.4, 0.4);
    }
    rotateBy(a) { this.cam.tyaw += a; }
    zoomAt(sx, sy, factor) {
      const c = this.cam;
      c.tdist = U.clamp(c.tdist / factor, C.camera.minDist3D, C.camera.maxDist3D);
      const g = this.groundAt(sx, sy);
      c.anchor = g ? { sx, sy, g } : null;
    }
    clampCam() {
      const c = this.cam;
      c.tx = U.clamp(c.tx, -2, W + 2); c.tz = U.clamp(c.tz, -2, H + 3);
    }
    focus(xpx, ypx) { this.cam.tx = xpx / T; this.cam.tz = ypx / T; this.clampCam(); }
    resetCamera() { Object.assign(this.cam, { tx: C.map.entrance.tileX + 0.5, tz: H - 8, dist: 11, tdist: 11, yaw: 0, tyaw: 0, pitchOff: 0, anchor: null }); this.particles.length = 0; }
    updateCam(dt) {
      const c = this.cam;
      if (Math.abs(c.dist - c.tdist) > 0.001) {
        c.dist += (c.tdist - c.dist) * Math.min(1, dt * 10);
        if (c.anchor) {
          this.updateMatrices();
          const g = this.groundAt(c.anchor.sx, c.anchor.sy, c.ty);
          const g0 = c.anchor.g0 || (c.anchor.g0 = c.anchor.g);
          if (g) { c.tx += g0[0] - g[0]; c.tz += g0[1] - g[1]; }
        }
      } else { c.dist = c.tdist; c.anchor = null; }
      if (Math.abs(c.yaw - c.tyaw) > 0.0005) c.yaw += (c.tyaw - c.yaw) * Math.min(1, dt * 8);
      this.clampCam();
      const gh = Math.max(0, this.world.heightAt(c.tx, c.tz));
      c.ty += (gh + 0.15 - c.ty) * Math.min(1, dt * 4);
    }
    isVisible(xpx, ypx, m) {
      const p = this.project(xpx / T, 0, ypx / T);
      const mm = m || 0;
      return !!p && p.x > -mm && p.y > -mm && p.x < this.vw + mm && p.y < this.vh + mm;
    }
    computeView() {
      const pts = [[0, 0], [this.vw, 0], [0, this.vh], [this.vw, this.vh]].map(([x, y]) => this.groundAt(x, y, this.cam.ty) || [this.cam.tx, this.cam.tz]);
      this.view = { x0: Math.min(...pts.map((p) => p[0])) * T, x1: Math.max(...pts.map((p) => p[0])) * T, y0: Math.min(...pts.map((p) => p[1])) * T, y1: Math.max(...pts.map((p) => p[1])) * T };
    }

    /* ------------------------------------------------------------------
       Construction de la scène statique
       ------------------------------------------------------------------ */
    /* Reconstruit les tronçons modifiés (les plus proches d'abord). */
    updateChunks(budget) {
      const gl = this.gl, w = this.world;
      const dirty = w.chunks.filter((c) => c.dirty);
      if (!dirty.length) { this._dirtyWorld = false; return; }
      if (!w.f || this._dirtyWorld) { w.computeFields(); for (const c of dirty) w.updateHeights(c); this._dirtyWorld = false; this._needHeights = false; }
      if (!this.far) { const f = w.buildFar(); this.far = { water: G.upload(gl, f.water), land: G.upload(gl, f.land) }; }
      const cx = this.cam.tx, cz = this.cam.tz;
      dirty.sort((a, b) => Math.hypot(a.x0 + 8 - cx, a.y0 + 8 - cz) - Math.hypot(b.x0 + 8 - cx, b.y0 + 8 - cz));
      for (const c of dirty.slice(0, budget)) this.buildChunk(c);
    }

    buildChunk(c) {
      const gl = this.gl, w = this.world, g = this.game;
      const old = this.cgpu.get(c);
      if (old) {
        for (const k of ['terrain', 'paths', 'water', 'deco']) G.free(gl, old[k]);
        if (old.tuft) { gl.deleteVertexArray(old.tuft.vao); gl.deleteBuffer(old.tuft.buf); }
        for (const tg of old.trees) { gl.deleteVertexArray(tg.vaoD); gl.deleteVertexArray(tg.vaoL); gl.deleteBuffer(tg.buf); }
      }
      const up = (d) => d ? G.upload(gl, d) : null;
      const data = { terrain: up(w.buildTerrain(c)), paths: up(w.buildPaths(c)), water: up(w.buildWater(c)), deco: up(w.buildDeco(c)), tuft: null, trees: [] };
      // touffes d'herbe
      const tufts = w.tufts(c, this.Q.tufts);
      if (tufts.length) {
        const arr = new Float32Array(tufts.length * G.INST_FLOATS), m = M4.create();
        tufts.forEach((t, i) => { M4.ident(m); M4.translate(m, t[0], t[1], t[2]); M4.rotY(m, t[4]); M4.scale(m, t[3], t[3] * (0.8 + t[5] * 0.4), t[3]); this.writeInst(arr, i, m, [t[5], t[5] * (0.95 + (i % 7) * 0.02), t[5] * 0.9, i * 0.37]); });
        const buf = G.instBuffer(gl, arr);
        data.tuft = { buf, vao: G.instVAO(gl, this.tuft, buf), count: tufts.length };
      }
      // arbres (naturels, hors carte, décoratifs, d'enclos)
      const extra = [];
      for (const id in g.buildings) {
        const b = g.buildings[id];
        if (b.x + b.w < c.x0 || b.x > c.x1 || b.y + b.h < c.y0 || b.y > c.y1) continue;
        if (b.type === 'arbre' || b.type === 'palmier' || b.type === 'fougere') extra.push([b.type === 'arbre' ? 'araucaria' : b.type, b.seed, b.x + 0.5, b.y + 0.55, 1.1]);
        else if (g.isEnclosure(b)) for (const d of G.enclosureDecor(b)) if (d.t === 'tree') extra.push([d.k, d.sd, d.x, d.z, d.sc]);
      }
      const groups = {};
      for (const t of w.chunkTrees(c, extra)) { const key = t[0] + (t[1] % 2); (groups[key] = groups[key] || { kind: t[0], v: t[1] % 2, list: [] }).list.push(t); }
      const m = M4.create();
      for (const key in groups) {
        const tg = groups[key];
        const det = this.treeMesh(tg.kind, tg.v);
        const lod = this.treeLodMesh(tg.kind, tg.v);
        const arr = new Float32Array(tg.list.length * G.INST_FLOATS);
        tg.list.forEach((t, i) => {
          const rot = (t[1] % 628) / 100;
          M4.ident(m); M4.translate(m, t[2], w.heightAt(t[2], t[3]), t[3]); M4.rotY(m, rot); M4.scale(m, t[4], t[4], t[4]);
          const v = 0.9 + U.hash(t[1], 3, 4) * 0.2;
          this.writeInst(arr, i, m, [v, v, v * 0.95, rot * 3]);
        });
        const buf = G.instBuffer(gl, arr);
        data.trees.push({ buf, vaoD: G.instVAO(gl, det, buf), vaoL: G.instVAO(gl, lod, buf), countD: det.count, countL: lod.count, n: tg.list.length });
      }
      c.cxw = (c.x0 + c.x1) / 2; c.czw = (c.y0 + c.y1) / 2;
      this.cgpu.set(c, data);
      c.dirty = false;
    }

    writeInst(data, i, m, tint, s1, s2, s3) {
      const o = i * G.INST_FLOATS;
      data.set(m, o);
      data[o + 16] = tint[0]; data[o + 17] = tint[1]; data[o + 18] = tint[2]; data[o + 19] = tint[3];
      if (s1) { data[o + 20] = s1[0]; data[o + 21] = s1[1]; data[o + 22] = s1[2]; }
      if (s2) { data[o + 23] = s2[0]; data[o + 24] = s2[1]; data[o + 25] = s2[2]; }
      if (s3) { data[o + 26] = s3[0]; data[o + 27] = s3[1]; data[o + 28] = s3[2]; }
    }

    treeMesh(kind, variant) {
      const key = kind + variant;
      if (!this.treeMeshes[key]) {
        const d = G.treeMesh(kind, variant);
        this.treeMeshes[key] = G.upload(this.gl, d);
        this.treeMeshes[key].info = d.info;
      }
      return this.treeMeshes[key];
    }
    treeLodMesh(kind, variant) {
      const key = kind + variant;
      if (!this.treeLod[key]) this.treeLod[key] = G.upload(this.gl, G.treeLodMesh(kind, this.treeMesh(kind, variant).info));
      return this.treeLod[key];
    }

    /* Bâtiments, clôtures et rochers d'enclos (posés à la hauteur du sol). */
    rebuildStatic() {
      const gl = this.gl, g = this.game, w = this.world;
      G.free(gl, this.static); G.free(gl, this.glass);
      const mb = new G.MB(), glass = new G.MB();
      this.lights = []; this.smoke = []; this.fountains = [];
      for (const id in g.buildings) {
        const b = g.buildings[id], def = C.buildings[b.type];
        const h = w.buildingHeight(b);
        if (def.cat === 'enclos') {
          mb.push().t(b.x, h, b.y);
          glass.push().t(b.x, h, b.y);
          const out = G.enclosureInto(mb, glass, b, w);
          glass.pop(); mb.pop();
          for (const l of out.lights) this.lights.push([l[0], l[1] + h, l[2], l[3]]);
          for (const d of G.enclosureDecor(b)) if (d.t === 'rock') G.rockInto(mb, d.x, w.heightAt(d.x, d.z), d.z, d.size, d.sd);
        } else if (b.type !== 'arbre' && b.type !== 'palmier' && b.type !== 'fougere') {
          mb.push().t(b.x, h, b.y);
          const out = G.buildingInto(mb, b);
          mb.pop();
          for (const l of out.lights) this.lights.push([b.x + l[0], l[1] + h, b.y + l[2], l[3]]);
          for (const s2 of out.smoke) this.smoke.push([b.x + s2[0], s2[1] + h, b.y + s2[2]]);
          if (out.fountain) this.fountains.push([b.x + out.fountain[0], out.fountain[1] + h, b.y + out.fountain[2]]);
        }
      }
      this.static = mb.empty ? null : G.upload(gl, mb.finish());
      this.glass = glass.empty ? null : G.upload(gl, glass.finish());
      this._dirtyStatic = false;
    }

    rig(id) {
      if (this.rigCache[id]) return this.rigCache[id];
      const gl = this.gl, raw = G.buildDinoRig(id);
      const up = (d) => d ? G.upload(gl, d) : null;
      const r = Object.assign({}, raw);
      if (raw.plan === 'ptero') { r.body = up(raw.body); r.head = up(raw.head); r.wing = up(raw.wing); }
      else if (raw.plan === 'plesio' || raw.plan === 'mosa') {
        r.body = up(raw.body); r.head = up(raw.head); r.flipF = up(raw.flipF); r.flipB = up(raw.flipB);
        if (raw.neck) r.neck = raw.neck.map((n) => ({ mesh: up(n.mesh), len: n.len }));
        if (raw.segs) r.segs = raw.segs.map((n) => ({ mesh: up(n.mesh), len: n.len }));
      } else {
        r.body = up(raw.parts.body);
        r.tail = raw.tail.map((n) => ({ mesh: up(n.mesh), len: n.len }));
        r.neck = raw.neck.map((n) => ({ mesh: up(n.mesh), len: n.len }));
        r.head = { mesh: up(raw.head.mesh), jaw: up(raw.head.jaw), hinge: raw.head.hinge, eye: raw.head.eye };
        r.legs = raw.legs.map((l) => Object.assign({}, l, { thigh: up(l.thigh), shin: up(l.shin), foot: up(l.foot) }));
        if (raw.arm) r.arm = Object.assign({}, raw.arm, { mesh: up(raw.arm.mesh) });
      }
      this.rigCache[id] = r;
      return r;
    }

    /* ------------------------------------------------------------------
       Poses des dinosaures → liste [maillage, matrice]
       ------------------------------------------------------------------ */
    dinoPose(d, t, out, dt) {
      const sp = DZ.SPECIES[d.sp];
      const rig = this.rig(d.sp);
      // cap lissé
      let st = this.dinoState.get(d.id);
      if (!st) { st = { heading: d.face > 0 ? 0 : Math.PI, foot: false }; this.dinoState.set(d.id, st); }
      let target;
      if (sp.habitat !== 'land') target = d.heading;
      else if (d.moving > 0) target = Math.atan2(d.gy - d.y, d.gx - d.x);
      else target = Math.abs(Math.cos(st.heading)) > 0.2 && Math.sign(Math.cos(st.heading)) !== d.face ? (d.face > 0 ? 0 : Math.PI) : st.heading;
      let diff = target - st.heading;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      st.heading += U.clamp(diff, -3 * dt, 3 * dt);
      const x = d.x, z = d.y;
      const gy = this.world.heightAt(x, z);
      const root = M4.create();
      const seedT = t + d.id * 3.1;
      if (sp.habitat === 'air') {
        const alt = 0.75 + (d.alt - 18) / 22 * 0.55;
        M4.translate(root, x, gy + alt, z); M4.rotY(root, -st.heading);
        const flap = d.phase ? Math.sin(d.phase) * 0.55 : 0.05;
        out.push([rig.body, root]);
        const hd = M4.copy(root); M4.translate(hd, rig.bl * 0.45, 0, 0); M4.rotY(hd, Math.sin(t * 0.8 + d.id) * 0.25); out.push([rig.head, hd]);
        const w1 = M4.copy(root); M4.rotX(w1, -flap); out.push([rig.wing, w1]);
        const w2 = M4.copy(root); M4.scale(w2, 1, 1, -1); M4.rotX(w2, -flap); out.push([rig.wing, w2]);
        return { x, y: gy + alt, z, r: rig.span * 0.6, h: 0.2, shadowY: gy };
      }
      if (sp.habitat === 'water') {
        const y = G.WATER_Y - 0.13 + d.surf * 0.14;
        M4.translate(root, x, y, z); M4.rotY(root, -st.heading);
        const ph = d.phase || 0;
        if (rig.plan === 'plesio') {
          out.push([rig.body, root]);
          const fa = Math.sin(ph * 1.2) * 0.5;
          for (const s of [-1, 1]) {
            const f1 = M4.copy(root); M4.translate(f1, rig.bl * 0.15, 0, s * 0.06); if (s > 0) M4.scale(f1, 1, 1, -1); M4.rotY(f1, 0.4); M4.rotX(f1, fa); out.push([rig.flipF, f1]);
            const f2 = M4.copy(root); M4.translate(f2, -rig.bl * 0.3, 0, s * 0.05); if (s > 0) M4.scale(f2, 1, 1, -1); M4.rotY(f2, 0.6); M4.rotX(f2, fa * 0.8); out.push([rig.flipB, f2]);
          }
          const n = M4.copy(root); M4.translate(n, rig.bl * 0.5, 0.01, 0);
          for (let i = 0; i < rig.neck.length; i++) { M4.rotY(n, Math.sin(ph * 0.8 - i * 0.9) * 0.22); M4.rotZ(n, 0.08 + d.surf * 0.15); out.push([rig.neck[i].mesh, M4.copy(n)]); M4.translate(n, rig.neck[i].len, 0, 0); }
          out.push([rig.head, n]);
        } else {
          out.push([rig.head, root]);
          let m = M4.copy(root);
          for (let i = 0; i < rig.segs.length; i++) {
            M4.rotY(m, Math.sin(ph * 1.3 - i * 0.9) * 0.16 * (i + 1) * 0.5);
            out.push([rig.segs[i].mesh, M4.copy(m)]);
            if (i === 0) for (const s of [-1, 1]) { const f = M4.copy(m); M4.translate(f, -0.05, -0.01, s * 0.05); if (s > 0) M4.scale(f, 1, 1, -1); M4.rotY(f, 0.7); M4.rotX(f, Math.sin(ph * 1.3) * 0.3); out.push([rig.flipF, f]); }
            if (i === 1) for (const s of [-1, 1]) { const f = M4.copy(m); M4.translate(f, -0.05, -0.01, s * 0.04); if (s > 0) M4.scale(f, 1, 1, -1); M4.rotY(f, 0.8); M4.rotX(f, Math.sin(ph * 1.3) * 0.3); out.push([rig.flipB, f]); }
            M4.translate(m, -rig.segs[i].len, 0, 0);
          }
        }
        return { x, y, z, r: rig.len * 0.5, h: 0.1, underwater: true };
      }
      // --- terrestres ---
      const moving = d.moving > 0;
      const phase = d.phase || 0;
      const state = d.state || 'idle';
      const rest = state === 'rest';
      const bob = moving ? -Math.abs(Math.sin(phase)) * (rig.quad ? 0.012 : 0.03) : Math.sin(seedT * 1.7) * 0.004;
      M4.translate(root, x, gy, z); M4.rotY(root, -st.heading);
      const hip = M4.copy(root);
      M4.translate(hip, 0, rig.hipH + bob - (rest ? rig.hipH * 0.2 : 0), 0);
      if (moving) M4.rotZ(hip, Math.sin(phase * 2) * 0.012);
      const body = M4.copy(hip); M4.scale(body, 1, 1 + Math.sin(seedT * 1.7) * 0.012, 1 + Math.sin(seedT * 1.7) * 0.008);
      out.push([rig.body, body]);
      // queue
      let m = M4.copy(hip); M4.translate(m, rig.tailBase[0], rig.tailBase[1], 0);
      M4.rotZ(m, rig.tailAng - (rest ? 0.1 : 0));
      for (let i = 0; i < rig.tail.length; i++) {
        M4.rotY(m, Math.sin(seedT * (moving ? 2.4 : 1.1) - i * 0.8) * (moving ? 0.1 : 0.07) * (1 + i * 0.3));
        M4.rotZ(m, Math.sin(seedT * 0.9 - i * 0.7) * 0.03);
        out.push([rig.tail[i].mesh, M4.copy(m)]);
        M4.translate(m, -rig.tail[i].len, 0, 0);
      }
      // cou et tête
      let na = rig.neckAng + Math.sin(seedT * 0.7) * 0.04, hr = rig.headRel + Math.sin(seedT * 0.5 + 1) * 0.06, look = 0, jaw = 0;
      if (state === 'eat') { const k = Math.min(1, d.anim * 1.5); const browse = d.sp === 'brachiosaurus'; na -= (browse ? -0.2 : 0.7) * k; hr -= (browse ? -0.3 : 0.35) * k; jaw = Math.max(0, Math.sin(d.anim * 9)) * 0.18 * k; }
      else if (state === 'roar') { const k = Math.sin(Math.min(1, d.anim / 1.8) * Math.PI); na += 0.25 * k; hr += 0.35 * k; jaw = 0.55 * k; }
      else if (rest) { na -= 0.35; hr -= 0.15; }
      else if (!moving) look = Math.sin(seedT * 0.31) * 0.5;
      m = M4.copy(hip); M4.translate(m, rig.shoulder[0], rig.shoulder[1], 0); M4.rotZ(m, na);
      for (let i = 0; i < rig.neck.length; i++) {
        if (i > 0) { M4.rotZ(m, (rig.neck.length > 1 ? Math.sign(rig.headRel) * 0.06 * (state === 'eat' && d.sp !== 'brachiosaurus' ? 1.5 : 0.4) : 0)); M4.rotY(m, look * 0.25); }
        out.push([rig.neck[i].mesh, M4.copy(m)]);
        M4.translate(m, rig.neck[i].len, 0, 0);
      }
      M4.rotY(m, look * (rig.neck.length > 1 ? 0.4 : 0.8)); M4.rotZ(m, hr);
      out.push([rig.head.mesh, M4.copy(m)]);
      const jm = M4.copy(m); M4.translate(jm, rig.head.hinge[0], rig.head.hinge[1], 0); M4.rotZ(jm, -jaw); out.push([rig.head.jaw, jm]);
      const headPos = M4.apply(m, 0.05, 0.05, 0);
      // pattes
      const amp = rig.quad ? 0.32 : 0.48;
      for (const leg of rig.legs) for (const side of [-1, 1]) {
        const off = rig.quad ? ((leg.front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) : (side > 0 ? Math.PI : 0);
        const psi = phase + off;
        let a = leg.a + (moving ? Math.sin(psi) * amp : side * 0.06);
        let s = leg.s - (moving ? Math.max(0, Math.sin(psi + 1.4)) * amp * 1.3 : 0) * (leg.front ? -0.6 : 1);
        if (rest) { a += leg.front ? 0.15 : 0.55; s -= leg.front ? 0.3 : 1.1; }
        const lm = M4.copy(hip); M4.translate(lm, leg.at[0], leg.at[1], side * leg.side); M4.rotZ(lm, a);
        out.push([leg.thigh, M4.copy(lm)]);
        M4.translate(lm, 0, -leg.l1, 0); M4.rotZ(lm, s);
        out.push([leg.shin, M4.copy(lm)]);
        M4.translate(lm, 0, -leg.l2, 0); M4.rotZ(lm, -(a + s) - (moving ? Math.max(0, Math.sin(psi + 1.4)) * 0.25 : 0));
        out.push([leg.foot, lm]);
        if (moving && side > 0 && C.dinos[d.sp].space >= 4) {
          const f = Math.sin(psi) > 0;
          if (st.foot !== f) { st.foot = f; if (this.onFoot && C.dinos[d.sp].space >= 4) this.onFoot(x, gy, z, Math.sqrt(C.dinos[d.sp].space) * 0.9); if (Math.random() < 0.7) this.addP({ k: 'dust', x: x + (Math.random() - 0.5) * 0.2, y: gy + 0.02, z: z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.2, vy: 0.05, vz: (Math.random() - 0.5) * 0.2, life: 0, max: 1.1, s: 0.18 + C.dinos[d.sp].space * 0.02 }); }
        }
      }
      if (rig.arm) for (const side of [-1, 1]) {
        const am = M4.copy(hip); M4.translate(am, rig.arm.at[0], rig.arm.at[1], side * rig.arm.side); M4.rotZ(am, -0.2 - Math.sin(seedT * 1.3 + side) * 0.1 - (state === 'roar' ? 0.4 : 0));
        out.push([rig.arm.mesh, am]);
      }
      if (state === 'roar' && d.anim < 0.3 && C.dinos[d.sp].space >= 5 && Math.random() < 0.3) this.burst3(x, z, 0.3, 'dust');
      return { x, y: gy, z, r: rig.len * 0.5, h: rig.height, head: headPos };
    }

    /* ------------------------------------------------------------------
       Particules
       ------------------------------------------------------------------ */
    addP(p) {
      const max = this.Q ? this.Q.particles : 300;
      if (this.particles.length >= max) this.particles.shift();
      this.particles.push(p);
    }
    coin(x, z, amount) {
      if (this.cam.dist > 30 || Math.hypot(x - this.cam.tx, z - this.cam.tz) > this.cam.dist * 1.4) return;
      this.addP({ k: 'coin', x, y: this.world.heightAt(x, z) + 0.45, z, vx: 0, vy: 0.35, vz: 0, life: 0, max: 1.4, s: 0.09, text: amount >= 1 ? '+' + U.fmt(amount) : '' });
    }
    burst(xpx, ypx, rad, kind) { this.burst3(xpx / T, ypx / T, rad / T, kind); }
    burst3(x, z, rad, kind) {
      const gy = this.world.heightAt(x, z);
      const n = kind === 'sparkle' ? 26 : kind === 'build' ? 20 : kind === 'splash' ? 16 : 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 0.3 + Math.random() * 0.8;
        if (kind === 'sparkle') this.addP({ k: 'spark', x: x + Math.cos(a) * rad * Math.random(), y: gy + 0.2 + Math.random() * 0.4, z: z + Math.sin(a) * rad * Math.random(), vx: Math.cos(a) * 0.2, vy: 0.5 + Math.random() * 0.6, vz: Math.sin(a) * 0.2, life: 0, max: 0.8 + Math.random() * 0.8, s: 0.06 + Math.random() * 0.05 });
        else if (kind === 'splash') this.addP({ k: 'drop', x, y: G.WATER_Y + 0.02, z, vx: Math.cos(a) * sp * 0.6, vy: 0.8 + Math.random() * 0.7, vz: Math.sin(a) * sp * 0.6, life: 0, max: 1.2, s: 0.03 });
        else this.addP({ k: 'dust', x: x + Math.cos(a) * rad * Math.random(), y: gy + 0.05, z: z + Math.sin(a) * rad * Math.random(), vx: Math.cos(a) * sp * 0.3, vy: 0.08, vz: Math.sin(a) * sp * 0.3, life: 0, max: 0.9 + Math.random() * 0.6, s: 0.2 + Math.random() * 0.2 });
      }
      if (kind === 'build') this.burst3(x, z, rad, 'sparkle');
    }
    updateParticles(dt, hour) {
      const ps = this.particles, g = this.game;
      const wind = 0.15 + g.stormIntensity() * 0.8;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        if (p.k === 'drop' || p.k === 'jet') { p.vy -= 3.2 * dt; if (p.y < G.WATER_Y && p.k === 'drop') p.life = p.max; }
        else if (p.k === 'spark') p.vy -= 0.8 * dt;
        else if (p.k === 'dust') { p.vx *= 0.95; p.vz *= 0.95; p.vy *= 0.97; }
        else if (p.k === 'smoke') { p.vx = wind * 0.6; p.s += dt * 0.12; }
        else if (p.k === 'leaf') { p.vx = wind + Math.sin(p.life * 2 + p.ph) * 0.15; p.vy = p.y > p.ground ? -0.25 : 0; if (p.y <= p.ground) { p.vx = 0; p.vz = 0; } }
        else if (p.k === 'fly' || p.k === 'firefly') { p.ph += dt * 3; p.vx = Math.cos(p.ph * 0.7 + p.seed) * 0.3; p.vz = Math.sin(p.ph * 0.9) * 0.25; p.vy = Math.sin(p.ph * 1.3) * 0.1; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      // émetteurs
      for (const s of this.smoke) if (Math.random() < dt * 3) this.addP({ k: 'smoke', x: s[0], y: s[1], z: s[2], vx: 0, vy: 0.25, vz: 0, life: 0, max: 3, s: 0.12 });
      for (const f of this.fountains) for (let i = 0; i < 2; i++) if (Math.random() < 0.8) { const a = Math.random() * TAU; this.addP({ k: 'jet', x: f[0], y: f[1], z: f[2], vx: Math.cos(a) * 0.18, vy: 0.75 + Math.random() * 0.15, vz: Math.sin(a) * 0.18, life: 0, max: 0.9, s: 0.03 }); }
      // ambiance
      const night = this.nightFactor(hour);
      const area = Math.min(4, this.cam.dist / 8);
      if (Math.random() < dt * 1.2 * area && g.trees.length) {
        const tr = g.trees[(Math.random() * g.trees.length) | 0];
        if (g.hasTree(tr) && Math.hypot(tr.x - this.cam.tx, tr.y - this.cam.tz) < this.cam.dist * 1.2) { const gy = this.world.heightAt(tr.x, tr.y); this.addP({ k: 'leaf', x: tr.x + (Math.random() - 0.5) * 0.6, y: gy + 0.9 + Math.random() * 0.5, z: tr.y + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0, vz: 0, ground: gy + 0.01, ph: Math.random() * 6, life: 0, max: 7, s: 0.05, col: U.pick(Math.random, [[0.54, 0.6, 0.23], [0.69, 0.58, 0.23], [0.42, 0.54, 0.2]]) }); }
      }
      if (Math.random() < dt * 0.8 * area && !g.isStorming()) {
        const x = this.cam.tx + (Math.random() - 0.5) * this.cam.dist * 1.5, z = this.cam.tz + (Math.random() - 0.5) * this.cam.dist;
        const gy = this.world.heightAt(x, z);
        if (night > 0.5) this.addP({ k: 'firefly', x, y: gy + 0.3 + Math.random() * 0.4, z, vx: 0, vy: 0, vz: 0, life: 0, max: 6, ph: Math.random() * 6, seed: Math.random() * 6, s: 0.08 });
        else this.addP({ k: 'fly', x, y: gy + 0.25 + Math.random() * 0.4, z, vx: 0, vy: 0, vz: 0, life: 0, max: 7, ph: Math.random() * 6, seed: Math.random() * 6, s: 0.05, col: U.pick(Math.random, [[0.91, 0.75, 0.38], [0.94, 0.94, 0.88], [0.82, 0.48, 0.23], [0.48, 0.63, 0.82]]) });
      }
    }

    /* ------------------------------------------------------------------
       Lumière
       ------------------------------------------------------------------ */
    nightFactor(h) {
      if (h >= 18.6) return U.smooth(U.clamp((h - 18.6) / 1.8, 0, 1));
      if (h < 7.2) return U.smooth(U.clamp((7.2 - h) / 1.4, 0, 1));
      return 0;
    }
    lighting(hour) {
      const storm = this.game.stormIntensity();
      const night = this.nightFactor(hour);
      const L = DZ.lightAt(hour);
      const m = L.mul.map((v) => v / 255);
      const u = U.clamp((hour - 6) / 13.5, 0, 1);
      const az = Math.PI * u;
      const el = Math.max(0.12, Math.sin(Math.PI * u) * 1.0);
      let dir = [Math.cos(az) * Math.cos(el), Math.sin(el), 0.45 + Math.sin(az) * 0.35];
      if (night > 0.5) dir = [-0.3, 0.8, 0.4]; // la lune
      const l = Math.hypot(...dir); dir = dir.map((v) => v / l);
      const dim = (1 - night * 0.82) * (1 - storm * 0.55);
      const warm = U.mixRgb([1.25, 1.08, 0.85], [1.15, 1.1, 1.02], Math.sin(Math.PI * u));
      const sunCol = [m[0] * warm[0] * dim, m[1] * warm[1] * dim, m[2] * warm[2] * dim];
      const add = L.add.map((v) => v / 255 * L.a);
      const skyCol = [m[0] * 0.5 + add[0] * 0.6 + night * 0.04, m[1] * 0.55 + add[1] * 0.6 + night * 0.06, m[2] * 0.66 + add[2] * 0.6 + night * 0.12].map((v) => v * (1 - storm * 0.3));
      const groundCol = [m[0] * 0.26, m[1] * 0.24, m[2] * 0.18];
      const horizon = U.mixRgb([m[0] * 0.92 + add[0], m[1] * 0.9 + add[1], m[2] * 0.95 + add[2]], [0.55, 0.58, 0.62], storm * 0.6);
      const zenith = U.mixRgb([m[0] * 0.45, m[1] * 0.62, m[2] * 0.95], [0.35, 0.38, 0.44], storm * 0.6);
      if (this.flash > 0) for (const c of [sunCol, skyCol]) for (let k = 0; k < 3; k++) c[k] += this.flash * 0.8;
      return { dir, sunCol, skyCol, groundCol, fog: horizon, horizon, zenith, night, storm, lamp: Math.max(night, storm * 0.6) };
    }

    setCommon(prog, Lt, vp) {
      const gl = this.gl, u = prog.u;
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(u.uVP, false, vp || this.mVP);
      if (u.uLightVP) gl.uniformMatrix4fv(u.uLightVP, false, this.mLight);
      if (u.uSunDir) gl.uniform3fv(u.uSunDir, Lt.dir);
      if (u.uSunCol) gl.uniform3fv(u.uSunCol, Lt.sunCol);
      if (u.uSkyCol) gl.uniform3fv(u.uSkyCol, Lt.skyCol);
      if (u.uGroundCol) gl.uniform3fv(u.uGroundCol, Lt.groundCol);
      if (u.uFogCol) gl.uniform3fv(u.uFogCol, Lt.fog);
      if (u.uFog) gl.uniform2f(u.uFog, Lt.fogNear, Lt.fogFar);
      if (u.uCam) gl.uniform3fv(u.uCam, Lt.cam || this.eye);
      if (u.uTime) gl.uniform1f(u.uTime, this.time);
      if (u.uWind) gl.uniform1f(u.uWind, 1 + this.game.stormIntensity() * 3);
      if (u.uNight) gl.uniform1f(u.uNight, Lt.lamp);
      if (u.uShadowOn !== undefined && u.uShadowOn) gl.uniform1f(u.uShadowOn, this.shadow && !Lt.noShadow ? 1 : 0);
      if (u.uShadow) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadow && !Lt.noShadow ? this.shadow.tex : this.dummyDepth()); gl.uniform1i(u.uShadow, 0); }
      if (u.uAtlas) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(u.uAtlas, 1); }
      if (u.uShadowTexel && this.shadow) gl.uniform2f(u.uShadowTexel, 1 / this.shadow.size, 1 / this.shadow.size);
      if (u.uLightCol) gl.uniform3f(u.uLightCol, 1.0, 0.72, 0.42);
      if (u.uNumLights !== undefined && u.uNumLights) {
        gl.uniform1i(u.uNumLights, Lt.lamp > 0.05 && !Lt.noLights ? this.activeLights.length : 0);
        if (this.activeLights.length) gl.uniform4fv(u.uLights, this.lightArr);
      }
      if (u.uAlpha) gl.uniform1f(u.uAlpha, 1);
      if (u.uTintAmt) gl.uniform1f(u.uTintAmt, 0);
      if (u.uUnlit) gl.uniform1f(u.uUnlit, 0);
      if (u.uModel) gl.uniformMatrix4fv(u.uModel, false, this.ident || (this.ident = M4.create()));
    }
    dummyDepth() {
      if (this._dummy) return this._dummy;
      const gl = this.gl;
      this._dummy = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._dummy);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, new Uint32Array([0xffffff00]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return this._dummy;
    }

    drawMesh(prog, mesh, model) {
      if (!mesh) return;
      const gl = this.gl;
      gl.uniformMatrix4fv(prog.u.uModel, false, model || this.ident);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    drawInst(prog, mesh) {
      if (!mesh || !mesh.instCount) return;
      const gl = this.gl;
      gl.uniformMatrix4fv(prog.u.uModel, false, this.ident);
      gl.bindVertexArray(mesh.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0, mesh.instCount);
    }

    /* Instances des visiteurs pour l'image courante. */
    buildPeople(t) {
      const g = this.game, gl = this.gl;
      let n = 0;
      for (const grp of g.visitors) if (!grp.hidden) n += grp.members.length;
      if (!this.pBody || this.pBody.length < n * G.INST_FLOATS) { this.pBody = new Float32Array(Math.max(64, n * 1.5) * G.INST_FLOATS | 0); this.pLeg = new Float32Array(this.pBody.length * 2); }
      const m = M4.create(), lm = M4.create();
      let bi = 0, li = 0;
      const vr = this.cam.dist * 1.8 + 6;
      for (const grp of g.visitors) {
        if (grp.hidden) continue;
        if (Math.abs(grp.x - this.cam.tx) > vr || Math.abs(grp.y - this.cam.tz) > vr) continue;
        const moving = grp.state === 'walk' || grp.state === 'wander' || grp.state === 'enter' || grp.state === 'exit';
        const px = -grp.dirY, pz = grp.dirX;
        const nm = grp.members.length;
        const ang = Math.atan2(grp.dirX, grp.dirY);
        for (let i = 0; i < nm; i++) {
          const mem = grp.members[i];
          const off = (i - (nm - 1) / 2) * 0.15;
          const x = grp.x + px * off - (mem.child ? grp.dirX * 0.05 : 0), z = grp.y + pz * off - (mem.child ? grp.dirY * 0.05 : 0);
          const gy = this.world.heightAt(x, z) + 0.03;
          const v = mem.v;
          const sc = mem.child ? 0.68 : 0.92 + (v % 17) / 17 * 0.18;
          const ph = grp.wd * 9 + mem.ph;
          const bob = moving ? Math.abs(Math.sin(ph)) * 0.01 * sc : 0;
          M4.ident(m); M4.translate(m, x, gy + bob, z); M4.rotY(m, ang); M4.scale(m, sc, sc, sc);
          const skin = SKIN[v % SKIN.length], shirt = SHIRT[(v >> 2) % SHIRT.length], pants = PANTS[(v >> 4) % PANTS.length], hair = HAIR[(v >> 5) % HAIR.length];
          this.writeInst(this.pBody, bi++, m, [hair[0], hair[1], hair[2], 0], shirt, pants, skin);
          for (const s of [-1, 1]) {
            M4.copy(m, lm); M4.translate(lm, s * 0.025, 0.15, 0); M4.rotX(lm, moving ? Math.sin(ph) * 0.55 * s : 0);
            this.writeInst(this.pLeg, li++, lm, [1, 1, 1, 0], shirt, pants, skin);
          }
        }
      }
      G.setInstances(gl, this.personBody, this.pBody, bi);
      G.setInstances(gl, this.personLeg, this.pLeg, li);
    }

    /* ------------------------------------------------------------------
       Image
       ------------------------------------------------------------------ */
    frame(dt) {
      const gl = this.gl, g = this.game;
      if (!g.s) return;
      this.time += dt;
      const t = this.time;
      this.updateChunks(this._booted ? 4 : 10000);
      this._booted = true;
      if (this._dirtyStatic) this.rebuildStatic();
      this.updateCam(dt);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
      this.updateMatrices();
      this.computeView();
      const hour = g.s.hour;
      const Lt = this.lighting(hour);
      Lt.fogNear = this.cam.dist * 1.6 + 4; Lt.fogFar = this.cam.dist * 4.5 + 30;
      // lampes les plus proches
      const ax = this.cam.tx, az = this.cam.tz;
      this.activeLights = Lt.lamp > 0.05 ? this.lights.slice().sort((a, b) => Math.hypot(a[0] - ax, a[2] - az) - Math.hypot(b[0] - ax, b[2] - az)).slice(0, 16) : [];
      this.lightArr = new Float32Array(64);
      this.activeLights.forEach((l, i) => this.lightArr.set([l[0], l[1], l[2], l[3]], i * 4));
      // poses
      const speed = g.speed || 0;
      const poses = [], parts = [];
      for (const d of g.dinos) {
        if (Math.abs(d.x - ax) > this.cam.dist * 2 + 8 || Math.abs(d.y - az) > this.cam.dist * 2 + 8) continue;
        const info = this.dinoPose(d, speed ? t : t * 0.0 + (this._frozenT || (this._frozenT = t)), parts, dt * (speed || 0.2));
        info.d = d;
        poses.push(info);
      }
      if (speed) this._frozenT = null;
      this.poses = poses;
      this.buildPeople(t);
      this.updateParticles(dt * (speed ? Math.min(speed, 2) : 0.5), hour);

      // tronçons visibles
      const fwd = [this.cam.tx - this.eye[0], this.cam.ty - this.eye[1], this.cam.tz - this.eye[2]];
      const fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
      const maxD = Lt.fogFar + 20;
      const nearR = U.clamp(this.cam.dist * 1.1 + 8, 14, 45);
      const vis = [];
      for (const c of this.world.chunks) {
        const data = this.cgpu.get(c);
        if (!data) continue;
        const mx = (c.x0 + c.x1) / 2, mz = (c.y0 + c.y1) / 2, my = (c.minH + c.maxH) / 2;
        const rx = mx - this.eye[0], ry = my - this.eye[1], rz = mz - this.eye[2];
        const dist = Math.hypot(rx, ry, rz);
        const rad = 12 + (c.maxH - c.minH) * 0.5;
        if (dist - rad > maxD) continue;
        if (rx * fwd[0] + ry * fwd[1] + rz * fwd[2] < -rad) continue;
        const dt2 = Math.hypot(mx - this.cam.tx, mz - this.cam.tz);
        vis.push({ c, data, near: dt2 < nearR, tdist: dt2 });
      }
      this.visChunks = vis;

      // --- ombres ---
      if (this.shadow) {
        const half = U.clamp(this.cam.dist * 0.95 + 3, 6, 90);
        const texel = half * 2 / this.shadow.size;
        const cx = Math.round(this.cam.tx / texel) * texel, cz = Math.round(this.cam.tz / texel) * texel;
        const eye = [cx + Lt.dir[0] * 120, this.cam.ty + Lt.dir[1] * 120, cz + Lt.dir[2] * 120];
        const view = M4.lookAt(eye, [cx, this.cam.ty, cz], Math.abs(Lt.dir[1]) > 0.97 ? [0, 0, 1] : [0, 1, 0]);
        const proj = M4.ortho(-half, half, -half, half, 1, 300);
        M4.mul(proj, view, this.mLight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb);
        gl.viewport(0, 0, this.shadow.size, this.shadow.size);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
        this.setCommon(this.P.depth, Lt, this.mLight);
        this.drawMesh(this.P.depth, this.static);
        for (const v of vis) if (v.tdist < half + 12) { this.drawMesh(this.P.depth, v.data.deco); if (this.cam.dist > 40) this.drawMesh(this.P.depth, v.data.terrain); }
        for (const [mesh, mat] of parts) this.drawMesh(this.P.depth, mesh, mat);
        this.setCommon(this.P.depthInst, Lt, this.mLight);
        for (const v of vis) if (v.tdist < half + 12) this.drawTrees(this.P.depthInst, v.data, v.near);
        this.drawInst(this.P.depthInst, this.personBody);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }

      // --- scène ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(Lt.horizon[0], Lt.horizon[1], Lt.horizon[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // ciel
      gl.disable(gl.DEPTH_TEST);
      const sky = this.P.sky;
      gl.useProgram(sky.p);
      gl.uniformMatrix4fv(sky.u.uInvVP, false, this.mInvVP);
      gl.uniform3fv(sky.u.uSunDir, Lt.dir); gl.uniform3fv(sky.u.uZenith, Lt.zenith); gl.uniform3fv(sky.u.uHorizon, Lt.horizon);
      gl.uniform3fv(sky.u.uSunCol, Lt.sunCol); gl.uniform1f(sky.u.uNight, Lt.night); gl.uniform1f(sky.u.uTime, t);
      gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      const lit = this.P.lit;
      this.setCommon(lit, Lt);
      if (this.far) this.drawMesh(lit, this.far.land);
      for (const v of vis) { this.drawMesh(lit, v.data.terrain); this.drawMesh(lit, v.data.paths); this.drawMesh(lit, v.data.deco); }
      this.drawMesh(lit, this.static);
      for (const [mesh, mat] of parts) this.drawMesh(lit, mesh, mat);
      const li = this.P.litInst;
      this.setCommon(li, Lt);
      for (const v of vis) {
        this.drawTrees(li, v.data, v.near);
        if (v.data.tuft && v.tdist < 26 && this.cam.dist < 30) { gl.bindVertexArray(v.data.tuft.vao); gl.drawElementsInstanced(gl.TRIANGLES, this.tuft.count, gl.UNSIGNED_INT, 0, v.data.tuft.count); }
      }
      this.drawInst(li, this.personBody);
      this.drawInst(li, this.personLeg);
      // eau
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      const wp = this.P.water;
      gl.useProgram(wp.p);
      gl.uniformMatrix4fv(wp.u.uVP, false, this.mVP);
      gl.uniform3fv(wp.u.uSunDir, Lt.dir); gl.uniform3fv(wp.u.uSunCol, Lt.sunCol); gl.uniform3fv(wp.u.uSkyCol, Lt.zenith.map((v, i) => v * 0.6 + Lt.horizon[i] * 0.4));
      gl.uniform3fv(wp.u.uFogCol, Lt.fog); gl.uniform3fv(wp.u.uCam, this.eye); gl.uniform2f(wp.u.uFog, Lt.fogNear, Lt.fogFar);
      gl.uniform1f(wp.u.uTime, t); gl.uniform1f(wp.u.uNight, Lt.night);
      gl.uniform3f(wp.u.uShallow, 0.31, 0.5, 0.45); gl.uniform3f(wp.u.uDeep, 0.07, 0.22, 0.27);
      for (const v of vis) if (v.data.water) { gl.bindVertexArray(v.data.water.vao); gl.drawElements(gl.TRIANGLES, v.data.water.count, gl.UNSIGNED_INT, 0); }
      if (this.far) { gl.bindVertexArray(this.far.water.vao); gl.drawElements(gl.TRIANGLES, this.far.water.count, gl.UNSIGNED_INT, 0); }
      // verre
      this.setCommon(lit, Lt);
      gl.uniform1f(lit.u.uAlpha, 0.28);
      this.drawMesh(lit, this.glass);
      // superpositions (fantôme, sélection)
      this.drawOverlays3D(lit, Lt, t);
      gl.depthMask(true);
      // particules
      this.drawPoints(Lt);
      gl.disable(gl.BLEND);
      // calque 2D
      this.drawOverlay2D(Lt, t, hour);
    }

    drawTrees(prog, data, near) {
      const gl = this.gl;
      gl.uniformMatrix4fv(prog.u.uModel, false, this.ident);
      for (const tg of data.trees) {
        gl.bindVertexArray(near ? tg.vaoD : tg.vaoL);
        gl.drawElementsInstanced(gl.TRIANGLES, near ? tg.countD : tg.countL, gl.UNSIGNED_INT, 0, tg.n);
      }
    }

    drawPoints(Lt) {
      const gl = this.gl, P = this.P.points;
      const data = this.ptData;
      let n = 0;
      const push = (x, y, z, r, g, b, a, s) => { if (n >= 4096) return; const o = n * 8; data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = r; data[o + 4] = g; data[o + 5] = b; data[o + 6] = a; data[o + 7] = s; n++; };
      const light = Math.max(0.35, 1 - Lt.night * 0.6);
      for (const p of this.particles) {
        const k = p.life / p.max;
        switch (p.k) {
          case 'coin': push(p.x, p.y, p.z, 0.95 * light, 0.75 * light, 0.25 * light, 1 - k * k, p.s * (0.7 + Math.abs(Math.cos(p.life * 8)) * 0.3)); break;
          case 'spark': push(p.x, p.y, p.z, 1, 0.92, 0.6, 1 - k, p.s * (1 - k * 0.5)); break;
          case 'dust': push(p.x, p.y, p.z, 0.72 * light, 0.63 * light, 0.48 * light, (1 - k) * 0.45, p.s * (0.6 + k)); break;
          case 'smoke': push(p.x, p.y, p.z, 0.78 * light, 0.77 * light, 0.74 * light, (1 - k) * 0.4, p.s); break;
          case 'drop': case 'jet': push(p.x, p.y, p.z, 0.9 * light, 0.96 * light, 1 * light, 0.8, p.s); break;
          case 'leaf': push(p.x, p.y, p.z, p.col[0] * light, p.col[1] * light, p.col[2] * light, Math.min(1, (1 - k) * 3), p.s); break;
          case 'fly': push(p.x, p.y, p.z, p.col[0], p.col[1], p.col[2], Math.min(1, (1 - k) * 3, k * 5), p.s * (0.6 + Math.abs(Math.sin(p.life * 22)) * 0.5)); break;
          default: break;
        }
      }
      const nNormal = n;
      // halos additifs : lucioles et lampes
      for (const p of this.particles) if (p.k === 'firefly') { const k = p.life / p.max; push(p.x, p.y, p.z, 0.85, 1, 0.55, (0.4 + 0.6 * Math.max(0, Math.sin(p.life * 3 + p.seed))) * Math.min(1, (1 - k) * 3, k * 4) * Lt.night, p.s * 2); }
      if (Lt.lamp > 0.05) for (const l of this.lights) push(l[0], l[1], l[2], 1, 0.75, 0.45, Lt.lamp * 0.5, l[3] * 0.55);
      if (!n) return;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, this.mVP);
      gl.uniform1f(P.u.uScale, this.canvas.height / (2 * Math.tan(this.fov / 2)));
      gl.bindVertexArray(this.ptVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 8), gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND); gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (nNormal) gl.drawArrays(gl.POINTS, 0, nNormal);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      if (n > nNormal) gl.drawArrays(gl.POINTS, nNormal, n - nNormal);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
    }

    drawRect(lit, x, z, w, d, col, alpha, y) {
      const gl = this.gl;
      const base = Math.max(this.world.heightAt(x + w / 2, z + d / 2), this.game.elevAt(Math.floor(x + w / 2), Math.floor(z + d / 2)));
      const m = M4.create(); M4.translate(m, x, base + (y || 0.06), z); M4.scale(m, w, 1, d);
      gl.uniform3fv(lit.u.uTint, col); gl.uniform1f(lit.u.uTintAmt, 1); gl.uniform1f(lit.u.uAlpha, alpha); gl.uniform1f(lit.u.uUnlit, 1);
      this.drawMesh(lit, this.quadMesh, m);
    }
    outline(lit, x, z, w, d, col, alpha, th) {
      const k = th || 0.05;
      this.drawRect(lit, x, z, w, k, col, alpha, 0.08); this.drawRect(lit, x, z + d - k, w, k, col, alpha, 0.08);
      this.drawRect(lit, x, z, k, d, col, alpha, 0.08); this.drawRect(lit, x + w - k, z, k, d, col, alpha, 0.08);
    }

    ghostMesh(type, level) {
      const key = type + level;
      if (this.ghostCache[key]) return this.ghostCache[key];
      const def = C.buildings[type];
      const mb = new G.MB(), glass = new G.MB();
      const fake = { id: -1, type, x: 0, y: 0, w: def.w, h: def.h, level: level || 1, seed: 3 };
      if (def.cat === 'enclos') G.enclosureInto(mb, glass, fake, this.world);
      else if (type === 'arbre' || type === 'palmier' || type === 'fougere') { mb.push().t(0.5, 0, 0.55).s(1.1); mb.add(G.treeMesh(type === 'arbre' ? 'araucaria' : type, 0)); mb.pop(); }
      else G.buildingInto(mb, fake);
      const mesh = G.upload(this.gl, mb.finish());
      this.ghostCache[key] = mesh;
      return mesh;
    }

    drawOverlays3D(lit, Lt, t) {
      const gl = this.gl, game = this.game;
      gl.depthMask(false);
      const pulse = 0.6 + Math.sin(t * 5) * 0.3;
      if (this.highlightEnclosures) {
        for (const id in game.buildings) {
          const b = game.buildings[id];
          if (!game.isEnclosure(b)) continue;
          const ok = this.highlightEnclosures(b);
          this.drawRect(lit, b.x, b.y, b.w, b.h, ok ? [0.47, 0.86, 0.55] : [0.86, 0.35, 0.27], ok ? 0.22 : 0.14, 0.07);
          this.outline(lit, b.x, b.y, b.w, b.h, ok ? [0.6, 0.95, 0.65] : [0.9, 0.45, 0.35], 0.8);
        }
      }
      if (this.selected) {
        if (this.selected.kind === 'building') {
          const b = game.buildings[this.selected.id];
          if (b) this.outline(lit, b.x, b.y, b.w, b.h, [1, 0.92, 0.67], pulse, 0.06);
        } else {
          const p = (this.poses || []).find((q) => q.d.id === this.selected.id);
          if (p) {
            const m = M4.create(); M4.translate(m, p.x, (p.shadowY !== undefined ? p.shadowY : p.underwater ? G.WATER_Y : p.y) + 0.06, p.z); M4.rotY(m, t * 0.8); M4.scale(m, p.r * 0.9, 1, p.r * 0.9);
            gl.uniform3fv(lit.u.uTint, [1, 0.92, 0.67]); gl.uniform1f(lit.u.uTintAmt, 1); gl.uniform1f(lit.u.uAlpha, pulse); gl.uniform1f(lit.u.uUnlit, 1);
            this.drawMesh(lit, this.ringMesh, m);
          }
        }
      }
      const gh = this.ghost;
      if (gh) {
        if (gh.kind === 'tile') {
          this.drawRect(lit, gh.x, gh.y, 1, 1, gh.ok ? [1, 0.95, 0.8] : [0.9, 0.3, 0.25], 0.35, 0.07);
          this.outline(lit, gh.x, gh.y, 1, 1, gh.ok ? [1, 0.95, 0.8] : [0.95, 0.4, 0.3], 0.9, 0.04);
        } else if (gh.kind === 'building') {
          const def = C.buildings[gh.type];
          const m = M4.create(); M4.translate(m, gh.x, this.world.footprintHeight(gh.x, gh.y, def.w, def.h) + 0.005, gh.y);
          gl.depthMask(true);
          gl.uniform1f(lit.u.uUnlit, 0); gl.uniform3fv(lit.u.uTint, gh.ok ? [0.5, 1, 0.6] : [1, 0.35, 0.3]); gl.uniform1f(lit.u.uTintAmt, 0.35); gl.uniform1f(lit.u.uAlpha, 0.7);
          this.drawMesh(lit, this.ghostMesh(gh.type, gh.level), m);
          gl.depthMask(false);
          this.drawRect(lit, gh.x, gh.y, def.w, def.h, gh.ok ? [0.47, 0.9, 0.55] : [0.9, 0.31, 0.24], 0.3, 0.07);
          this.outline(lit, gh.x, gh.y, def.w, def.h, gh.ok ? [0.6, 0.95, 0.65] : [0.95, 0.4, 0.3], 0.95);
          if (gh.ok && def.cat !== 'deco') {
            const acc = game.accessTiles({ x: gh.x, y: gh.y, w: def.w, h: def.h, _accV: -1 });
            for (const i of acc) this.drawRect(lit, (i % W) + 0.1, Math.floor(i / W) + 0.1, 0.8, 0.8, [0.6, 0.95, 0.65], 0.4, 0.08);
          }
        } else if (gh.kind === 'demolish') {
          const b = gh.building;
          if (b) { this.drawRect(lit, b.x, b.y, b.w, b.h, [0.86, 0.24, 0.16], 0.35, 0.08); this.outline(lit, b.x, b.y, b.w, b.h, [0.95, 0.35, 0.27], 0.95); }
          else { this.drawRect(lit, gh.x, gh.y, 1, 1, [0.86, 0.24, 0.16], 0.4, 0.08); }
        }
      }
      gl.uniform1f(lit.u.uTintAmt, 0); gl.uniform1f(lit.u.uAlpha, 1); gl.uniform1f(lit.u.uUnlit, 0);
    }

    /* Calque 2D : bulles, icônes, textes, pluie, éclairs, rayons, vignettage. */
    drawOverlay2D(Lt, t, hour) {
      const o = this.octx, W2 = this.vw, H2 = this.vh;
      o.setTransform(this.odpr, 0, 0, this.odpr, 0, 0);
      o.clearRect(0, 0, W2, H2);
      const g = this.game;
      const z = U.clamp(9 / this.cam.dist, 0.5, 2.2);
      // bulles d'humeur
      if (this.cam.dist < 22) {
        for (const grp of g.visitors) {
          if (grp.hidden || grp.bubbleT <= 0) continue;
          const p = this.project(grp.x, this.world.heightAt(grp.x, grp.y) + 0.55, grp.y);
          if (!p || p.x < -20 || p.y < -20 || p.x > W2 + 20 || p.y > H2 + 20) continue;
          const sp = R.moodSprite(grp.mood);
          o.globalAlpha = Math.min(1, grp.bubbleT * 2);
          const s = z * 1.4;
          o.drawImage(sp.c, p.x - sp.ox * s, p.y - sp.oy * s, sp.w * s, sp.h * s);
        }
        o.globalAlpha = 1;
      }
      // textes des pièces
      if (this.cam.dist < 14) {
        o.font = '600 12px "Trebuchet MS", sans-serif'; o.textAlign = 'center';
        for (const p of this.particles) {
          if (p.k !== 'coin' || !p.text) continue;
          const s = this.project(p.x, p.y, p.z);
          if (!s) continue;
          o.globalAlpha = 1 - (p.life / p.max) ** 2;
          o.lineWidth = 3; o.strokeStyle = 'rgba(60,40,10,0.7)'; o.fillStyle = '#fff6d0';
          o.strokeText(p.text, s.x + 14, s.y); o.fillText(p.text, s.x + 14, s.y);
        }
        o.globalAlpha = 1;
      }
      // icônes : malade, non relié
      for (const p of this.poses || []) {
        if (!p.d.sick) continue;
        const s = this.project(p.x, p.y + (p.h || 0.3) + 0.25, p.z);
        if (!s) continue;
        const b = Math.sin(t * 3) * 2;
        o.fillStyle = 'rgba(255,255,255,0.92)'; o.beginPath(); o.arc(s.x, s.y + b, 9, 0, TAU); o.fill();
        o.fillStyle = '#4c9a5a'; o.fillRect(s.x - 2, s.y + b - 6, 4, 12); o.fillRect(s.x - 6, s.y + b - 2, 12, 4);
      }
      for (const id in g.buildings) {
        const b = g.buildings[id];
        if (C.buildings[b.type].cat !== 'service' || g.isConnected(b)) continue;
        const s = this.project(b.x + b.w / 2, 1.3, b.y + b.h / 2);
        if (!s) continue;
        const bb = Math.sin(t * 3) * 2;
        o.fillStyle = '#e8b030'; o.beginPath(); o.moveTo(s.x, s.y - 10 + bb); o.lineTo(s.x + 10, s.y + 7 + bb); o.lineTo(s.x - 10, s.y + 7 + bb); o.closePath(); o.fill();
        o.fillStyle = '#2a1e10'; o.fillRect(s.x - 1.2, s.y - 4 + bb, 2.4, 7); o.fillRect(s.x - 1.2, s.y + 4 + bb, 2.4, 2);
      }
      // rayons de soleil
      if (this.Q.godRays && Lt.night < 0.2 && Lt.storm < 0.2 && hour > 7.5 && hour < 18) {
        const ang = 0.5 + (hour - 12) * 0.05;
        o.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
          const base = ((i * 0.23 + t * 0.004) % 1.2 - 0.1) * W2, w = 50 + (i % 3) * 40, a = 0.04 + 0.025 * Math.sin(t * 0.3 + i * 2);
          const gr = o.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, `rgba(255,240,200,${a})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
          o.fillStyle = gr; o.beginPath(); o.moveTo(base, -10); o.lineTo(base + w, -10); o.lineTo(base + w + Math.tan(ang) * H2, H2); o.lineTo(base + Math.tan(ang) * H2 - w * 0.5, H2); o.closePath(); o.fill();
        }
        o.globalCompositeOperation = 'source-over';
      }
      // pluie et éclairs
      const storm = Lt.storm;
      if (storm > 0.01) {
        const n = Math.round(storm * (this.Q.particles > 400 ? 420 : this.Q.particles > 200 ? 220 : 100));
        while (this.rain.length < n) this.rain.push({ x: Math.random() * W2, y: Math.random() * H2, v: 600 + Math.random() * 300, l: 10 + Math.random() * 12 });
        this.rain.length = Math.min(this.rain.length, n);
        o.strokeStyle = 'rgba(200,215,230,0.4)'; o.lineWidth = 1; o.beginPath();
        for (const d of this.rain) { d.y += d.v / 60; d.x -= d.v * 0.2 / 60; if (d.y > H2) { d.y = -20; d.x = Math.random() * (W2 + 100); } o.moveTo(d.x, d.y); o.lineTo(d.x + d.l * 0.2, d.y - d.l); }
        o.stroke();
        o.fillStyle = `rgba(150,160,175,${storm * 0.12})`; o.fillRect(0, 0, W2, H2);
        if (storm > 0.6 && Math.random() < 0.002) { this.flash = 1; g.emit('thunder'); }
      } else this.rain.length = 0;
      if (this.flash > 0) { o.fillStyle = `rgba(235,240,255,${this.flash * 0.35})`; o.fillRect(0, 0, W2, H2); this.flash = Math.max(0, this.flash - 0.05); }
      // vignettage
      const vg = o.createRadialGradient(W2 / 2, H2 / 2, Math.min(W2, H2) * 0.45, W2 / 2, H2 / 2, Math.max(W2, H2) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,15,8,0.3)');
      o.fillStyle = vg; o.fillRect(0, 0, W2, H2);
    }

    /* ------------------------------------------------------------------
       Sélection
       ------------------------------------------------------------------ */
    pickDinoAt(sx, sy) {
      let best = null, bd = 1e9;
      for (const p of this.poses || []) {
        const c = this.project(p.x, p.y + (p.underwater ? 0.05 : (p.h || 0.3) * 0.5), p.z);
        if (!c) continue;
        const pr = this.project(p.x + p.r, p.y, p.z);
        const rad = pr ? Math.max(14, Math.abs(pr.x - c.x) * 0.9) : 20;
        const dd = Math.hypot(sx - c.x, sy - c.y);
        if (dd < rad && dd < bd) { bd = dd; best = p.d; }
      }
      return best;
    }
    pickDino(wx, wy) {
      const x = wx / T, z = wy / T;
      let best = null, bd = 0.8;
      for (const d of this.game.dinos) { const dd = Math.hypot(d.x - x, d.y - z); if (dd < bd) { bd = dd; best = d; } }
      return best;
    }

    /* ------------------------------------------------------------------
       Vignettes 3D (catalogue, panneaux)
       ------------------------------------------------------------------ */
    renderThumb(w, h, setup) {
      const gl = this.gl;
      const pw = w * 2, ph = h * 2;
      if (!this._thumbT || this._thumbT.w !== pw || this._thumbT.h !== ph) {
        if (this._thumbT) { gl.deleteFramebuffer(this._thumbT.fb); gl.deleteRenderbuffer(this._thumbT.color); gl.deleteRenderbuffer(this._thumbT.depth); }
        this._thumbT = G.colorTarget(gl, pw, ph);
      }
      const T2 = this._thumbT;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T2.fb);
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      const Lt = { dir: [0.45, 0.75, 0.5], sunCol: [1.15, 1.08, 0.95], skyCol: [0.5, 0.56, 0.66], groundCol: [0.28, 0.25, 0.2], fog: [0, 0, 0], fogNear: 900, fogFar: 1000, lamp: 0, noShadow: true, noLights: true };
      const { vp, eye, draw } = setup(pw / ph);
      Lt.cam = eye;
      const saveLights = this.activeLights;
      this.activeLights = [];
      this.setCommon(this.P.lit, Lt, vp);
      draw(this.P.lit);
      this.activeLights = saveLights || [];
      const px = new Uint8Array(pw * ph * 4);
      gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const c = R.canvas(pw, ph), g = c.getContext('2d');
      const img = g.createImageData(pw, ph);
      for (let y = 0; y < ph; y++) img.data.set(px.subarray((ph - 1 - y) * pw * 4, (ph - y) * pw * 4), y * pw * 4);
      g.putImageData(img, 0, 0);
      return c;
    }
    thumbDino(id, w, h) {
      const fake = { id: 7, sp: id, x: 0, y: 0, face: 1, phase: 0, moving: 0, state: 'idle', anim: 0, heading: 0.0, alt: 20, surf: 0.6, gx: 1, gy: 0 };
      const parts = [];
      this.dinoState.delete(-99);
      const saveW = this.world.heightAt;
      this.world.heightAt = () => 0;
      const info = this.dinoPose(Object.assign(fake, { id: -99 }), 1.3, parts, 0);
      this.world.heightAt = saveW;
      this.dinoState.delete(-99);
      const sp = DZ.SPECIES[id];
      const air = sp.habitat === 'air', water = sp.habitat === 'water';
      // boîte englobante réelle de la pose
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (const [mesh, mat] of parts) {
        const b = mesh.bounds;
        for (const cx of [b.x0, b.x1]) for (const cy2 of [b.y0, b.y1]) for (const cz of [b.z0, b.z1]) {
          const p = M4.apply(mat, cx, cy2, cz);
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
        }
      }
      const ctr = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      const len = Math.max(x1 - x0, z1 - z0);
      return this.renderThumb(w, h, (aspect) => {
        const span = air ? Math.max(z1 - z0, (x1 - x0) * aspect) / aspect * 0.85 : Math.max(len / Math.min(aspect, 1.9), (y1 - y0) * 1.1);
        const dist = span * 1.45 + 0.05;
        const eye = air ? [ctr[0] - dist * 0.25, ctr[1] + dist, ctr[2]] : water ? [ctr[0], ctr[1] + dist, ctr[2] + dist * 0.3] : [ctr[0] + dist * 0.2, ctr[1] + dist * 0.16, ctr[2] + dist];
        const cy = ctr[1];
        const view = M4.lookAt(eye, [ctr[0], cy, ctr[2]], air ? [1, 0, 0] : water ? [0, 0, -1] : [0, 1, 0]);
        const vp = M4.mul(M4.persp(0.7, aspect, 0.02, 50), view);
        return { vp, eye, draw: (prog) => { for (const [mesh, mat] of parts) this.drawMesh(prog, mesh, mat); } };
      });
    }
    thumbBuilding(type, w, h) {
      const def = C.buildings[type];
      if (!def) return R.canvas(w * 2, h * 2);
      const mesh = this.ghostMesh(type, 1);
      return this.renderThumb(w, h, (aspect) => {
        const cx = def.w / 2, cz = def.h / 2;
        const size = Math.max(def.w, def.h);
        const dist = size * 1.25 + 0.6;
        const eye = [cx + dist * 0.55, dist * 0.75, cz + dist * 0.95];
        const view = M4.lookAt(eye, [cx, size * 0.12, cz], [0, 1, 0]);
        const vp = M4.mul(M4.persp(0.62, aspect, 0.05, 80), view);
        return { vp, eye, draw: (prog) => { this.drawMesh(prog, mesh, null); } };
      });
    }
  }

  G.Renderer3D = Renderer3D;
})();
