/* DinoZoo — Classement en ligne (fonction Vercel, sans dépendance).
   Données dans Upstash Redis, via son API REST (variables KV_REST_API_URL et KV_REST_API_TOKEN) :
     dz:scores   ensemble trié : identifiant de partie → gains totaux
     dz:run:<id> hachage : nom, avatar, jour, gains, note, partie perdue, date
   GET  /api/scores?run=<id>  → { top: [...], me: { rank, ... } | null }
   POST /api/scores           → corps JSON { run, name, avatar, gender, day, earned, rating, over }
   Le dépôt est public : on vérifie la vraisemblance des scores et on limite le nombre d'envois par adresse. */

const KEEP = 1000;              // parties conservées dans le classement
const TOP = 50;                 // parties renvoyées
const MAX_PER_DAY = 2.5e6;      // gains maximum vraisemblables par jour de jeu
const RATE = { n: 40, sec: 600 }; // envois par adresse et par fenêtre

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });

async function redis(cmds) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('base non configurée');
  const r = await fetch(url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status);
  const out = await r.json();
  return out.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}

const RUN = /^[a-z0-9]{8,24}$/;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const toObj = (arr) => { const o = {}; for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
const entry = (id, h, rank) => ({ rank, run: id, name: h.name || '?', avatar: +h.avatar || 0, gender: h.gender || 'h', day: +h.day || 0, earned: +h.earned || 0, rating: +h.rating || 0, over: h.over === '1', t: +h.t || 0 });

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(request) {
  try {
    const run = new URL(request.url).searchParams.get('run');
    const ids = await redis([['ZREVRANGE', 'dz:scores', 0, TOP - 1]]).then((r) => r[0] || []);
    const cmds = ids.map((id) => ['HGETALL', 'dz:run:' + id]);
    const mine = run && RUN.test(run) && !ids.includes(run);
    if (mine) cmds.push(['ZREVRANK', 'dz:scores', run], ['HGETALL', 'dz:run:' + run]);
    cmds.push(['ZCARD', 'dz:scores']);
    const res = cmds.length ? await redis(cmds) : [];
    const top = ids.map((id, i) => entry(id, toObj(res[i]), i + 1));
    let me = null;
    if (run && ids.includes(run)) me = top[ids.indexOf(run)];
    else if (mine && res[ids.length] != null) me = entry(run, toObj(res[ids.length + 1]), res[ids.length] + 1);
    return json({ top, me, total: res[res.length - 1] || 0 }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json({ error: 'Classement indisponible' }, 503);
  }
}

export async function POST(request) {
  let b;
  try { b = JSON.parse(await request.text()); } catch (e) { return json({ error: 'Requête invalide' }, 400); }
  const run = String(b.run || ''), name = cleanName(b.name);
  const day = Math.floor(+b.day), earned = Math.round(+b.earned), rating = +b.rating;
  if (!RUN.test(run) || !name) return json({ error: 'Requête invalide' }, 400);
  if (!(day >= 1 && day <= 100000) || !(earned >= 0) || earned > day * MAX_PER_DAY || !(rating >= 0 && rating <= 5)) return json({ error: 'Score invraisemblable' }, 422);
  try {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
    const [count] = await redis([['INCR', 'dz:rate:' + ip], ['EXPIRE', 'dz:rate:' + ip, RATE.sec, 'NX']]);
    if (count > RATE.n) return json({ error: 'Trop d\'envois, réessayez plus tard' }, 429);
    const prev = toObj((await redis([['HGETALL', 'dz:run:' + run]]))[0]);
    if (prev.day) {
      // une même partie ne recule pas, et ne gagne pas plus que vraisemblable depuis le dernier envoi
      if (day < +prev.day || earned < +prev.earned) return json({ ok: true, ignored: true });
      if (earned - +prev.earned > (day - +prev.day + 1) * MAX_PER_DAY) return json({ error: 'Score invraisemblable' }, 422);
    }
    await redis([
      ['HSET', 'dz:run:' + run, 'name', name, 'avatar', String(Math.max(0, Math.min(5, Math.floor(+b.avatar) || 0))), 'gender', ['f', 'h', 'a'].includes(b.gender) ? b.gender : 'h',
        'day', String(day), 'earned', String(earned), 'rating', rating.toFixed(2), 'over', b.over ? '1' : '0', 't', String(Date.now())],
      ['EXPIRE', 'dz:run:' + run, 60 * 60 * 24 * 400],
      ['ZADD', 'dz:scores', earned, run],
      ['ZREMRANGEBYRANK', 'dz:scores', 0, -(KEEP + 1)]
    ]);
    const [rank] = await redis([['ZREVRANK', 'dz:scores', run]]);
    return json({ ok: true, rank: rank == null ? null : rank + 1 });
  } catch (e) {
    return json({ error: 'Classement indisponible' }, 503);
  }
}
