/* DinoZoo — Sauvegarde automatique dans le localStorage. */
window.DZ = window.DZ || {};
(function () {
  const KEY = 'dinozoo.save.v2', SETTINGS = 'dinozoo.settings.v1', BEST = 'dinozoo.best.v1';
  const read = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  DZ.Save = {
    save(game) {
      if (!game.s) return false;
      const ok = write(KEY, game.serialize());
      const best = read(BEST) || { day: 0, earned: 0 };
      if (game.s.totalEarned > best.earned) write(BEST, { day: game.s.day, earned: Math.round(game.s.totalEarned) });
      return ok;
    },
    load() { return read(KEY); },
    clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignoré */ } },
    settings() { return Object.assign({ muted: false, quality: null, tutorialDone: false, renderer: '3d' }, read(SETTINGS) || {}); },
    setSettings(s) { write(SETTINGS, s); },
    best() { return read(BEST) || { day: 0, earned: 0 }; }
  };
})();
