/* =====================================================================
   DinoZoo — Moteur de rendu principal.
   Caméra (glisser, zoom fluide, écrans haute densité), terrain en
   cache, tri en profondeur, ombres douces orientées par le soleil,
   eau animée, particules, cycle jour/nuit, météo et superpositions.
   Ne modifie jamais l'état du jeu : il ne fait que le lire.
   ===================================================================== */
(function () {
  const U = DZ.util, R = DZ.R, C = DZ.CONFIG;
  const T = C.map.tile, W = C.map.w, H = C.map.h, M = C.map.margin;
  const TAU = U.TAU;

  /* Couleur d'éclairage interpolée selon l'heure. */
  function lightAt(hour) {
    const L = C.light;
    let a = L[0], b = L[L.length - 1];
    for (let i = 0; i < L.length - 1; i++) if (hour >= L[i].h && hour <= L[i + 1].h) { a = L[i]; b = L[i + 1]; break; }
    const t = b.h === a.h ? 0 : U.clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const s = U.smooth(t);
    return { mul: U.mixRgb(U.rgb(a.mul), U.rgb(b.mul), s), add: U.mixRgb(U.rgb(a.add), U.rgb(b.add), s), a: U.lerp(a.a, b.a, s) };
  }
  DZ.lightAt = lightAt;

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.cam = { x: (C.map.entrance.tileX + 0.5) * T, y: (H - 6) * T, zoom: C.camera.startZoom, tz: C.camera.startZoom, anchor: null };
      this.shake = 0;
      this.particles = [];
      this.time = 0;
      this.flash = 0;
      this.ghost = null;
      this.selected = null;
      this.hoverTile = null;
      this.highlightEnclosures = null;
      this.terrain = new R.TerrainCache(game);
      this.rain = [];
      this.quality = 'high';
      this.dpr = 1;
      this.fps = 60;
      this._footState = new Map();
      this._dirty = [];
      game.on('mapChanged', (r) => this._dirty.push(r));
      game.on('reset', () => { this._needFull = true; });
      game.on('spend', (e) => this.coin(e.x * T, e.y * T - 14, e.amount));
      game.on('built', (b) => this.burst((b.x + b.w / 2) * T, (b.y + b.h / 2) * T, b.w * T * 0.5, 'build'));
      game.on('upgraded', (b) => this.burst((b.x + b.w / 2) * T, (b.y + b.h / 2) * T, b.w * T * 0.6, 'sparkle'));
      game.on('demolished', (e) => this.burst(e.x * T, e.y * T, 20, 'dust'));
      game.on('dinoAdded', (d) => this.burst(d.x * T, d.y * T - 10, 16, 'sparkle'));
      game.on('roar', (d) => { if ((d.sp === 'trex' || d.sp === 'spinosaurus') && this.isVisible(d.x * T, d.y * T, 200)) this.shake = Math.max(this.shake, d.sp === 'trex' ? 1 : 0.6); });
      game.on('splash', (d) => this.burst(d.x * T, d.y * T, 12, 'splash'));
      game.on('escape', () => { this.shake = 1.2; });
    }

    setQuality(q) {
      this.quality = q;
      const Q = C.quality[q];
      R.spriteScale = Q.spriteScale;
      R.clearNature(); R.clearBuildings(); R.clearDinos(); R.clearPeople();
      this.terrain.setScale(Q.cacheScale);
      this._needFull = true;
      this.game.maxGroups = C.visitors.maxGroups[Q.maxGroups];
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.vw = w; this.vh = h;
    }

    /* ---------- Caméra ---------- */
    screenToWorld(sx, sy) {
      const c = this.cam;
      return { x: (sx - this.vw / 2) / c.zoom + c.x, y: (sy - this.vh / 2) / c.zoom + c.y };
    }
    worldToScreen(wx, wy) {
      const c = this.cam;
      return { x: (wx - c.x) * c.zoom + this.vw / 2, y: (wy - c.y) * c.zoom + this.vh / 2 };
    }
    pan(dx, dy) { this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.clampCam(); }
    zoomAt(sx, sy, factor) {
      const c = this.cam;
      c.tz = U.clamp(c.tz * factor, C.camera.minZoom, C.camera.maxZoom);
      c.anchor = { sx, sy, w: this.screenToWorld(sx, sy) };
    }
    clampCam() {
      const c = this.cam;
      c.x = U.clamp(c.x, -T * 1, (W + 1) * T);
      c.y = U.clamp(c.y, -T * 1, (H + 1.5) * T);
    }
    updateCam(dt) {
      const c = this.cam;
      if (Math.abs(c.zoom - c.tz) > 0.0005) {
        c.zoom += (c.tz - c.zoom) * Math.min(1, dt * 12);
        if (c.anchor) {
          const w = this.screenToWorld(c.anchor.sx, c.anchor.sy);
          c.x += c.anchor.w.x - w.x; c.y += c.anchor.w.y - w.y;
        }
      } else { c.zoom = c.tz; c.anchor = null; }
      this.clampCam();
    }
    isVisible(x, y, m) {
      const v = this.view;
      return v && x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
    }

    /* ---------- Soleil ---------- */
    sun(hour) {
      const t = U.clamp((hour - 6) / 13, 0, 1);
      const dx = (t - 0.5) * 2; // -1 matin (ombres vers l'ouest) → 1 soir
      const night = this.nightFactor(hour);
      return { dx: -dx * 0.9, dy: 0.32, len: 0.35 + Math.abs(dx) * 0.75, alpha: (1 - night * 0.75) * (1 - this.game.stormIntensity() * 0.6) };
    }
    nightFactor(h) {
      if (h >= 18.6) return U.smooth(U.clamp((h - 18.6) / 1.8, 0, 1));
      if (h < 7.2) return U.smooth(U.clamp((7.2 - h) / 1.4, 0, 1));
      return 0;
    }

    /* ---------- Particules ---------- */
    addP(p) {
      const max = C.quality[this.quality].particles;
      if (this.particles.length >= max) this.particles.shift();
      this.particles.push(p);
    }
    coin(x, y, amount) {
      if (!this.isVisible(x, y, 60)) return;
      this.addP({ k: 'coin', x, y, vx: (Math.random() - 0.5) * 6, vy: -18, life: 0, max: 1.4, text: amount >= 1 ? '+' + U.fmt(amount) : '' });
    }
    burst(x, y, rad, kind) {
      const n = kind === 'sparkle' ? 26 : kind === 'build' ? 22 : kind === 'splash' ? 14 : 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 10 + Math.random() * 30;
        if (kind === 'sparkle') this.addP({ k: 'spark', x: x + Math.cos(a) * rad * Math.random(), y: y + Math.sin(a) * rad * 0.6 * Math.random(), vx: Math.cos(a) * 8, vy: -20 - Math.random() * 30, life: 0, max: 0.8 + Math.random() * 0.8, s: 1 + Math.random() * 2 });
        else if (kind === 'splash') this.addP({ k: 'drop', x, y, vx: Math.cos(a) * sp, vy: -30 - Math.random() * 40, z: 0, life: 0, max: 0.9 });
        else this.addP({ k: 'dust', x: x + Math.cos(a) * rad * Math.random(), y: y + Math.sin(a) * rad * 0.5 * Math.random(), vx: Math.cos(a) * sp * 0.4, vy: Math.sin(a) * sp * 0.2 - 4, life: 0, max: 0.9 + Math.random() * 0.6, s: 3 + Math.random() * 5 });
      }
      if (kind === 'splash') this.addP({ k: 'ring', x, y, life: 0, max: 1.4, s: 6 });
      if (kind === 'build') this.burst(x, y, rad, 'sparkle');
    }

    updateParticles(dt) {
      const ps = this.particles;
      const wind = 6 + this.game.stormIntensity() * 30;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        switch (p.k) {
          case 'coin': p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 0.98; break;
          case 'spark': p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 25 * dt; break;
          case 'dust': p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; break;
          case 'drop': p.x += p.vx * dt; p.z += p.vy * dt; p.vy += 140 * dt; if (p.z > 0) p.life = p.max; break;
          case 'leaf': p.x += (p.vx + wind) * dt + Math.sin(p.life * 2 + p.ph) * 8 * dt; p.y += p.vy * dt; p.rot += dt * p.vr; if (p.z !== undefined) { p.z += 14 * dt; if (p.z > 0) { p.z = 0; p.vy = 0; p.vx = 0; } } break;
          case 'fly': p.ph += dt * 3; p.x += Math.cos(p.ph * 0.7 + p.seed) * 14 * dt + p.vx * dt; p.y += Math.sin(p.ph * 0.9) * 10 * dt; break;
          case 'smoke': p.x += (p.vx + wind * 0.6) * dt; p.y += p.vy * dt; p.s += dt * 5; break;
          case 'jet': p.x += p.vx * dt; p.z += p.vy * dt; p.vy += 90 * dt; if (p.z > 0) p.life = p.max; break;
          default: break;
        }
      }
    }

    ambientParticles(dt, hour) {
      const v = this.view, g = this.game;
      const q = C.quality[this.quality];
      const area = (v.x1 - v.x0) * (v.y1 - v.y0) / (T * T);
      const night = this.nightFactor(hour);
      // feuilles qui tombent depuis les arbres visibles
      if (Math.random() < dt * 0.9 * Math.min(4, area / 120) * (q.particles / 300)) {
        const trees = g.trees;
        if (trees.length) {
          const t = trees[(Math.random() * trees.length) | 0];
          if (g.hasTree(t) && this.isVisible(t.x * T, t.y * T, 0)) this.addP({ k: 'leaf', x: t.x * T + (Math.random() - 0.5) * 30, y: t.y * T, z: -40 - Math.random() * 30, vx: 0, vy: 0, vr: (Math.random() - 0.5) * 6, rot: Math.random() * 6, ph: Math.random() * 6, life: 0, max: 6, col: U.pick(Math.random, ['#8a9a3a', '#b0943a', '#6a8a32', '#a87a32']) });
        }
      }
      // papillons le jour, lucioles la nuit, libellules près de l'eau
      if (Math.random() < dt * 0.6 * (q.particles / 300) && !g.isStorming()) {
        const x = U.lerp(v.x0, v.x1, Math.random()), y = U.lerp(v.y0, v.y1, Math.random());
        if (night > 0.5) this.addP({ k: 'firefly', x, y, vx: (Math.random() - 0.5) * 6, life: 0, max: 5 + Math.random() * 4, ph: Math.random() * 6, seed: Math.random() * 6 });
        else this.addP({ k: 'fly', x, y, vx: (Math.random() - 0.5) * 10, life: 0, max: 6 + Math.random() * 6, ph: Math.random() * 6, seed: Math.random() * 6, col: U.pick(Math.random, ['#e8c060', '#f0f0e0', '#d07a3a', '#7aa0d0']) });
      }
    }

    /* ---------- Image ---------- */
    frame(dt) {
      const g = this.ctx, game = this.game, s = game.s;
      if (!s) return;
      this.time += dt;
      const t = this.time;
      if (this._needFull) { this._needFull = false; this._dirty = []; this.terrain.full(); }
      else if (this._dirty.length) {
        const regs = this._dirty; this._dirty = [];
        if (regs.some((r) => !r)) this.terrain.full();
        else for (const r of regs) this.terrain.bake(r);
      }
      this.updateCam(dt);
      const dpr = this.dpr, z = this.cam.zoom;
      let shx = 0, shy = 0;
      if (this.shake > 0) { shx = (Math.random() - 0.5) * 6 * this.shake; shy = (Math.random() - 0.5) * 4 * this.shake; this.shake = Math.max(0, this.shake - dt * 1.6); }
      this.view = { x0: this.cam.x - this.vw / 2 / z, y0: this.cam.y - this.vh / 2 / z, x1: this.cam.x + this.vw / 2 / z, y1: this.cam.y + this.vh / 2 / z };
      const v = this.view;
      const hour = s.hour;
      const sun = this.sun(hour);
      const night = this.nightFactor(hour);
      const storm = game.stormIntensity();
      const Q = C.quality[this.quality];

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = C.palette.jungle;
      g.fillRect(0, 0, this.vw, this.vh);
      g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.vw / 2 - this.cam.x * z + shx), dpr * (this.vh / 2 - this.cam.y * z + shy));
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';

      // terrain en cache (tronçons visibles)
      this._frameN = (this._frameN || 0) + 1;
      const tc = this.terrain;
      this.visChunks = tc.visible(v, this._booted ? 3 : 24, this._frameN);
      this._booted = true;
      for (const c of this.visChunks) g.drawImage(c.canvas, c.x0 * T, c.y0 * T, (c.x1 - c.x0) * T, (c.y1 - c.y0) * T);

      // eau animée
      if (Q.waterFx) this.drawWaterFx(g, t, night);
      // déchets
      this.drawLitter(g);

      // liste d'objets triés
      const objs = this.collect(t);
      // ombres
      if (Q.shadows) {
        g.globalAlpha = sun.alpha;
        for (const o of objs) if (o.shadow) o.shadow(g, sun);
        g.globalAlpha = 1;
      }
      objs.sort((a, b) => a.y - b.y);
      for (const o of objs) o.draw(g);

      // particules (monde)
      this.updateParticles(dt);
      this.ambientParticles(dt, hour);
      this.drawParticles(g, night);
      // bulles d'humeur et alertes
      this.drawBubbles(g, t);

      // éclairage (écran)
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawLighting(g, hour, night, storm, t, Q, objs);
      // superpositions de jeu (monde, non assombries)
      g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.vw / 2 - this.cam.x * z + shx), dpr * (this.vh / 2 - this.cam.y * z + shy));
      this.drawOverlays(g, t);
    }

    drawWaterFx(g, t, night) {
      for (const c of this.visChunks) if (c.foam.length || c.waterPath) this.drawWaterChunk(g, t, night, c);
    }
    drawWaterChunk(g, t, night, tc) {
      if (!tc.foam.length) return;
      g.save();
      g.beginPath(); g.rect(tc.x0 * T, tc.y0 * T, (tc.x1 - tc.x0) * T, (tc.y1 - tc.y0) * T); g.clip();
      g.clip(tc.waterPath);
      const v = { x0: Math.max(this.view.x0, tc.x0 * T), y0: Math.max(this.view.y0, tc.y0 * T), x1: Math.min(this.view.x1, tc.x1 * T), y1: Math.min(this.view.y1, tc.y1 * T) };
      const pat = R.pattern(g, 'ripples');
      const x0 = Math.floor(v.x0 / 128) * 128 - 128, y0 = Math.floor(v.y0 / 128) * 128 - 128;
      g.globalCompositeOperation = 'screen';
      for (const [sp, a, sc] of [[6, 0.5, 0.5], [-4, 0.35, 0.7]]) {
        g.save();
        const ox = (t * sp) % 256, oy = (t * sp * 0.4) % 256;
        g.translate(ox, oy);
        g.scale(sc, sc);
        g.globalAlpha = a * (1 - night * 0.6);
        g.fillStyle = pat;
        g.fillRect((x0 - ox) / sc, (y0 - oy) / sc, (v.x1 - v.x0 + 384) / sc, (v.y1 - v.y0 + 384) / sc);
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
      g.restore();
      // écume sur les berges
      g.fillStyle = 'rgba(235,245,240,0.5)';
      for (const f of tc.foam) {
        if (!this.isVisible(f[0], f[1], 20)) continue;
        const a = 0.25 + 0.25 * Math.sin(t * 1.6 + f[4] * 20);
        g.globalAlpha = a;
        const len = 9 + f[4] * 8;
        g.beginPath();
        if (f[2]) g.ellipse(f[0] - f[2] * 2, f[1] + (f[4] - 0.5) * 18, 1.3, len, 0, 0, TAU);
        else g.ellipse(f[0] + (f[4] - 0.5) * 18, f[1] - f[3] * 2, len, 1.3, 0, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      // reflets du soleil
      if (night < 0.5) {
        g.fillStyle = 'rgba(255,255,240,0.8)';
        for (const f of tc.foam) {
          if (!this.isVisible(f[0], f[1], 0)) continue;
          const k = Math.sin(t * 3 + f[4] * 50);
          if (k > 0.93) { g.globalAlpha = (k - 0.93) * 12; g.beginPath(); g.arc(f[0] - f[2] * 20 + f[4] * 10, f[1] - f[3] * 20, 1.2, 0, TAU); g.fill(); }
        }
        g.globalAlpha = 1;
      }
    }

    drawLitter(g) {
      const game = this.game, v = this.view;
      const tx0 = Math.max(0, Math.floor(v.x0 / T)), ty0 = Math.max(0, Math.floor(v.y0 / T));
      const tx1 = Math.min(W - 1, Math.ceil(v.x1 / T)), ty1 = Math.min(H - 1, Math.ceil(v.y1 / T));
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        const n = game.litter[y * W + x];
        if (!n) continue;
        for (let i = 0; i < n; i++) {
          const hx = U.hash(x, y, i * 7 + 1), hy = U.hash(x, y, i * 7 + 2);
          g.fillStyle = ['#e8e4d8', '#c84a3a', '#d8c040', '#7a9ac0'][i % 4];
          g.save(); g.translate(x * T + 6 + hx * (T - 12), y * T + 6 + hy * (T - 12)); g.rotate(hx * 6);
          g.fillRect(-1.6, -1.1, 3.2, 2.2);
          g.restore();
        }
      }
    }

    /* Rassemble les objets visibles avec leur fonction de dessin. */
    collect(t) {
      const game = this.game, out = [], v = this.view;
      const wind = 1 + game.stormIntensity() * 3;
      const vis = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m + 120;
      const self = this;
      // arbres naturels (cases visibles seulement)
      const tx0 = Math.max(0, Math.floor(v.x0 / T) - 2), tx1 = Math.min(W - 1, Math.ceil(v.x1 / T) + 2);
      const ty0 = Math.max(0, Math.floor(v.y0 / T) - 1), ty1 = Math.min(H - 1, Math.ceil(v.y1 / T) + 4);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const k = game.treeAt[ty * W + tx];
        if (!k || game.cleared[ty * W + tx]) continue;
        const tr = game.trees[k - 1];
        out.push(this.treeObj(tr.k, tr.sd, tr.sc, tr.x * T, tr.y * T, t, wind));
      }
      // bâtiments
      this.lights = [];
      for (const id in game.buildings) {
        const b = game.buildings[id];
        const def = C.buildings[b.type];
        const bx = b.x * T, by = b.y * T, bw = b.w * T, bh = b.h * T;
        if (!(bx + bw > v.x0 - 120 && bx < v.x1 + 120 && by + bh > v.y0 - 60 && by < v.y1 + 160)) continue;
        if (def.cat === 'enclos') {
          const art = R.enclosureArt(b);
          out.push({ y: by + 1, draw: (g) => R.draw(g, art.back, bx, by) });
          out.push({ y: by + bh - 0.5, draw: (g) => R.draw(g, art.front, bx, by) });
          for (const l of art.lights) this.lights.push([bx + l[0], by + l[1], l[2]]);
          for (const d of art.decor) {
            if (d.t === 'tree') out.push(this.treeObj(d.k, d.sd, d.sc, d.x * T, d.y * T, t, wind));
            else {
              const sp = R.rockSprite(d.size, d.sd);
              out.push({ y: d.y * T, draw: (g) => R.draw(g, sp, d.x * T, d.y * T), shadow: (g, sun) => this.shadowEllipse(g, d.x * T, d.y * T, sp.r * 1.4, sp.r * 0.5, sun, sp.r) });
            }
          }
        } else if (['arbre', 'palmier', 'fougere'].includes(b.type)) {
          const kind = b.type === 'arbre' ? 'araucaria' : b.type;
          out.push(this.treeObj(kind, b.seed, 1, bx + T / 2, by + T * 0.75, t, wind));
        } else {
          const sp = R.buildingSprite(b.type, b.level);
          const info = sp.info;
          out.push({
            y: by + bh - (b.type === 'banc' || b.type === 'poubelle' ? 12 : 2),
            draw: (g) => {
              g.drawImage(sp.c, bx - sp.ox, by - sp.oy, sp.w, sp.h);
              if (!game.isConnected(b) && def.cat === 'service') self.warnIcon(g, bx + bw / 2, by - 30, t);
            },
            shadow: (g, sun) => this.shadowRect(g, bx, by, bw, bh, info.h || 20, sun)
          });
          for (const l of info.lights) this.lights.push([bx + l[0], by + l[1], l[2], l[3]]);
          if (info.smoke && Math.random() < 0.06) for (const sm of info.smoke) this.addP({ k: 'smoke', x: bx + sm[0], y: by + sm[1], vx: 2, vy: -10, s: 3, life: 0, max: 3 });
          if (info.fountain && Math.random() < 0.7) {
            for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; this.addP({ k: 'jet', x: bx + info.fountain[0], y: by + info.fountain[1], vx: Math.cos(a) * 9, vy: -40 - Math.random() * 10, z: -16, life: 0, max: 2 }); }
          }
        }
      }
      // dinosaures
      for (const d of game.dinos) {
        const x = d.x * T, y = d.y * T;
        if (!vis(x, y, 160)) continue;
        out.push(this.dinoObj(d, x, y, t));
      }
      // visiteurs
      const frames = R.PEOPLE_FRAMES;
      for (const grp of game.visitors) {
        if (grp.hidden) continue;
        const x = grp.x * T, y = grp.y * T;
        if (!vis(x, y, 30)) continue;
        const n = grp.members.length;
        const moving = grp.state === 'walk' || grp.state === 'wander' || grp.state === 'enter' || grp.state === 'exit';
        const px = -grp.dirY, py = grp.dirX;
        const flip = grp.dirX < -0.05 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const m = grp.members[i];
          const off = (i - (n - 1) / 2) * 7.5;
          const back = m.child ? -2 : 0;
          const mx = x + px * off + grp.dirX * back, my = y + py * off * 0.6 + grp.dirY * back;
          const fr = moving ? Math.floor((grp.wd * 4.2 + m.ph) % frames) : frames;
          const sp = R.personSprite(m.child, m.v, fr);
          out.push({
            y: my,
            draw: (g) => { if (flip < 0) { g.save(); g.translate(mx, my); g.scale(-1, 1); g.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h); g.restore(); } else g.drawImage(sp.c, mx - sp.ox, my - sp.oy, sp.w, sp.h); },
            shadow: (g, sun) => this.shadowEllipse(g, mx, my, 4, 1.8, sun, 6)
          });
        }
      }
      return out;
    }

    treeObj(kind, seed, sc, x, y, t, wind) {
      const tr = R.treeSprite(kind, seed);
      const ph = seed % 100;
      return {
        y,
        draw: (g) => {
          const sway = Math.sin(t * 1.3 + ph + x * 0.01) * 0.035 * wind + Math.sin(t * 2.7 + ph) * 0.012 * wind;
          g.save(); g.translate(x, y); g.scale(sc, sc);
          if (tr.whole) {
            g.transform(1, 0, sway * 0.9, 1, 0, 0);
            g.drawImage(tr.whole.c, -tr.whole.ox, -tr.whole.oy, tr.whole.w, tr.whole.h);
          } else {
            g.drawImage(tr.trunk.c, -tr.trunk.ox, -tr.trunk.oy, tr.trunk.w, tr.trunk.h);
            g.translate(tr.crownX, tr.crownY); g.rotate(sway);
            g.drawImage(tr.crown.c, -tr.crown.ox, -tr.crown.oy, tr.crown.w, tr.crown.h);
          }
          g.restore();
        },
        shadow: (g, sun) => this.shadowEllipse(g, x, y, tr.shadowR * sc, tr.shadowR * 0.45 * sc, sun, tr.height * sc)
      };
    }

    dinoObj(d, x, y, t) {
      const rig = R.dinoRig(d.sp);
      const sp = DZ.SPECIES[d.sp];
      const self = this;
      if (sp.habitat === 'air') {
        return {
          y: y,
          draw: (g) => {
            R.drawPtero(g, rig, d, t, x, y, d.alt);
            if (d.sick) self.sickIcon(g, x, y - d.alt - 20, t);
            if (self.selected && self.selected.kind === 'dino' && self.selected.id === d.id) self.ring(g, x, y, rig.span * 0.5, t);
          },
          shadow: (g, sun) => this.shadowEllipse(g, x + sun.dx * d.alt * 0.4, y, rig.span * 0.45, rig.span * 0.12, sun, 0, 0.5)
        };
      }
      if (sp.habitat === 'water') {
        return {
          y: y - 30,
          draw: (g) => {
            R.drawMarine(g, rig, d, t, x, y, 'wet', 0.78 * (1 - d.surf * 0.5));
            if (d.surf > 0.05) R.drawMarine(g, rig, d, t, x, y, 'dry', d.surf);
            if (d.surf > 0.4 && Math.random() < 0.05) self.addP({ k: 'ring', x: x + Math.cos(d.heading) * 10, y, life: 0, max: 1.2, s: 5 });
            if (d.sick) self.sickIcon(g, x, y - 26, t);
            if (self.selected && self.selected.kind === 'dino' && self.selected.id === d.id) self.ring(g, x, y, rig.len * 0.4, t);
          }
        };
      }
      return {
        y,
        draw: (g) => {
          R.drawSideDino(g, rig, d, t, { x, y });
          // poussière sous les pas des gros dinosaures
          if (d.moving > 0 && C.dinos[d.sp].space >= 4) {
            const s = Math.sin(d.phase) > 0;
            const prev = self._footState.get(d.id);
            if (prev !== undefined && prev !== s && Math.random() < 0.8) self.addP({ k: 'dust', x: x + (Math.random() - 0.5) * rig.len * 0.3, y: y + 1, vx: (Math.random() - 0.5) * 12, vy: -3, life: 0, max: 1.1, s: 3 + C.dinos[d.sp].space * 0.5 });
            self._footState.set(d.id, s);
          }
          if (d.sick) self.sickIcon(g, x, y - rig.height - 12, t);
          if (d.state === 'roar' && d.anim < 0.3 && C.dinos[d.sp].space >= 5 && Math.random() < 0.3) self.burst(x, y, 20, 'dust');
          if (self.selected && self.selected.kind === 'dino' && self.selected.id === d.id) self.ring(g, x, y, rig.len * 0.42, t);
        },
        shadow: (g, sun) => this.shadowEllipse(g, x, y, rig.len * 0.42, Math.max(3, rig.len * 0.1), sun, rig.height * 0.7)
      };
    }

    shadowEllipse(g, x, y, rx, ry, sun, height, alpha) {
      const off = height * sun.len * 0.5;
      const sx = x + sun.dx * off, sy = y + sun.dy * off * 0.3;
      const k = 1 + sun.len * 0.3;
      g.globalAlpha = (alpha || 1) * this._shadowAlpha(sun);
      g.drawImage(R.tex.shadow, sx - rx * k, sy - ry, rx * 2 * k, ry * 2);
      // occlusion ambiante au pied
      g.drawImage(R.tex.shadow, x - rx * 0.6, y - ry * 0.6, rx * 1.2, ry * 1.2);
      g.globalAlpha = this._shadowAlpha(sun);
    }
    _shadowAlpha(sun) { return sun.alpha; }

    shadowRect(g, x, y, w, h, height, sun) {
      const off = height * sun.len * 0.6;
      g.globalAlpha = sun.alpha * 0.85;
      g.drawImage(R.tex.shadow, x + sun.dx * off - 10, y + h * 0.3, w + 20 + Math.abs(sun.dx) * off, h * 0.9);
      g.globalAlpha = sun.alpha;
    }

    ring(g, x, y, r, t) {
      g.save();
      g.strokeStyle = `rgba(255,236,170,${0.6 + Math.sin(t * 5) * 0.3})`;
      g.lineWidth = 1.6;
      g.setLineDash([5, 4]); g.lineDashOffset = -t * 20;
      g.beginPath(); g.ellipse(x, y, r, r * 0.32, 0, 0, TAU); g.stroke();
      g.restore();
    }
    sickIcon(g, x, y, t) {
      const b = Math.sin(t * 3) * 2;
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(x, y + b, 6, 0, TAU); g.fill();
      g.fillStyle = '#4c9a5a'; g.fillRect(x - 1.2, y + b - 4, 2.4, 8); g.fillRect(x - 4, y + b - 1.2, 8, 2.4);
    }
    warnIcon(g, x, y, t) {
      const b = Math.sin(t * 3) * 1.5;
      g.fillStyle = '#e8b030'; g.beginPath(); g.moveTo(x, y - 7 + b); g.lineTo(x + 7, y + 5 + b); g.lineTo(x - 7, y + 5 + b); g.closePath(); g.fill();
      g.fillStyle = '#2a1e10'; g.fillRect(x - 0.9, y - 3 + b, 1.8, 5); g.fillRect(x - 0.9, y + 3 + b, 1.8, 1.6);
    }

    drawParticles(g, night) {
      for (const p of this.particles) {
        const k = p.life / p.max;
        switch (p.k) {
          case 'coin': {
            g.globalAlpha = 1 - k * k;
            const sq = Math.abs(Math.cos(p.life * 8));
            const gr = g.createRadialGradient(p.x - 1, p.y - 1, 0, p.x, p.y, 3.4);
            gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.6, '#e2b23a'); gr.addColorStop(1, '#9a6a1a');
            g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, 3.2 * sq + 0.6, 3.2, 0, 0, TAU); g.fill();
            if (p.text && this.cam.zoom > 0.8) { g.font = '600 6px "Trebuchet MS", sans-serif'; g.fillStyle = '#fff6d0'; g.strokeStyle = 'rgba(60,40,10,0.7)'; g.lineWidth = 1.6; g.textAlign = 'center'; g.strokeText(p.text, p.x + 9, p.y - 2); g.fillText(p.text, p.x + 9, p.y - 2); }
            break;
          }
          case 'spark': {
            g.globalAlpha = 1 - k;
            g.fillStyle = k < 0.5 ? '#fff8d8' : '#f2c75a';
            const s = p.s * (1 - k * 0.5);
            g.beginPath(); g.moveTo(p.x, p.y - s * 2); g.lineTo(p.x + s * 0.5, p.y); g.lineTo(p.x, p.y + s * 2); g.lineTo(p.x - s * 0.5, p.y); g.closePath(); g.fill();
            g.beginPath(); g.moveTo(p.x - s * 2, p.y); g.lineTo(p.x, p.y + s * 0.5); g.lineTo(p.x + s * 2, p.y); g.lineTo(p.x, p.y - s * 0.5); g.closePath(); g.fill();
            break;
          }
          case 'dust': g.globalAlpha = (1 - k) * 0.4; g.fillStyle = '#b8a07a'; g.beginPath(); g.arc(p.x, p.y, p.s * (0.6 + k), 0, TAU); g.fill(); break;
          case 'smoke': g.globalAlpha = (1 - k) * 0.35; g.fillStyle = '#c8c4bc'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); break;
          case 'drop': case 'jet': g.globalAlpha = 0.8; g.fillStyle = '#e8f6ff'; g.beginPath(); g.arc(p.x, p.y + p.z, p.k === 'jet' ? 1 : 1.3, 0, TAU); g.fill(); break;
          case 'ring': g.globalAlpha = (1 - k) * 0.6; g.strokeStyle = '#e8f6f4'; g.lineWidth = 1; g.beginPath(); g.ellipse(p.x, p.y, p.s + k * 16, (p.s + k * 16) * 0.4, 0, 0, TAU); g.stroke(); break;
          case 'leaf': {
            g.globalAlpha = Math.min(1, (1 - k) * 3) * 0.9;
            g.save(); g.translate(p.x, p.y + (p.z || 0)); g.rotate(p.rot); g.scale(1, Math.abs(Math.sin(p.rot)) * 0.7 + 0.3);
            g.fillStyle = p.col; g.beginPath(); g.ellipse(0, 0, 2.6, 1.2, 0, 0, TAU); g.fill(); g.restore();
            break;
          }
          case 'fly': {
            g.globalAlpha = Math.min(1, (1 - k) * 3, k * 5);
            const f = Math.abs(Math.sin(p.life * 22));
            g.fillStyle = p.col;
            g.beginPath(); g.ellipse(p.x - 1.4 * f, p.y - 12, 1.6 * f + 0.3, 1.2, 0, 0, TAU); g.ellipse(p.x + 1.4 * f, p.y - 12, 1.6 * f + 0.3, 1.2, 0, 0, TAU); g.fill();
            break;
          }
          default: break;
        }
      }
      g.globalAlpha = 1;
    }

    drawBubbles(g, t) {
      const z = this.cam.zoom;
      if (z < 0.6) return;
      for (const grp of this.game.visitors) {
        if (grp.hidden || grp.bubbleT <= 0) continue;
        const x = grp.x * T, y = grp.y * T;
        if (!this.isVisible(x, y, 20)) continue;
        const sp = R.moodSprite(grp.mood);
        g.globalAlpha = Math.min(1, grp.bubbleT * 2);
        g.drawImage(sp.c, x - sp.ox, y - 20 - sp.oy + Math.sin(t * 4 + grp.id) * 0.8, sp.w, sp.h);
      }
      g.globalAlpha = 1;
    }

    drawLighting(g, hour, night, storm, t, Q, objs) {
      const W2 = this.vw, H2 = this.vh;
      const L = lightAt(hour);
      let mul = L.mul;
      if (storm > 0) mul = U.mixRgb(mul, [118, 128, 142], storm * 0.55);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = U.css(mul);
      g.fillRect(0, 0, W2, H2);
      g.globalCompositeOperation = 'screen';
      if (L.a > 0) { g.globalAlpha = L.a * (1 - storm); g.fillStyle = U.css(L.add); g.fillRect(0, 0, W2, H2); }
      g.globalAlpha = 1;
      // rayons de soleil à travers la canopée
      if (Q.godRays && night < 0.2 && storm < 0.2 && hour > 7.5 && hour < 18) {
        const ang = 0.5 + (hour - 12) * 0.05;
        g.save();
        for (let i = 0; i < 5; i++) {
          const base = ((i * 0.23 + t * 0.004) % 1.2 - 0.1) * W2;
          const w = 50 + (i % 3) * 40;
          const a = 0.05 + 0.03 * Math.sin(t * 0.3 + i * 2);
          const gr = g.createLinearGradient(0, 0, 0, H2);
          gr.addColorStop(0, `rgba(255,240,200,${a})`); gr.addColorStop(1, 'rgba(255,240,200,0)');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(base, -10); g.lineTo(base + w, -10); g.lineTo(base + w + Math.tan(ang) * H2, H2); g.lineTo(base + Math.tan(ang) * H2 - w * 0.5, H2); g.closePath(); g.fill();
        }
        g.restore();
      }
      // lumières nocturnes
      const lampK = Math.max(night, storm * 0.6);
      if (lampK > 0.02) {
        g.globalCompositeOperation = 'lighter';
        const z = this.cam.zoom;
        for (const l of this.lights) {
          const p = this.worldToScreen(l[0], l[1]);
          const r = l[2] * z * 1.6;
          if (p.x < -r || p.y < -r || p.x > W2 + r || p.y > H2 + r) continue;
          g.globalAlpha = lampK * 0.75;
          g.drawImage(R.tex.glow, p.x - r, p.y - r, r * 2, r * 2);
        }
        // lucioles
        g.fillStyle = '#e8ffb0';
        for (const p of this.particles) {
          if (p.k !== 'firefly') continue;
          const s = this.worldToScreen(p.x + Math.cos(p.life + p.seed) * 6, p.y + Math.sin(p.life * 1.3) * 5 - 10);
          const k = p.life / p.max;
          g.globalAlpha = (0.4 + 0.6 * Math.max(0, Math.sin(p.life * 3 + p.seed))) * Math.min(1, (1 - k) * 3, k * 4) * night;
          g.drawImage(R.tex.glow, s.x - 8 * z, s.y - 8 * z, 16 * z, 16 * z);
        }
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = 'source-over';
      // brume du matin et des orages
      const fog = Math.max(storm * 0.35, hour < 8 ? (8 - hour) / 2 * 0.22 : 0);
      if (fog > 0.01 && Q.particles > 100) {
        g.save();
        g.globalAlpha = fog;
        g.globalCompositeOperation = 'screen';
        const s = 3 * this.cam.zoom;
        const ox = (t * 6) % (256 * s), oy = (t * 2) % (256 * s);
        for (let y = -256 * s; y < H2 + 256 * s; y += 256 * s) for (let x = -256 * s; x < W2 + 256 * s; x += 256 * s) g.drawImage(R.tex.fog, x + ox, y + oy, 256 * s, 256 * s);
        g.restore();
      }
      // pluie
      if (storm > 0.01) {
        const n = Math.round(storm * (Q.particles > 300 ? 380 : Q.particles > 100 ? 200 : 90));
        while (this.rain.length < n) this.rain.push({ x: Math.random() * W2, y: Math.random() * H2, v: 500 + Math.random() * 300, l: 8 + Math.random() * 10 });
        this.rain.length = Math.min(this.rain.length, n);
        g.strokeStyle = 'rgba(200,215,230,0.45)'; g.lineWidth = 1;
        g.beginPath();
        const dt = 1 / 60;
        for (const d of this.rain) {
          d.y += d.v * dt; d.x -= d.v * 0.25 * dt;
          if (d.y > H2) { d.y = -20; d.x = Math.random() * (W2 + 100); }
          g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.25, d.y - d.l);
        }
        g.stroke();
        if (storm > 0.6 && Math.random() < 0.002) { this.flash = 1; this.game.emit('thunder'); }
      } else this.rain.length = 0;
      if (this.flash > 0) {
        g.fillStyle = `rgba(235,240,255,${this.flash * 0.5})`; g.fillRect(0, 0, W2, H2);
        this.flash = Math.max(0, this.flash - 0.06);
      }
      // vignettage doux
      const vg = g.createRadialGradient(W2 / 2, H2 / 2, Math.min(W2, H2) * 0.45, W2 / 2, H2 / 2, Math.max(W2, H2) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,15,8,0.28)');
      g.fillStyle = vg; g.fillRect(0, 0, W2, H2);
    }

    drawOverlays(g, t) {
      const game = this.game;
      // enclos valides lors du placement d'un dinosaure
      if (this.highlightEnclosures) {
        for (const id in game.buildings) {
          const b = game.buildings[id];
          if (!game.isEnclosure(b)) continue;
          const ok = this.highlightEnclosures(b);
          g.fillStyle = ok ? 'rgba(120,220,140,0.16)' : 'rgba(220,90,70,0.10)';
          g.strokeStyle = ok ? 'rgba(150,240,160,0.8)' : 'rgba(230,110,90,0.5)';
          g.lineWidth = 2;
          g.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
          g.strokeRect(b.x * T + 1, b.y * T + 1, b.w * T - 2, b.h * T - 2);
        }
      }
      // sélection
      if (this.selected && this.selected.kind === 'building') {
        const b = game.buildings[this.selected.id];
        if (b) {
          g.save();
          g.strokeStyle = `rgba(255,236,170,${0.7 + Math.sin(t * 5) * 0.3})`;
          g.lineWidth = 2; g.setLineDash([8, 5]); g.lineDashOffset = -t * 24;
          g.strokeRect(b.x * T + 1, b.y * T + 1, b.w * T - 2, b.h * T - 2);
          g.restore();
        }
      }
      const gh = this.ghost;
      if (gh) {
        if (gh.kind === 'tile') {
          g.fillStyle = gh.ok ? 'rgba(255,240,200,0.25)' : 'rgba(230,80,60,0.3)';
          g.strokeStyle = gh.ok ? 'rgba(255,240,200,0.9)' : 'rgba(240,100,80,0.9)';
          g.lineWidth = 1.5;
          g.fillRect(gh.x * T, gh.y * T, T, T); g.strokeRect(gh.x * T + 0.5, gh.y * T + 0.5, T - 1, T - 1);
        } else if (gh.kind === 'building') {
          const def = C.buildings[gh.type];
          g.globalAlpha = 0.6;
          if (def.cat === 'enclos') {
            const fake = { id: 'ghost', type: gh.type, w: def.w, h: def.h, level: gh.level || 1, seed: 1, x: gh.x, y: gh.y };
            const art = R.enclosureArt(fake);
            R.draw(g, art.back, gh.x * T, gh.y * T);
            R.draw(g, art.front, gh.x * T, gh.y * T);
          } else if (['arbre', 'palmier', 'fougere'].includes(gh.type)) {
            const tr = R.treeSprite(gh.type === 'arbre' ? 'araucaria' : gh.type, 1);
            const x = gh.x * T + T / 2, y = gh.y * T + T * 0.75;
            if (tr.whole) R.draw(g, tr.whole, x, y); else { R.draw(g, tr.trunk, x, y); R.draw(g, tr.crown, x + tr.crownX, y + tr.crownY); }
          } else {
            const sp = R.buildingSprite(gh.type, gh.level || 1);
            g.drawImage(sp.c, gh.x * T - sp.ox, gh.y * T - sp.oy, sp.w, sp.h);
          }
          g.globalAlpha = 1;
          g.fillStyle = gh.ok ? 'rgba(120,230,140,0.22)' : 'rgba(230,80,60,0.3)';
          g.strokeStyle = gh.ok ? 'rgba(150,240,160,0.95)' : 'rgba(240,100,80,0.95)';
          g.lineWidth = 2;
          g.fillRect(gh.x * T, gh.y * T, def.w * T, def.h * T);
          g.strokeRect(gh.x * T + 1, gh.y * T + 1, def.w * T - 2, def.h * T - 2);
          // indique les cases de chemin adjacentes
          if (gh.ok && def.cat !== 'deco') {
            const b = { x: gh.x, y: gh.y, w: def.w, h: def.h, _accV: -1 };
            const acc = game.accessTiles(b);
            g.fillStyle = acc.length ? 'rgba(150,240,160,0.35)' : 'rgba(0,0,0,0)';
            for (const i of acc) g.fillRect((i % W) * T + 4, Math.floor(i / W) * T + 4, T - 8, T - 8);
          }
        } else if (gh.kind === 'demolish') {
          const b = gh.building;
          g.fillStyle = 'rgba(220,60,40,0.3)'; g.strokeStyle = 'rgba(240,90,70,0.95)'; g.lineWidth = 2;
          if (b) { g.fillRect(b.x * T, b.y * T, b.w * T, b.h * T); g.strokeRect(b.x * T + 1, b.y * T + 1, b.w * T - 2, b.h * T - 2); }
          else { g.fillRect(gh.x * T, gh.y * T, T, T); g.strokeRect(gh.x * T + 1, gh.y * T + 1, T - 2, T - 2); }
        }
      }
    }

    /* ---------- Sélection ---------- */
    pickDino(wx, wy) {
      let best = null, bd = 1e9;
      for (const d of this.game.dinos) {
        const rig = R.dinoRig(d.sp);
        const sp = DZ.SPECIES[d.sp];
        const x = d.x * T, y = d.y * T - (sp.habitat === 'air' ? d.alt : 0);
        const hw = (rig.len || 40) * 0.5, hh = sp.habitat === 'land' ? rig.height : 14;
        if (wx > x - hw && wx < x + hw && wy > y - hh && wy < y + 8) {
          const dd = Math.abs(wy - y);
          if (dd < bd) { bd = dd; best = d; }
        }
      }
      return best;
    }
  }

  R.Renderer = Renderer;
})();
