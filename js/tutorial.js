/* DinoZoo — Court tutoriel affiché au premier lancement. */
window.DZ = window.DZ || {};
(function () {
  const $ = (s) => document.querySelector(s);
  const anyBuilt = (g, pred) => Object.values(g.buildings).some(pred);

  const STEPS = [
    {
      title: 'Bienvenue à DinoZoo !',
      text: 'Vous dirigez un tout nouveau parc de dinosaures. Construisez des enclos, accueillez des espèces fascinantes et faites prospérer le parc : votre score, ce sont les jours écoulés et l\'argent gagné.',
      next: true
    },
    {
      title: 'Construisez un enclos',
      text: 'Ouvrez l\'onglet <b>Enclos</b> et placez un <b>Petit enclos</b> le long d\'un chemin. Les cases vertes indiquent le chemin qui y donne accès. Le chantier prend un peu de temps : votre avatar va superviser les travaux.',
      todo: 'Construire un enclos relié à un chemin',
      check: (g) => anyBuilt(g, (b) => g.isEnclosure(b) && g.isConnected(b)),
      highlight: '[data-tab="enclos"]',
      onShow: (ui) => { ui.tab = 'enclos'; ui.buildTabs(); }
    },
    {
      title: 'Votre premier dinosaure',
      text: 'Dans l\'onglet <b>Dinosaures</b>, choisissez le <b>Compsognathus</b> ou le <b>Dryosaurus</b>, puis cliquez sur votre enclos. Il sera livré par hélicoptère ! Un mâle et une femelle de la même espèce auront des petits (mais deux mâles finiront par se battre).',
      todo: 'Installer un dinosaure',
      check: (g) => g.dinos.length > 0,
      highlight: '[data-tab="dinos"]',
      onShow: (ui) => { ui.tab = 'dinos'; ui.buildTabs(); }
    },
    {
      title: 'Prenez soin des visiteurs',
      text: 'Les visiteurs ont faim et besoin de toilettes. Dans <b>Services</b>, construisez des <b>Toilettes</b> ou un <b>Restaurant</b> au bord d\'un chemin. Pensez aussi aux <b>poubelles</b> (onglet Décor).',
      todo: 'Construire des toilettes ou un restaurant',
      check: (g) => anyBuilt(g, (b) => (b.type === 'toilettes' || b.type === 'restaurant') && g.isConnected(b)),
      highlight: '[data-tab="services"]',
      onShow: (ui) => { ui.tab = 'services'; ui.buildTabs(); }
    },
    {
      title: 'Le temps file',
      text: 'Les visiteurs arrivent entre 8 h et 17 h et repartent le soir. Utilisez <b>⏸ ▶ ⏩</b> pour régler la vitesse. Chaque soir, un résumé des recettes s\'affiche et la note du parc est mise à jour.',
      next: true,
      highlight: '#speed'
    },
    {
      title: 'À vous de jouer !',
      text: 'Améliorez les bâtiments (cliquez dessus), diversifiez les espèces et gardez le parc propre. Une meilleure note débloque des dinosaures plus spectaculaires… jusqu\'au T-Rex ! Attention : les carnivores ne cohabitent qu\'avec leur propre espèce.',
      next: true,
      last: true
    }
  ];

  DZ.tutorial = {
    i: -1, ui: null, game: null, t: 0,
    init(game, ui) { this.game = game; this.ui = ui; },
    start(force) {
      const st = DZ.Save.settings();
      if (st.tutorialDone && !force) return;
      this.i = 0;
      this.render();
    },
    finish() {
      this.i = -1;
      $('#tutorial').classList.add('hidden');
      this.clearHighlight();
      const st = DZ.Save.settings(); st.tutorialDone = true; DZ.Save.setSettings(st);
    },
    clearHighlight() { document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse')); },
    render() {
      const s = STEPS[this.i];
      const box = $('#tutorial');
      if (!s) { this.finish(); return; }
      this.clearHighlight();
      if (s.onShow) s.onShow(this.ui);
      if (s.highlight) { const h = document.querySelector(s.highlight); if (h) h.classList.add('pulse'); }
      box.innerHTML = `<div class="step">Tutoriel · ${this.i + 1} / ${STEPS.length}</div><h3>${s.title}</h3><p>${s.text}</p>${s.todo ? `<div class="todo">➜ ${s.todo}</div>` : ''}
        <div class="btns"><button class="btn small" data-skip>Passer le tutoriel</button>${s.next ? `<button class="btn primary" data-next>${s.last ? 'Commencer' : 'Suivant'}</button>` : ''}</div>`;
      box.classList.remove('hidden');
      box.querySelector('[data-skip]').addEventListener('click', () => this.finish());
      const n = box.querySelector('[data-next]');
      if (n) n.addEventListener('click', () => { this.i++; this.ui.sound.play('click'); this.render(); });
    },
    update(dt) {
      if (this.i < 0) return;
      this.t += dt;
      if (this.t < 0.4) return;
      this.t = 0;
      const s = STEPS[this.i];
      if (s && s.check && s.check(this.game)) { this.i++; this.ui.sound.play('upgrade'); this.render(); }
      else if (s && s.highlight) { const h = document.querySelector(s.highlight); if (h && !h.classList.contains('pulse')) h.classList.add('pulse'); }
    }
  };
})();
