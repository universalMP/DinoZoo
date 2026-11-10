/* =====================================================================
   DinoZoo — Rendu : terrain statique mis en cache dans un canvas hors
   écran (sol, eau, berges, chemins, ponts, sols d'enclos).
   Seules les zones modifiées sont redessinées.
   ===================================================================== */
(function () {
  const U = DZ.util, R = DZ.R, C = DZ.CONFIG, PAL = C.palette;
  const T = C.map.tile, M = C.map.margin, W = C.map.w, H = C.map.h;
  const TER = DZ.TER;

  class TerrainCache {
    constructor(game) {
      this.game = game;
      this.scale = 1.25;
      this.CH = 16;
      this.chunks = [];
      for (let y = -M; y < H + M; y += this.CH) for (let x = -M; x < W + M; x += this.CH) {
        this.chunks.push({ x0: x, y0: y, x1: Math.min(x + this.CH, W + M), y1: Math.min(y + this.CH, H + M), dirty: true, canvas: null, used: 0, waterPath: null, foam: [] });
      }
    }

    /* La carte étant très grande, chaque tronçon est cuit à la demande. */
    setScale(s) { this.scale = Math.min(s, 1.25); for (const c of this.chunks) { c.canvas = null; c.dirty = true; } }
    full() { this._tint = null; this._depth = null; for (const c of this.chunks) c.dirty = true; }
    bake(region) {
      for (const c of this.chunks) if (c.x1 > region.x0 - 2 && c.x0 <= region.x1 + 2 && c.y1 > region.y0 - 2 && c.y0 <= region.y1 + 2) c.dirty = true;
    }

    /* Tronçons visibles (cuits si nécessaire, dans la limite d'un budget). */
    visible(view, budget, frame) {
      const out = [];
      const x0 = view.x0 / T - 1, y0 = view.y0 / T - 1, x1 = view.x1 / T + 1, y1 = view.y1 / T + 3;
      for (const c of this.chunks) {
        if (c.x1 < x0 || c.x0 > x1 || c.y1 < y0 || c.y0 > y1) continue;
        if (c.dirty && budget > 0) { this.bakeChunk(c); budget--; }
        c.used = frame;
        if (c.canvas) out.push(c);
      }
      // mémoire bornée : on libère les tronçons les plus anciens
      const live = this.chunks.filter((c) => c.canvas);
      if (live.length > 56) { live.sort((a, b) => a.used - b.used); for (const c of live.slice(0, live.length - 56)) { c.canvas = null; c.dirty = true; } }
      return out;
    }

    bakeChunk(c) {
      const s = this.scale;
      if (!c.canvas) { c.canvas = R.canvas((c.x1 - c.x0) * T * s, (c.y1 - c.y0) * T * s); c.ctx = c.canvas.getContext('2d'); }
      const g = c.ctx;
      g.__pat = null;
      g.save();
      g.setTransform(s, 0, 0, s, -c.x0 * T * s, -c.y0 * T * s);
      this.bakeInto(g, c.x0, c.y0, c.x1 - 1, c.y1 - 1);
      g.restore();
      this.buildWaterPath(c);
      c.dirty = false;
    }

    terr(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      return this.game.terrain[y * W + x];
    }

    pat(g, name) {
      const p = R.pattern(g, name);
      if (p.setTransform && !p.__scaled) { p.setTransform(new DOMMatrix().scale(name === 'paving' ? 0.34 : 0.5)); p.__scaled = true; }
      return p;
    }

    tintMap() {
      if (this._tint) return this._tint;
      const c = R.canvas(W + 2 * M, H + 2 * M), g = c.getContext('2d');
      const seed = this.game.s.seed;
      for (let y = 0; y < H + 2 * M; y++) for (let x = 0; x < W + 2 * M; x++) {
        const h = U.hash(x, y, seed);
        g.fillStyle = h < 0.5 ? `rgba(20,30,0,${(0.5 - h) * 0.32})` : `rgba(200,200,120,${(h - 0.5) * 0.16})`;
        g.fillRect(x, y, 1, 1);
      }
      this._tint = c;
      return c;
    }

    /* Dessine le terrain des cases [x0..x1] × [y0..y1] (repère monde). */
    bakeInto(g, x0, y0, x1, y1) {
      const game = this.game;
      g.save();
      g.beginPath(); g.rect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T); g.clip();
      const ex0 = x0 - 1, ey0 = y0 - 1, ex1 = x1 + 1, ey1 = y1 + 1;
      // 1. herbe de base, jungle autour
      g.fillStyle = this.pat(g, 'grass');
      g.fillRect(x0 * T, y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
      g.fillStyle = this.pat(g, 'jungle');
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x < 0 || y < 0 || x >= W || y >= H) g.fillRect(x * T, y * T, T, T);
      // fondu entre carte et jungle
      const fade = (x, y, w, h, dir) => {
        const gr = dir === 'h' ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, 'rgba(20,32,14,0.55)'); gr.addColorStop(1, 'rgba(20,32,14,0)');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
      };
      fade(0, 0, T * 0.9, H * T, 'h'); fade(0, 0, W * T, T * 0.9, 'v');
      g.save(); g.translate(W * T, 0); g.scale(-1, 1); fade(0, 0, T * 0.9, H * T, 'h'); g.restore();
      // variation de teinte à grande échelle
      g.imageSmoothingEnabled = true;
      g.drawImage(this.tintMap(), -M * T, -M * T, (W + 2 * M) * T, (H + 2 * M) * T);
      // 2. taches de terre, sable et roche (bords doux par cercles concentriques)
      const blob = (name, x, y, rad, alpha) => {
        g.fillStyle = this.pat(g, name);
        for (const [k, a] of [[1.2, 0.22], [1.0, 0.45], [0.82, 1]]) {
          g.globalAlpha = a * alpha;
          g.beginPath(); g.arc((x + 0.5) * T + (U.hash(x, y, 3) - 0.5) * 6, (y + 0.5) * T + (U.hash(x, y, 4) - 0.5) * 6, rad * k * T, 0, U.TAU); g.fill();
        }
        g.globalAlpha = 1;
      };
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) if (this.terr(x, y) === TER.DIRT) blob('grassDry', x, y, 1.0, 0.85);
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) if (this.terr(x, y) === TER.DIRT && U.hash(x, y, 21) < 0.55) blob('dirt', x, y, 0.8, 0.55);
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) if (this.terr(x, y) === TER.SAND || this.terr(x, y) === TER.WATER) blob('sand', x, y, 1.05, 1);
      // 3. détails au sol
      for (let y = Math.max(0, ey0); y <= Math.min(H - 1, ey1); y++) for (let x = Math.max(0, ex0); x <= Math.min(W - 1, ex1); x++) {
        const t = this.terr(x, y);
        if (t !== TER.GRASS) continue;
        const h = U.hash(x, y, 77);
        const r = U.rng((x * 928371 + y * 1237) ^ game.s.seed);
        const tufts = 2 + Math.floor(h * 4);
        for (let i = 0; i < tufts; i++) {
          const px = x * T + r() * T, py = y * T + r() * T;
          g.strokeStyle = U.alpha(PAL.grassBlade[(r() * 4) | 0], 0.7);
          g.lineWidth = 0.7;
          for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(px + k - 2, py); g.quadraticCurveTo(px + k - 2 + (r() - 0.5) * 2, py - 3, px + (k - 2) * 1.6 + (r() - 0.5) * 3, py - 5 - r() * 3); g.stroke(); }
        }
        if (h > 0.82) { // petites fleurs
          for (let i = 0; i < 4; i++) { g.fillStyle = U.pick(r, ['#e8e0b8', '#d8a85a', '#c88a8a', '#b8c8e0']); g.beginPath(); g.arc(x * T + r() * T, y * T + r() * T, 1, 0, U.TAU); g.fill(); }
        }
        if (h < 0.08) R.draw(g, R.rockSprite('S', (x * 31 + y) | 0), x * T + T * 0.5, y * T + T * 0.6);
      }
      // 4. roche
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) if (this.terr(x, y) === TER.ROCK) blob('rock', x, y, 0.9, 1);
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) if (this.terr(x, y) === TER.ROCK) {
        const h = U.hash(x, y, 9);
        R.draw(g, R.rockSprite(h < 0.5 ? 'L' : 'M', (x * 7 + y * 3) | 0), x * T + T * (0.3 + h * 0.4), y * T + T * 0.75);
      }
      // 5. eau
      this.drawWater(g, ex0, ey0, ex1, ey1);
      // 6. sols d'enclos et emprises des bâtiments
      for (const id in game.buildings) {
        const b = game.buildings[id];
        if (b.x + b.w < ex0 || b.x > ex1 || b.y + b.h < ey0 || b.y > ey1) continue;
        this.drawFloor(g, b);
      }
      // 7. chemins et ponts
      for (let y = Math.max(0, ey0); y <= Math.min(H - 1, ey1); y++) for (let x = Math.max(0, ex0); x <= Math.min(W - 1, ex1); x++) {
        if (game.isPath(x, y)) this.drawPath(g, x, y);
      }
      g.restore();
    }

    drawWater(g, x0, y0, x1, y1) {
      const game = this.game;
      // profondeur : distance à la terre
      if (!this._depth || this._depthV !== game.s.seed) {
        const d = new Uint8Array(W * H);
        const q = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (this.terr(x, y) !== TER.WATER) continue;
          let edge = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = this.terr(x + dx, y + dy); if (t !== TER.WATER && t !== -1) edge = true; }
          if (edge) { d[y * W + x] = 1; q.push([x, y]); }
        }
        while (q.length) {
          const [x, y] = q.shift();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (this.terr(nx, ny) === TER.WATER && !d[ny * W + nx]) { d[ny * W + nx] = d[y * W + x] + 1; q.push([nx, ny]); }
          }
        }
        this._depth = d; this._depthV = game.s.seed;
      }
      const depth = this._depth;
      const isW = (x, y) => { const t = this.terr(x, y); return t === TER.WATER || (t === -1 && this.edgeWater(x, y)); };
      const tiles = [];
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (isW(x, y)) tiles.push([x, y]);
      if (!tiles.length) return;
      // berge humide
      g.fillStyle = 'rgba(70,58,38,0.3)';
      for (const [x, y] of tiles) { g.beginPath(); g.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.95, 0, U.TAU); g.fill(); }
      // forme de l'eau
      const shape = new Path2D();
      for (const [x, y] of tiles) {
        shape.moveTo((x + 0.5) * T + T * 0.72, (y + 0.5) * T);
        shape.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.72, 0, U.TAU);
        if (isW(x + 1, y)) shape.rect((x + 0.5) * T, (y + 0.5) * T - T * 0.72, T, T * 1.44);
        if (isW(x, y + 1)) shape.rect((x + 0.5) * T - T * 0.72, (y + 0.5) * T, T * 1.44, T);
        // adoucit les berges en diagonale
        for (const dx of [-1, 1]) if (isW(x + dx, y + 1) && !(isW(x + dx, y) && isW(x, y + 1))) {
          const mx = (x + 0.5 + dx * 0.5) * T, my = (y + 1) * T;
          shape.moveTo(mx + T * 0.62, my); shape.arc(mx, my, T * 0.62, 0, U.TAU);
        }
      }
      g.save();
      g.clip(shape);
      const P = PAL.water;
      g.fillStyle = P.shallow; g.fillRect((x0 - 2) * T, (y0 - 2) * T, (x1 - x0 + 5) * T, (y1 - y0 + 5) * T);
      for (const [x, y] of tiles) {
        const dd = (x >= 0 && y >= 0 && x < W && y < H) ? depth[y * W + x] : 3;
        if (dd >= 2) {
          const gr = g.createRadialGradient((x + 0.5) * T, (y + 0.5) * T, 0, (x + 0.5) * T, (y + 0.5) * T, T * 1.1);
          const col = dd >= 3 ? P.deep : P.mid;
          gr.addColorStop(0, U.alpha(col, 0.9)); gr.addColorStop(1, U.alpha(col, 0));
          g.fillStyle = gr; g.fillRect(x * T - T * 0.6, y * T - T * 0.6, T * 2.2, T * 2.2);
        } else {
          const gr = g.createRadialGradient((x + 0.5) * T, (y + 0.5) * T, 0, (x + 0.5) * T, (y + 0.5) * T, T * 0.9);
          gr.addColorStop(0, U.alpha(P.mid, 0.55)); gr.addColorStop(1, U.alpha(P.mid, 0));
          g.fillStyle = gr; g.fillRect(x * T - T * 0.4, y * T - T * 0.4, T * 1.8, T * 1.8);
        }
      }
      // fond : cailloux visibles sous l'eau peu profonde
      for (const [x, y] of tiles) {
        const r = U.rng(x * 911 + y * 37);
        for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(60,70,50,0.25)'; g.beginPath(); g.ellipse(x * T + r() * T, y * T + r() * T, 1.5 + r() * 2.5, 1 + r() * 1.5, 0, 0, U.TAU); g.fill(); }
      }
      // reflet du ciel
      const sky = g.createLinearGradient(0, (y0 - 2) * T, 0, (y1 + 3) * T);
      sky.addColorStop(0, 'rgba(220,240,245,0.10)'); sky.addColorStop(1, 'rgba(220,240,245,0.02)');
      g.fillStyle = sky; g.fillRect((x0 - 2) * T, (y0 - 2) * T, (x1 - x0 + 5) * T, (y1 - y0 + 5) * T);
      g.restore();
    }

    edgeWater(x, y) {
      // prolonge la rivière hors de la carte
      const cx = U.clamp(x, 0, W - 1), cy = U.clamp(y, 0, H - 1);
      return this.terr(cx, cy) === TER.WATER;
    }

    drawFloor(g, b) {
      const def = C.buildings[b.type];
      const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
      const r = U.rng(b.seed + b.level * 13);
      if (def.cat === 'enclos') {
        g.save();
        g.beginPath();
        for (const [px, py, pw, ph] of DZ.encParts(b)) g.rect(px * T + 1, py * T + 1, pw * T - 2, ph * T - 2);
        if (b.parts) for (let i = 0; i < b.parts.length; i++) for (let j = 0; j < b.parts.length; j++) { // pas de liseré entre deux parties
          const p = b.parts[i], q = b.parts[j];
          if (p[0] + p[2] === q[0]) g.rect(q[0] * T - 2, Math.max(p[1], q[1]) * T + 1, 4, (Math.min(p[1] + p[3], q[1] + q[3]) - Math.max(p[1], q[1])) * T - 2);
          if (p[1] + p[3] === q[1]) g.rect(Math.max(p[0], q[0]) * T + 1, q[1] * T - 2, (Math.min(p[0] + p[2], q[0] + q[2]) - Math.max(p[0], q[0])) * T - 2, 4);
        }
        g.clip();
        if (def.kind === 'water') {
          const rim = b.level === 1 ? 'sand' : 'concrete';
          g.fillStyle = this.pat(g, rim); g.fillRect(x, y, w, h);
          if (b.level === 3) { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < w; i += 8) g.fillRect(x + i, y, 0.6, h); }
          const inset = b.level === 1 ? 7 : 6;
          const gr = g.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, Math.max(w, h) * 0.6);
          gr.addColorStop(0, PAL.water.deep); gr.addColorStop(0.7, PAL.water.mid); gr.addColorStop(1, PAL.water.shallow);
          g.fillStyle = gr;
          this.roundRect(g, x + inset, y + inset, w - inset * 2, h - inset * 2, b.level === 1 ? 22 : 8); g.fill();
          g.strokeStyle = b.level === 1 ? 'rgba(80,65,40,0.5)' : 'rgba(60,60,60,0.5)'; g.lineWidth = 2; g.stroke();
        } else {
          const base = def.kind === 'air' ? 'grass' : b.level === 3 ? 'grassLush' : b.level === 2 ? 'grass' : 'grassDry';
          g.fillStyle = this.pat(g, base); g.fillRect(x, y, w, h);
          // zones de terre battue
          const spots = Math.round(b.w * b.h / (b.level === 1 ? 2.5 : 5));
          g.fillStyle = this.pat(g, b.level === 1 ? 'dirt' : 'mud');
          for (let i = 0; i < spots; i++) {
            const px = x + r() * w, py = y + r() * h, rad = 8 + r() * 16;
            for (const [k, a] of [[1.2, 0.3], [1, 0.6], [0.75, 0.9]]) { g.globalAlpha = a; g.beginPath(); g.ellipse(px, py, rad * k, rad * 0.7 * k, r() * 3, 0, U.TAU); g.fill(); }
          }
          g.globalAlpha = 1;
          // bande piétinée le long de la clôture
          g.strokeStyle = 'rgba(80,60,35,0.35)'; g.lineWidth = 6;
          if (!b.parts) g.strokeRect(x + 4, y + 4, w - 8, h - 8);
          // mare (niveau 2+, enclos moyens et grands)
          if (b.level >= 2 && b.w * b.h >= 20 && def.kind === 'land' && !b.parts) {
            const px = x + w * (0.25 + r() * 0.5), py = y + h * (0.55 + r() * 0.2), rx = 14 + b.w * 2, ry = 9 + b.h;
            g.fillStyle = 'rgba(60,50,30,0.5)'; g.beginPath(); g.ellipse(px, py, rx + 4, ry + 3, 0, 0, U.TAU); g.fill();
            const gr = g.createRadialGradient(px, py, 2, px, py, rx);
            gr.addColorStop(0, PAL.water.mid); gr.addColorStop(1, PAL.water.shallow);
            g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, U.TAU); g.fill();
            g.strokeStyle = 'rgba(220,235,225,0.35)'; g.lineWidth = 1.2; g.stroke();
            b._pond = { x: px, y: py, rx, ry };
          } else b._pond = null;
          if (def.kind === 'air') {
            for (let i = 0; i < 3; i++) { // nids
              const px = x + w * (0.2 + r() * 0.6), py = y + h * (0.3 + r() * 0.5);
              g.strokeStyle = '#7a5a3a'; g.lineWidth = 1.4;
              for (let k = 0; k < 10; k++) { const a = r() * U.TAU; g.beginPath(); g.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 3); g.lineTo(px + Math.cos(a + 1) * 6, py + Math.sin(a + 1) * 3.5); g.stroke(); }
              g.fillStyle = '#e8e0cc'; g.beginPath(); g.ellipse(px, py, 1.6, 1.2, 0, 0, U.TAU); g.fill(); g.beginPath(); g.ellipse(px + 2, py + 0.5, 1.5, 1.1, 0, 0, U.TAU); g.fill();
            }
          } else {
            // mangeoire
            const fx = x + w - 30, fy = y + h - 20;
            g.fillStyle = '#5a4028'; g.fillRect(fx, fy, 20, 8);
            g.fillStyle = '#8a6a40'; g.fillRect(fx, fy, 20, 2);
            g.fillStyle = '#b8a050'; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(fx + 2 + k * 2, fy + 3, 1.6, 1, r(), 0, U.TAU); g.fill(); }
          }
        }
        g.restore();
        // ombre portée des clôtures sur le sol intérieur
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 2, y + 2, w - 4, 5);
      } else if (def.cat === 'service' || b.type === 'entree' || b.type === 'fontaine') {
        g.save();
        g.fillStyle = b.level >= 2 || b.type === 'entree' ? this.pat(g, 'paving') : this.pat(g, 'dirt');
        this.roundRect(g, x + 2, y + 2, w - 4, h - 4, 6); g.fill();
        g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 1.2; g.stroke();
        g.restore();
      }
    }

    roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }

    drawPath(g, x, y) {
      const game = this.game;
      const px = x * T, py = y * T;
      const n = { u: game.isPath(x, y - 1), d: game.isPath(x, y + 1), l: game.isPath(x - 1, y), r: game.isPath(x + 1, y) };
      if (x === C.map.entrance.tileX && y === C.map.entrance.tileY) n.d = true;
      const water = this.terr(x, y) === TER.WATER;
      if (water) {
        // pont de bois
        const vertical = (n.u || n.d) && !(n.l || n.r);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px + 4, py + 6, T - 4, T - 4);
        g.save();
        g.beginPath(); g.rect(px, py, T, T); g.clip();
        g.translate(px + T / 2, py + T / 2); if (vertical) g.rotate(Math.PI / 2);
        g.fillStyle = this.pat(g, 'planks'); g.fillRect(-T / 2, -T / 2 + 4, T, T - 8);
        g.restore();
        g.fillStyle = '#5a3e26';
        if (vertical) { g.fillRect(px + 2, py, 3, T); g.fillRect(px + T - 5, py, 3, T); }
        else { g.fillRect(px, py + 2, T, 3); g.fillRect(px, py + T - 5, T, 3); }
        g.fillStyle = '#3a2818';
        for (const [ox, oy] of [[3, 3], [T - 4, 3], [3, T - 4], [T - 4, T - 4]]) { g.beginPath(); g.arc(px + ox, py + oy, 2.2, 0, U.TAU); g.fill(); }
        return;
      }
      const rad = 9;
      g.save();
      g.beginPath();
      // coins arrondis à l'extérieur
      const tl = !n.u && !n.l, tr = !n.u && !n.r, bl = !n.d && !n.l, br = !n.d && !n.r;
      g.moveTo(px + (tl ? rad : 0), py);
      g.lineTo(px + T - (tr ? rad : 0), py); if (tr) g.quadraticCurveTo(px + T, py, px + T, py + rad);
      g.lineTo(px + T, py + T - (br ? rad : 0)); if (br) g.quadraticCurveTo(px + T, py + T, px + T - rad, py + T);
      g.lineTo(px + (bl ? rad : 0), py + T); if (bl) g.quadraticCurveTo(px, py + T, px, py + T - rad);
      g.lineTo(px, py + (tl ? rad : 0)); if (tl) g.quadraticCurveTo(px, py, px + rad, py);
      g.closePath();
      // ombre de bordure
      g.save(); g.translate(1.2, 1.6); g.fillStyle = 'rgba(30,25,15,0.35)'; g.fill(); g.restore();
      g.fillStyle = this.pat(g, 'paving'); g.fill();
      g.clip();
      // bordures (pierres de rive) côté herbe
      const curb = (x0, y0, w, h) => { g.fillStyle = PAL.curb; g.fillRect(x0, y0, w, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, y0, w, Math.min(h, 0.8)); };
      if (!n.u) curb(px, py, T, 2.6);
      if (!n.d) curb(px, py + T - 2.6, T, 2.6);
      if (!n.l) curb(px, py, 2.6, T);
      if (!n.r) curb(px + T - 2.6, py, 2.6, T);
      // usure au centre
      const gr = g.createRadialGradient(px + T / 2, py + T / 2, 2, px + T / 2, py + T / 2, T * 0.7);
      gr.addColorStop(0, 'rgba(255,245,225,0.08)'); gr.addColorStop(1, 'rgba(60,45,25,0.12)');
      g.fillStyle = gr; g.fillRect(px, py, T, T);
      g.restore();
      // brins d'herbe qui débordent
      const r = U.rng(x * 131 + y * 71);
      g.strokeStyle = U.alpha(PAL.grassBlade[0], 0.8); g.lineWidth = 0.7;
      const blades = (bx, by, dx, dy) => { for (let i = 0; i < 6; i++) { const t = r(); const sx = bx + dx * t * T, sy = by + dy * t * T; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (dy ? 2.5 : (r() - 0.5) * 2) * (bx > px ? -1 : 1), sy + (dx ? 2.5 : (r() - 0.5) * 2) * (by > py ? -1 : 1)); g.stroke(); } };
      if (!n.u) blades(px, py, 1, 0);
      if (!n.d) blades(px, py + T, 1, 0);
      if (!n.l) blades(px, py, 0, 1);
      if (!n.r) blades(px + T, py, 0, 1);
    }

    /* Chemin de découpe de l'eau animée + points d'écume. */
    buildWaterPath(c) {
      const game = this.game;
      const p = new Path2D();
      const foam = [];
      for (let y = c.y0 - 1; y <= c.y1; y++) for (let x = c.x0 - 1; x <= c.x1; x++) {
        const t = this.terr(x, y);
        const water = t === TER.WATER || (t === -1 && this.edgeWater(x, y));
        if (!water || game.isPath(x, y)) continue;
        p.moveTo((x + 0.5) * T + T * 0.7, (y + 0.5) * T);
        p.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.7, 0, U.TAU);
        if (x < c.x0 || y < c.y0 || x >= c.x1 || y >= c.y1) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.terr(x + dx, y + dy);
          if (n !== TER.WATER && n !== -1) foam.push([(x + 0.5 + dx * 0.55) * T, (y + 0.5 + dy * 0.55) * T, dx, dy, U.hash(x, y, dx + dy * 3)]);
        }
      }
      for (const id in game.buildings) {
        const b = game.buildings[id];
        if (b.x + b.w < c.x0 || b.x > c.x1 || b.y + b.h < c.y0 || b.y > c.y1) continue;
        const def = C.buildings[b.type];
        if (def.kind === 'water') { const i = b.level === 1 ? 9 : 8; p.rect(b.x * T + i, b.y * T + i, b.w * T - 2 * i, b.h * T - 2 * i); }
        if (b._pond) p.ellipse(b._pond.x, b._pond.y, b._pond.rx, b._pond.ry, 0, 0, U.TAU);
      }
      c.waterPath = p;
      c.foam = foam;
    }
  }

  R.TerrainCache = TerrainCache;
})();
