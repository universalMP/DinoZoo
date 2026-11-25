/* =====================================================================
   DinoZoo — Classement en ligne (api/scores.mjs sur dinozoo.vercel.app).
   Chaque partie a un identifiant (s.runId). Son score (gains totaux,
   jour atteint) est envoyé à la fin de chaque journée et à la fin de
   la partie. Sans réseau, le jeu continue sans classement.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  // sur le site lui-même, adresse relative ; ailleurs (itch.io, fichier local), le site en ligne
  const onSite = /(^|\.)dinozoo\.vercel\.app$/.test(location.hostname) || /\.vercel\.app$/.test(location.hostname);
  const API = onSite ? '/api/scores' : 'https://dinozoo.vercel.app/api/scores';

  DZ.newRunId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');

  DZ.Scores = {
    last: null, // dernière réponse du serveur
    enabled() { return DZ.Save.settings().leaderboard !== false; },
    // parties de développement (serveur local) : jamais envoyées au classement
    local: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname),
    async submit(game) {
      const s = game.s;
      if (this.local || !this.enabled() || !s.runId || !s.player || !s.player.set) return null;
      if (s.day < 2 && !s.over) return null; // rien à classer avant la fin du premier jour
      const body = { run: s.runId, name: s.player.name, avatar: s.player.avatar, gender: s.player.gender, day: s.over ? s.over.day : s.day, earned: Math.round(s.totalEarned), rating: Math.round(s.rating * 100) / 100, over: !!s.over };
      try {
        // texte brut : pas de requête préalable CORS
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), keepalive: true });
        const j = await r.json();
        if (j && j.rank) s.bestRank = Math.min(s.bestRank || 1e9, j.rank);
        return j;
      } catch (e) { return null; }
    },
    async top(game) {
      const run = game && game.s.runId;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(API + (run ? '?run=' + run : ''), { signal: ctl.signal, cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        return (this.last = await r.json());
      } finally { clearTimeout(timer); }
    }
  };
})();
