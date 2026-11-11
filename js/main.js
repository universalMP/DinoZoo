/* =====================================================================
   DinoZoo — Démarrage et boucle principale.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  function autoQuality() {
    const cores = navigator.hardwareConcurrency || 4;
    const pixels = window.innerWidth * window.innerHeight * Math.pow(Math.min(2, window.devicePixelRatio || 1), 2);
    if (cores <= 2) return 'low';
    if (cores <= 4 || pixels > 6e6) return 'medium';
    return 'high';
  }

  function boot() {
    const st = DZ.Save.settings();
    let quality = st.quality || autoQuality();
    const game = new DZ.Game();
    const canvas = document.getElementById('view');
    // le jeu se joue en 3D (WebGL 2)
    if (!DZ.G.webgl2Available()) throw new Error('ce navigateur ne gère pas WebGL 2, indispensable au rendu 3D du jeu. Essayez un navigateur récent (Chrome, Firefox, Safari, Edge) et vérifiez que l\'accélération matérielle est activée.');
    const renderer = new DZ.G.Renderer3D(canvas, game);
    renderer.setQuality(quality);
    const saved = DZ.Save.load();
    const resumed = !!(saved && game.load(saved));
    if (!resumed) game.newGame();
    // vignettes du catalogue rendues en 3D
    DZ.R.dinoThumb = (id, w, h) => renderer.thumbDino(id, w, h);
    DZ.R.buildingThumb = (type, w, h) => renderer.thumbBuilding(type, w, h);
    const sound = new DZ.Sound();
    sound.muted = !!st.muted;
    if (st.vol) Object.assign(sound.vol, st.vol);
    sound.musicOn = st.musicOn !== false;
    document.getElementById('btn-sound').textContent = st.muted ? '🔇' : '🔊';
    const ui = new DZ.UI(game, renderer, sound);
    ui.quality = quality;
    ui.moneyShown = game.s.money;
    DZ.tutorial.init(game, ui);

    ui.onQuality = (q, manual) => {
      quality = q;
      ui.quality = q;
      renderer.setQuality(q);
      ui.thumbs = {};
      ui.buildItems();
      if (manual) { const s = DZ.Save.settings(); s.quality = q; DZ.Save.setSettings(s); }
    };
    // profil du joueur : demandé à chaque nouvelle partie (et une fois pour les anciennes sauvegardes)
    const askPlayer = (opts, done) => {
      const prev = game.speedIndex;
      game.setSpeed(0); ui.refreshSpeed();
      ui.openPlayerSetup(opts, (p) => { done(p); game.setSpeed(prev || 1); ui.refreshSpeed(); });
    };
    ui.onReset = () => askPlayer({ title: 'Nouvelle partie', go: 'Commencer la partie', name: game.s.player.set ? game.s.player.name : '', gender: game.s.player.gender, avatar: game.s.player.avatar }, (p) => {
      DZ.Save.clear();
      game.newGame(undefined, Object.assign(p, { set: true }));
      renderer.resetCamera();
      renderer.particles.length = 0;
      game.setSpeed(1); ui.refreshSpeed();
      DZ.Save.save(game);
      ui.greet();
      DZ.tutorial.start(true);
    });

    const resize = () => renderer.resize();
    window.addEventListener('resize', resize);
    resize();

    // sauvegarde automatique
    const save = () => DZ.Save.save(game);
    game.on('hour', save);
    game.on('dayEnd', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('beforeunload', save);

    // boucle
    let last = performance.now();
    let fpsT = 0, fpsN = 0, started = performance.now(), audioT = 0;
    function loop(now) {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        game.update(dt);
        renderer.frame(dt);
        ui.update(dt);
        DZ.tutorial.update(dt);
        // écouteur 3D placé sur la caméra, analyse du lieu
        if (sound.ctx) {
          const e = renderer.eye, c = renderer.cam;
          const fx = c.tx - e[0], fy = c.ty - e[1], fz = c.tz - e[2], fl = Math.hypot(fx, fy, fz) || 1;
          sound.setListener(e[0], e[1], e[2], fx / fl, fy / fl, fz / fl);
          audioT += dt;
          if (audioT > 0.3) { audioT = 0; sound.analyze(game, renderer); }
          const helis = [];
          for (const dl of game.s.deliveries) { const p = game.deliveryPose(dl); if (p) helis.push({ id: dl.id, x: p.x, y: 0.6 + p.alt * 8.5, z: p.y }); }
          for (const tr of game.transfers) { const p = game.transferPose(tr); if (p) helis.push({ id: 'T' + tr.id, x: p.x, y: 0.6 + p.alt * 8.5, z: p.y }); }
          sound.heliSync(helis);
        }
      } catch (err) {
        console.error(err);
      }
      // baisse automatique de la qualité si le jeu ralentit
      fpsT += dt; fpsN++;
      if (fpsT > 3) {
        const fps = fpsN / fpsT;
        renderer.fps = fps;
        fpsT = 0; fpsN = 0;
        if (!DZ.Save.settings().quality && !document.hidden && now - started > 6000) {
          if (fps < 38 && quality === 'high') { ui.onQuality('medium'); ui.toast('⚙️', 'Qualité graphique réduite automatiquement pour garder un jeu fluide.', 'info'); }
          else if (fps < 30 && quality === 'medium') { ui.onQuality('low'); ui.toast('⚙️', 'Qualité graphique réduite automatiquement pour garder un jeu fluide.', 'info'); }
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // affichage
    setTimeout(() => {
      document.getElementById('loading').classList.add('done');
      if (game.s.over) { ui.showGameOver(); return; } // partie perdue lors de la dernière session
      if (!game.s.player.set) {
        askPlayer(resumed
          ? { title: 'Qui dirige le parc ?', text: 'Nouveauté : votre parc a maintenant un directeur ou une directrice. Choisissez votre nom, votre genre et votre avatar : il se rendra sur place à chacune de vos actions.', go: 'Reprendre la partie' }
          : { title: 'Bienvenue à DinoZoo !', go: 'Ouvrir le parc' }, (p) => {
          game.setPlayer(p);
          DZ.Save.save(game);
          ui.greet();
          DZ.tutorial.start(false);
        });
      } else {
        if (resumed) ui.toast('💾', `Bon retour au parc, ${game.s.player.name} ! Reprise au jour ${game.s.day}.`, 'good');
        DZ.tutorial.start(false);
      }
    }, 250);

    // accès pour le débogage dans la console
    DZ.app = { game, renderer, ui, sound };
    const hookMusic = () => { if (sound.music && !sound.music.onTheme) sound.music.onTheme = (title) => ui.toast('🎵', '♪ ' + title, 'music'); };
    setInterval(hookMusic, 1000);
  }

  window.addEventListener('load', () => {
    try { boot(); } catch (err) {
      console.error(err);
      const l = document.getElementById('loading');
      if (l) l.querySelector('.sub').textContent = 'Erreur au démarrage : ' + err.message;
    }
  });
})();
