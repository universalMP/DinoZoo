#!/usr/bin/env node
/* =====================================================================
   DinoZoo — Convertit un modèle GLB (Meshy) en fichier js/models/<id>.js.
   Le jeu doit tourner depuis file:// : pas de fetch possible, donc le
   modèle est embarqué dans un script, compressé (positions et UV sur
   16 bits, normales sur 8 bits) avec sa texture réduite en JPEG.

   node tools/glb2js.mjs --id compsognathus --in meshy_output/compy.glb \
        [--yaw 90|auto] [--pitch 90] [--roll 180] [--axis minor] [--head high|low] [--flip] [--tex 1536] [--quality 80]

   --yaw : rotation (degrés, autour de la verticale) qui tourne la tête du
           modèle vers +X (le glTF regarde vers +Z : 90 par défaut).
   Nécessite macOS (sips) pour réduire la texture.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]]) : a), []));
if (!args.id || !args.in) { console.error('usage: --id <espèce> --in <fichier.glb> [--yaw 90] [--tex 1024] [--quality 80]'); process.exit(2); }
let yaw = (args.yaw == null || args.yaw === 'auto' ? 90 : +args.yaw) * Math.PI / 180;
const texSize = +(args.tex || 1536), quality = +(args.quality || 80);
const outFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'js', 'models', args.id + '.js');

/* ---------- lecture du GLB ---------- */
const buf = fs.readFileSync(args.in);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un GLB');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const n = NC[a.type], cnt = a.count;
  const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[a.componentType];
  const bytes = Ctor.BYTES_PER_ELEMENT, stride = bv.byteStride || n * bytes;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(cnt * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const rd = { 5126: (o) => dv.getFloat32(o, true), 5125: (o) => dv.getUint32(o, true), 5123: (o) => dv.getUint16(o, true), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5120: (o) => dv.getInt8(o) }[a.componentType];
  const norm = a.normalized ? { 5123: 65535, 5121: 255, 5122: 32767, 5120: 127 }[a.componentType] : 1;
  for (let k = 0; k < cnt; k++) for (let c = 0; c < n; c++) out[k * n + c] = rd(base + k * stride + c * bytes) / norm;
  return out;
}

/* ---------- matrices des nœuds ---------- */
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(nd) {
  if (nd.matrix) return nd.matrix.slice();
  const [x, y, z, w] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1], [tx, ty, tz] = nd.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const P = [], N = [], T = [], I = [];
let image = null;
function visit(ni, parent) {
  const nd = json.nodes[ni], m = mul(parent, local(nd));
  if (nd.mesh != null) for (const pr of json.meshes[nd.mesh].primitives) {
    const pos = accessor(pr.attributes.POSITION), cnt = pos.length / 3;
    const nor = pr.attributes.NORMAL != null ? accessor(pr.attributes.NORMAL) : null;
    const uv = pr.attributes.TEXCOORD_0 != null ? accessor(pr.attributes.TEXCOORD_0) : new Float64Array(cnt * 2);
    const idx = pr.indices != null ? accessor(pr.indices) : Float64Array.from({ length: cnt }, (_, k) => k);
    const base = P.length / 3;
    for (let k = 0; k < cnt; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      if (nor) { const a = nor[k * 3], b = nor[k * 3 + 1], c = nor[k * 3 + 2]; N.push(m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c); } else N.push(0, 1, 0);
      T.push(uv[k * 2], uv[k * 2 + 1]);
    }
    for (const k of idx) I.push(base + k);
    const mat = pr.material != null ? json.materials[pr.material] : null;
    const ti = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
    if (ti && !image) {
      const img = json.images[json.textures[ti.index].source];
      const bv = json.bufferViews[img.bufferView];
      image = { data: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), mime: img.mimeType };
    }
  }
  for (const c of nd.children || []) visit(c, m);
}
const scene = json.scenes[json.scene || 0];
for (const ni of scene.nodes) visit(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/* ---------- orientation : tête vers +X, pieds à y = 0, centré ----------
   --yaw auto : le grand axe horizontal (analyse en composantes principales)
   devient l'axe X ; la tête est l'extrémité la plus haute (animaux
   terrestres), ou celle indiquée par --head low|high. --flip inverse. */
// --pitch 90 : le modèle est « debout » (vue de dessus prise pour une vue de face) — le haut devient l'avant.
// --roll 180 : retourne le modèle (dos en haut).
if (args.pitch) { const a = +args.pitch * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < P.length; k += 3) for (const A of [P, N]) { const x = A[k], y = A[k + 1]; A[k] = x * c + y * s; A[k + 1] = -x * s + y * c; } }
if (args.roll) { const a = +args.roll * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); for (let k = 0; k < P.length; k += 3) for (const A of [P, N]) { const y = A[k + 1], z = A[k + 2]; A[k + 1] = y * c - z * s; A[k + 2] = y * s + z * c; } }
if (args.yaw === 'auto') {
  let mx = 0, mz = 0; const nv0 = P.length / 3;
  for (let k = 0; k < P.length; k += 3) { mx += P[k]; mz += P[k + 2]; }
  mx /= nv0; mz /= nv0;
  let cxx = 0, czz = 0, cxz = 0;
  for (let k = 0; k < P.length; k += 3) { const x = P[k] - mx, z = P[k + 2] - mz; cxx += x * x; czz += z * z; cxz += x * z; }
  yaw = -0.5 * Math.atan2(2 * cxz, cxx - czz); // amène le grand axe sur X
  if (args.axis === 'minor') yaw += Math.PI / 2; // volants : l'envergure est le grand axe, le corps le petit
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let x0 = 1e9, x1 = -1e9;
  for (let k = 0; k < P.length; k += 3) { const x = P[k] * c + P[k + 2] * s; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  // hauteur maximale de chaque extrémité (15 % de la longueur)
  let hiF = -1e9, hiB = -1e9, nF = 0, nB = 0;
  for (let k = 0; k < P.length; k += 3) { const x = P[k] * c + P[k + 2] * s; if (x > x1 - (x1 - x0) * 0.15) { hiF = Math.max(hiF, P[k + 1]); nF++; } if (x < x0 + (x1 - x0) * 0.15) { hiB = Math.max(hiB, P[k + 1]); nB++; } }
  let headFront = args.head === 'low' ? hiF < hiB : hiF >= hiB;
  if (args.flip) headFront = !headFront;
  if (!headFront) yaw += Math.PI;
  console.log(`orientation : ${(yaw * 180 / Math.PI).toFixed(1)}°, extrémité avant ${hiF.toFixed(3)} (${nF}) / arrière ${hiB.toFixed(3)} (${nB})`);
}
const cy = Math.cos(yaw), sy = Math.sin(yaw);
for (let k = 0; k < P.length; k += 3) {
  const x = P[k], z = P[k + 2]; P[k] = x * cy + z * sy; P[k + 2] = -x * sy + z * cy;
  const a = N[k], c = N[k + 2]; N[k] = a * cy + c * sy; N[k + 2] = -a * sy + c * cy;
}
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let k = 0; k < P.length; k++) { lo[k % 3] = Math.min(lo[k % 3], P[k]); hi[k % 3] = Math.max(hi[k % 3], P[k]); }
const shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2];
for (let k = 0; k < P.length; k++) P[k] += shift[k % 3];
const b0 = [lo[0] + shift[0], 0, lo[2] + shift[2]], b1 = [hi[0] + shift[0], hi[1] + shift[1], hi[2] + shift[2]];

/* ---------- compression ---------- */
const nv = P.length / 3;
const qp = new Uint16Array(nv * 3), qn = new Int8Array(nv * 4), qt = new Uint16Array(nv * 2);
for (let k = 0; k < nv; k++) {
  for (let c = 0; c < 3; c++) qp[k * 3 + c] = Math.round((P[k * 3 + c] - b0[c]) / ((b1[c] - b0[c]) || 1) * 65535);
  const l = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1;
  for (let c = 0; c < 3; c++) qn[k * 4 + c] = Math.round(N[k * 3 + c] / l * 127);
  for (let c = 0; c < 2; c++) qt[k * 2 + c] = Math.round(Math.min(1, Math.max(0, T[k * 2 + c])) * 65535);
}
const qi = nv < 65536 ? Uint16Array.from(I) : Uint32Array.from(I);
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

/* ---------- texture ---------- */
let tex = null;
if (image) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glb2js-'));
  const src = path.join(tmp, 'src' + (image.mime === 'image/png' ? '.png' : '.jpg')), dst = path.join(tmp, 'out.jpg');
  fs.writeFileSync(src, image.data);
  execFileSync('sips', ['-Z', String(texSize), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), src, '--out', dst], { stdio: 'ignore' });
  tex = 'data:image/jpeg;base64,' + fs.readFileSync(dst).toString('base64');
  fs.rmSync(tmp, { recursive: true, force: true });
}

const out = `/* Modèle 3D généré avec Meshy, converti par tools/glb2js.mjs — ${nv} sommets, ${qi.length / 3} triangles. */
window.DZ = window.DZ || {};
DZ.MODELS = DZ.MODELS || {};
DZ.MODELS[${JSON.stringify(args.id)}] = {
  n: ${nv}, lo: ${JSON.stringify(b0.map((v) => +v.toFixed(5)))}, hi: ${JSON.stringify(b1.map((v) => +v.toFixed(5)))}, wide: ${qi instanceof Uint32Array},
  pos: '${b64(qp)}',
  nor: '${b64(qn)}',
  uv: '${b64(qt)}',
  idx: '${b64(qi)}',
  tex: ${tex ? `'${tex}'` : 'null'}
};
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
// manifeste : liste des modèles disponibles, chargés à la demande par le jeu
const dir = path.dirname(outFile);
const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3)).sort();
fs.writeFileSync(path.join(dir, 'index.js'), `/* Modèles 3D disponibles (mis à jour par tools/glb2js.mjs). */\nwindow.DZ = window.DZ || {};\nDZ.MODEL_FILES = ${JSON.stringify(ids)};\n`);
console.log(`${args.id}: ${nv} sommets, ${qi.length / 3} triangles, taille ${(b1[0] - b0[0]).toFixed(3)} × ${(b1[1]).toFixed(3)} × ${(b1[2] - b0[2]).toFixed(3)}, ${(out.length / 1024).toFixed(0)} Ko → ${path.relative(process.cwd(), outFile)}`);
