#!/usr/bin/env node
/* =====================================================================
   DinoZoo — Convertit une image (texture de feuillage, d'écorce…) en
   fichier js/models/<id>.js : DZ.MODELS[id] = { tex: 'data:image/jpeg…' }.
   Comme les modèles 3D, l'image est chargée à la demande et fonctionne
   depuis file://. Le fond blanc des feuillages est rendu transparent par
   le jeu au chargement.

   node tools/img2js.mjs --id l_palmier --in meshy_output/concepts/l_palmier.png [--size 1024] [--quality 85]
   Nécessite macOS (sips).
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
if (!args.id || !args.in) { console.error('usage: --id <id> --in <image> [--size 1024] [--quality 85]'); process.exit(2); }
const size = +(args.size || 1024), quality = +(args.quality || 85);
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'js', 'models');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'img2js-'));
const dst = path.join(tmp, 'out.jpg');
execFileSync('sips', ['-Z', String(size), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), args.in, '--out', dst], { stdio: 'ignore' });
const tex = 'data:image/jpeg;base64,' + fs.readFileSync(dst).toString('base64');
fs.rmSync(tmp, { recursive: true, force: true });
const out = `/* Texture générée avec Meshy (text-to-image), convertie par tools/img2js.mjs. */
window.DZ = window.DZ || {};
DZ.MODELS = DZ.MODELS || {};
DZ.MODELS[${JSON.stringify(args.id)}] = { tex: '${tex}' };
`;
fs.writeFileSync(path.join(dir, args.id + '.js'), out);
const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3)).sort();
fs.writeFileSync(path.join(dir, 'index.js'), `/* Modèles 3D disponibles (mis à jour par tools/glb2js.mjs). */\nwindow.DZ = window.DZ || {};\nDZ.MODEL_FILES = ${JSON.stringify(ids)};\n`);
console.log(`${args.id}: ${(out.length / 1024).toFixed(0)} Ko`);
