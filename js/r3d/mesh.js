/* =====================================================================
   DinoZoo 3D — Constructeur de maillages procéduraux.
   Pile de transformations, couleur et matériau courants, primitives
   (boîte, cylindre, cône, sphère, toit, plaque extrudée, tube) et
   « loft » : une peau organique tendue sur une suite de sections,
   utilisée pour les corps, cous, queues et pattes des dinosaures.
   ===================================================================== */
(function () {
  const G = DZ.G, M4 = G.m4, U = DZ.util;
  const TAU = Math.PI * 2;

  G.MAT = { plain: 0, skin: 1, ground: 2, stone: 3, wood: 4, window: 5, metal: 6, foliage: 7, rock: 8, emissive: 9, eye: 10, cloth: 11, glass: 12 };

  const rgb01 = (c) => { const v = U.rgb(c); return [v[0] / 255, v[1] / 255, v[2] / 255]; };
  G.rgb01 = rgb01;

  class MB {
    constructor() {
      this.v = [];
      this.i = [];
      this.m = M4.create();
      this.stack = [];
      this.c = [1, 1, 1];
      this.mat = 0;
    }
    push() { this.stack.push(M4.copy(this.m)); return this; }
    pop() { this.m = this.stack.pop(); return this; }
    t(x, y, z) { M4.translate(this.m, x, y, z); return this; }
    rx(a) { M4.rotX(this.m, a); return this; }
    ry(a) { M4.rotY(this.m, a); return this; }
    rz(a) { M4.rotZ(this.m, a); return this; }
    s(x, y, z) { M4.scale(this.m, x, y === undefined ? x : y, z === undefined ? x : z); return this; }
    col(c) { this.c = Array.isArray(c) ? (c[0] > 1 || c[1] > 1 || c[2] > 1 ? c.map((x) => x / 255) : c) : rgb01(c); return this; }
    material(m) { this.mat = typeof m === 'string' ? G.MAT[m] : m; return this; }

    vert(x, y, z, nx, ny, nz, c) {
      const m = this.m;
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      let qx = m[0] * nx + m[4] * ny + m[8] * nz, qy = m[1] * nx + m[5] * ny + m[9] * nz, qz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(qx, qy, qz) || 1;
      const k = c ? (typeof c === 'string' ? rgb01(c) : c) : this.c;
      this.v.push(px, py, pz, qx / l, qy / l, qz / l, k[0], k[1], k[2], this.mat / 15);
      return this.v.length / 10 - 1;
    }
    tri(a, b, c) { this.i.push(a, b, c); }
    quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

    /* Face plane à 4 sommets avec normale calculée. */
    face(p0, p1, p2, p3, c) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const a = this.vert(...p0, nx, ny, nz, c), b = this.vert(...p1, nx, ny, nz, c), d = this.vert(...p2, nx, ny, nz, c), e = this.vert(...p3, nx, ny, nz, c);
      this.quad(a, b, d, e);
      return this;
    }
    triFace(p0, p1, p2, c) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      this.tri(this.vert(...p0, nx, ny, nz, c), this.vert(...p1, nx, ny, nz, c), this.vert(...p2, nx, ny, nz, c));
      return this;
    }

    /* Boîte posée sur y = 0, centrée en x et z. */
    box(w, h, d, colTop) {
      const x = w / 2, z = d / 2;
      const top = colTop || this.c;
      this.face([-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z], top);
      this.face([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]);
      this.face([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]);
      this.face([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]);
      this.face([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]);
      this.face([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]);
      return this;
    }

    /* Cylindre (ou tronc de cône) le long de +y. */
    cyl(r0, r1, h, seg, caps) {
      seg = seg || 10;
      const slope = (r0 - r1) / h;
      const base = this.v.length / 10;
      for (let k = 0; k <= seg; k++) {
        const a = k / seg * TAU, c = Math.cos(a), s = Math.sin(a);
        this.vert(c * r0, 0, s * r0, c, slope, s);
        this.vert(c * r1, h, s * r1, c, slope, s);
      }
      for (let k = 0; k < seg; k++) { const a = base + k * 2; this.quad(a, a + 2, a + 3, a + 1); }
      if (caps !== false) {
        if (r1 > 0) { const c0 = this.vert(0, h, 0, 0, 1, 0); const st = this.v.length / 10; for (let k = 0; k <= seg; k++) { const a = k / seg * TAU; this.vert(Math.cos(a) * r1, h, Math.sin(a) * r1, 0, 1, 0); } for (let k = 0; k < seg; k++) this.tri(c0, st + k + 1, st + k); }
        if (caps === 'both' && r0 > 0) { const c0 = this.vert(0, 0, 0, 0, -1, 0); const st = this.v.length / 10; for (let k = 0; k <= seg; k++) { const a = k / seg * TAU; this.vert(Math.cos(a) * r0, 0, Math.sin(a) * r0, 0, -1, 0); } for (let k = 0; k < seg; k++) this.tri(c0, st + k, st + k + 1); }
      }
      return this;
    }
    cone(r, h, seg) { return this.cyl(r, 0.0001, h, seg, false); }

    /* Ellipsoïde centré à l'origine. colFn(nx, ny, nz) optionnelle. */
    sphere(rx, ry, rz, seg, rings, colFn) {
      seg = seg || 12; rings = rings || 8;
      const base = this.v.length / 10;
      for (let j = 0; j <= rings; j++) {
        const v = j / rings * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
        for (let k = 0; k <= seg; k++) {
          const u = k / seg * TAU, cu = Math.cos(u), su = Math.sin(u);
          const nx = sv * cu, ny = cv, nz = sv * su;
          this.vert(nx * rx, ny * ry, nz * rz, nx / rx, ny / ry, nz / rz, colFn ? colFn(nx, ny, nz) : null);
        }
      }
      for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) {
        const a = base + j * (seg + 1) + k, b = a + seg + 1;
        this.quad(a, a + 1, b + 1, b);
      }
      return this;
    }

    /* Rocher : sphère déformée par du bruit. */
    rock(r, seed, flat) {
      const rnd = U.rng(seed);
      const bumps = [];
      for (let i = 0; i < 7; i++) bumps.push([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, 0.15 + rnd() * 0.25]);
      const seg = 12, rings = 8;
      const base = this.v.length / 10;
      const pts = [];
      for (let j = 0; j <= rings; j++) {
        const v = j / rings * Math.PI;
        for (let k = 0; k <= seg; k++) {
          const u = (k % seg) / seg * TAU;
          let nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
          let d = 1;
          for (const b of bumps) d += b[3] * Math.max(0, nx * b[0] + ny * b[1] + nz * b[2]) ** 3;
          d *= 0.92 + U.hash(j, k % seg, seed) * 0.16;
          const y = ny < -0.2 ? -0.2 : ny;
          pts.push([nx * r * d, Math.max(y * r * d * (flat || 0.7), -0.05), nz * r * d]);
        }
      }
      // normales approximées par différences
      for (let j = 0; j <= rings; j++) for (let k = 0; k <= seg; k++) {
        const p = pts[j * (seg + 1) + k];
        const pu = pts[j * (seg + 1) + ((k + 1) % (seg + 1))], pv = pts[Math.min(rings, j + 1) * (seg + 1) + k];
        const ux = pu[0] - p[0], uy = pu[1] - p[1], uz = pu[2] - p[2], vx = pv[0] - p[0], vy = pv[1] - p[1], vz = pv[2] - p[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * p[0] + ny * p[1] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (j === 0) { nx = 0; ny = 1; nz = 0; }
        this.vert(p[0], p[1], p[2], nx, ny, nz);
      }
      for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) {
        const a = base + j * (seg + 1) + k, b = a + seg + 1;
        this.quad(a, a + 1, b + 1, b);
      }
      return this;
    }

    /* Plaque plane extrudée : poly en (x, y), épaisseur le long de z. */
    plate(poly, depth, colEdge) {
      const z = depth / 2;
      const n = poly.length;
      const f = this.v.length / 10;
      for (const p of poly) this.vert(p[0], p[1], z, 0, 0, 1);
      for (let k = 1; k < n - 1; k++) this.tri(f, f + k, f + k + 1);
      const b = this.v.length / 10;
      for (const p of poly) this.vert(p[0], p[1], -z, 0, 0, -1);
      for (let k = 1; k < n - 1; k++) this.tri(b, b + k + 1, b + k);
      for (let k = 0; k < n; k++) {
        const p = poly[k], q = poly[(k + 1) % n];
        this.face([p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], -z], [p[0], p[1], -z], colEdge);
      }
      return this;
    }

    /* Toit à deux pans : emprise w × d, faîtage selon x, hauteur h. */
    roof(w, d, h, over, colA, colB) {
      const x = w / 2 + over, z = d / 2 + over;
      this.face([-x, 0, z], [x, 0, z], [x, h, 0], [-x, h, 0], colA);
      this.face([x, 0, -z], [-x, 0, -z], [-x, h, 0], [x, h, 0], colB || colA);
      this.triFace([x, 0, z], [x, 0, -z], [x, h, 0], colB);
      this.triFace([-x, 0, -z], [-x, 0, z], [-x, h, 0], colB);
      return this;
    }

    /* Tube le long d'une polyligne 3D (rayon r0 → r1). */
    tube(pts, r0, r1, seg) {
      seg = seg || 6;
      const st = [];
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1);
        st.push({ p: pts[i], ry: U.lerp(r0, r1, t), rz: U.lerp(r0, r1, t) });
      }
      return this.loft(st, seg, { caps: false });
    }

    /* Loft : sections elliptiques le long d'une ligne.
       stations : [{ p: [x,y,z], ry, rz, oy? }]  —  opts.colFn(t, ang, nx, ny, nz) → couleur */
    loft(st, seg, opts) {
      opts = opts || {};
      seg = seg || 12;
      const n = st.length;
      const base = this.v.length / 10;
      const rings = [];
      for (let i = 0; i < n; i++) {
        const a = st[Math.max(0, i - 1)].p, b = st[Math.min(n - 1, i + 1)].p;
        let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        // repère : côté = T × haut, normale = côté × T
        let up = Math.abs(ty) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        let sx = ty * up[2] - tz * up[1], sy = tz * up[0] - tx * up[2], sz = tx * up[1] - ty * up[0];
        const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
        rings.push({ tx, ty, tz, sx, sy, sz, ux, uy, uz });
      }
      for (let i = 0; i < n; i++) {
        const S = st[i], R = rings[i];
        const t = i / (n - 1);
        for (let k = 0; k <= seg; k++) {
          const a = k / seg * TAU;
          const ca = Math.cos(a), sa = Math.sin(a);
          // a = 0 : dessus ; a = π : dessous
          const ry = S.ry * (ca < 0 && S.belly ? S.belly : 1);
          const ox = R.ux * ca * ry + R.sx * sa * S.rz;
          const oy = R.uy * ca * ry + R.sy * sa * S.rz;
          const oz = R.uz * ca * ry + R.sz * sa * S.rz;
          const nx = R.ux * ca / Math.max(ry, 1e-4) + R.sx * sa / Math.max(S.rz, 1e-4);
          const ny = R.uy * ca / Math.max(ry, 1e-4) + R.sy * sa / Math.max(S.rz, 1e-4);
          const nz = R.uz * ca / Math.max(ry, 1e-4) + R.sz * sa / Math.max(S.rz, 1e-4);
          const c = opts.colFn ? opts.colFn(t, a, ca, sa, S) : null;
          this.vert(S.p[0] + ox, S.p[1] + oy, S.p[2] + oz, nx, ny, nz, c);
        }
      }
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
        const a = base + i * (seg + 1) + k, b = a + seg + 1;
        this.quad(a, b, b + 1, a + 1);
      }
      if (opts.caps !== false) {
        for (const end of [0, n - 1]) {
          const S = st[end], R = rings[end];
          const dir = end === 0 ? -1 : 1;
          if (S.ry < 1e-3 && S.rz < 1e-3) continue;
          const c = opts.colFn ? opts.colFn(end ? 1 : 0, Math.PI / 2, 0, 1, S) : null;
          const ctr = this.vert(S.p[0], S.p[1], S.p[2], R.tx * dir, R.ty * dir, R.tz * dir, c);
          const ringStart = base + end * (seg + 1);
          for (let k = 0; k < seg; k++) end === 0 ? this.tri(ctr, ringStart + k + 1, ringStart + k) : this.tri(ctr, ringStart + k, ringStart + k + 1);
        }
      }
      return this;
    }

    /* Ajoute un autre maillage (données brutes) avec la transformation courante. */
    add(data) {
      const base = this.v.length / 10;
      const v = data.verts;
      const m = this.m;
      for (let k = 0; k < v.length; k += 10) {
        const x = v[k], y = v[k + 1], z = v[k + 2], nx = v[k + 3], ny = v[k + 4], nz = v[k + 5];
        let qx = m[0] * nx + m[4] * ny + m[8] * nz, qy = m[1] * nx + m[5] * ny + m[9] * nz, qz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(qx, qy, qz) || 1;
        this.v.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], qx / l, qy / l, qz / l, v[k + 6], v[k + 7], v[k + 8], v[k + 9]);
      }
      for (const i of data.idx) this.i.push(base + i);
      return this;
    }

    get empty() { return this.i.length === 0; }

    finish() {
      const verts = new Float32Array(this.v);
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (let k = 0; k < verts.length; k += 10) {
        const x = verts[k], y = verts[k + 1], z = verts[k + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      return { verts, idx: new Uint32Array(this.i), bounds: { x0, y0, z0, x1, y1, z1 } };
    }
  }

  G.MB = MB;
})();
