/* =====================================================================
   DinoZoo — Interface : barre du haut, menu de construction, outils,
   panneau d'informations, infobulles, notifications, résumé du jour,
   fenêtres et commandes (souris, tactile, clavier).
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const C = DZ.CONFIG, U = DZ.util, R = DZ.R;
  const T = C.map.tile;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = U.money;
  const pct = (x) => Math.round(x * 100) + ' %';
  /* Durée en heures de jeu → « 35 min » ou « 1 h 20 ». */
  const fmtH = (h) => { const m = Math.max(1, Math.round(h * 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
  const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const SEX = { F: '♀', M: '♂' };
  const TREE_TYPES = ['arbre', 'palmier', 'fougere'];

  const TABS = [
    { id: 'chemins', icon: '🛤️', name: 'Chemins', items: ['path', 'sky'] },
    { id: 'enclos', icon: '🏞️', name: 'Enclos', items: ['enclos_s', 'enclos_m', 'enclos_l', 'voliere', 'lagon', 'link', 'merge'] },
    { id: 'dinos', icon: '🦖', name: 'Dinosaures', items: 'dinos' },
    { id: 'services', icon: '🍽️', name: 'Services', items: ['boutique', 'restaurant', 'toilettes', 'balancoires', 'toboggan', 'fauxdino'] },
    { id: 'deco', icon: '🌴', name: 'Décor', items: ['poubelle', 'banc', 'lampadaire', 'arbre', 'palmier', 'fougere', 'fontaine'] },
    { id: 'outils', icon: '🛠️', name: 'Outils', items: ['select', 'move', 'demolish'] }
  ];
  const TOOLS = {
    select: { name: 'Sélection', icon: '👆', desc: 'Inspecter les bâtiments et les dinosaures.' },
    move: { name: 'Déplacer', icon: '✋', desc: 'Déplacer un bâtiment gratuitement (les dinosaures suivent).' },
    demolish: { name: 'Démolir', icon: '🧨', desc: 'Démolir un bâtiment ou un chemin (remboursement partiel).' },
    link: { name: 'Passerelle', icon: '🌉', desc: 'Relier deux enclos terrestres face à face (10 cases au plus) : les dinosaures passent de l\'un à l\'autre, au-dessus des allées. Cliquez sur un enclos, puis sur le second.' },
    sky: { name: 'Passerelle d\'observation', icon: '🔭', desc: 'Un chemin surélevé qui traverse un enclos (ou plusieurs enclos voisins) en ligne droite. Les visiteurs montent par l\'escalier et regardent les dinosaures d\'en haut : meilleure vue, plus de satisfaction, plus d\'attractivité. Cliquez d\'un côté de l\'enclos, puis de l\'autre.' },
    merge: { name: 'Réunir', icon: '🔗', desc: 'Réunir deux enclos terrestres qui se touchent : la clôture commune disparaît, la place s\'additionne. Cliquez sur un enclos, puis sur son voisin.' }
  };
  const BUILD_DESC = {
    path: 'Les visiteurs ne marchent que sur les chemins. Sur l\'eau, un pont est construit.',
    enclos_s: 'Pour les petites espèces. Améliorable jusqu\'aux murs de verre.',
    enclos_m: 'Pour les espèces moyennes et petites.',
    enclos_l: 'Pour les géants : T-Rex, Brachiosaurus, Spinosaurus…',
    voliere: 'Une grande volière pour les reptiles volants.',
    lagon: 'Un bassin profond pour les reptiles marins.',
    boutique: 'Les visiteurs y achètent des souvenirs.',
    restaurant: 'Nourrit les visiteurs affamés. Produit quelques déchets.',
    toilettes: 'Indispensables pour garder des visiteurs satisfaits.',
    balancoires: 'Un portique de balançoires. Les familles avec des enfants viennent s\'y amuser.',
    toboggan: 'Une tour avec échelle et toboggan. Les enfants l\'adorent.',
    fauxdino: 'Un faux dinosaure à escalader, avec un filet et une queue-toboggan. Le jeu préféré des petits.',
    poubelle: 'Ramasse les déchets dans un rayon de 3 cases.',
    banc: 'Les visiteurs se reposent : satisfaction en hausse.',
    lampadaire: 'Éclaire les allées le soir.',
    arbre: 'Un araucaria majestueux. Embellit le parc.',
    palmier: 'Un palmier élégant. Embellit le parc.',
    fougere: 'Un massif de fougères. Embellit le parc.',
    fontaine: 'Une fontaine de pierre, très appréciée des visiteurs.'
  };

  class UI {
    constructor(game, renderer, sound) {
      this.game = game; this.r = renderer; this.sound = sound;
      this.canvas = $('#view');
      this.tool = { kind: 'select' };
      this.tab = 'enclos';
      this.thumbs = {};
      this.moneyShown = 0;
      this.panelT = 0;
      this.seenUnlocked = new Set();
      this.pointers = new Map();
      this.keys = new Set();
      // écran tactile (mis à jour à chaque toucher ou clic)
      this.touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
      document.body.classList.toggle('touch', this.touch);
      this.buildTabs();
      this.bindTop();
      this.bindCanvas();
      this.bindKeys();
      this.bindTips();
      this.bindGame();
      this.bindMinimap();
    }

    /* ------------------------------------------------------------------
       Barre du haut
       ------------------------------------------------------------------ */
    bindTop() {
      $('#speed').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        this.setSpeed(+b.dataset.speed);
      });
      $('#btn-sound').addEventListener('click', () => this.toggleSound());
      $('#btn-music').addEventListener('click', () => this.toggleMusic());
      $('#btn-music').classList.toggle('off', !this.sound.musicOn);
      $('#btn-menu').addEventListener('click', () => this.openMenu());
      $('#st-rating').addEventListener('click', () => this.openStats());
      $('#st-money').addEventListener('click', () => this.openStats());
      const chip = el('button', 'stat player-chip', '');
      chip.id = 'st-player';
      $('.brand').after(chip);
      chip.addEventListener('click', () => { const p = this.game.pl; if (p) { this.focus(p.x * T, p.y * T); this.sound.play('click'); } });
      this.refreshPlayer();
      this.refreshSpeed();
      // boussole : indique le nord ; un toucher remet le nord en haut et redresse la vue
      {
        const cp = el('button', 'glass', '<span class="needle"><b>N</b><i></i></span>');
        cp.id = 'compass';
        cp.dataset.tip = 'Remettre le nord en haut. Deux doigts : tourner, zoomer ; deux doigts glissés vers le haut ou le bas : incliner.';
        cp.addEventListener('click', () => { const c = this.r.cam; c.tyaw = Math.round(c.yaw / U.TAU) * U.TAU; c.pitchOff = 0; this.sound.play('click'); });
        $('#app').appendChild(cp);
        this.compass = cp.querySelector('.needle');
      }
      // hauteurs des barres, pour placer le reste sans chevauchement
      const layout = () => {
        const tb = $('#topbar').getBoundingClientRect(), bb = $('#buildbar').getBoundingClientRect();
        document.documentElement.style.setProperty('--top-h', Math.round(tb.bottom + 8) + 'px');
        document.documentElement.style.setProperty('--bb-h', Math.round(innerHeight - bb.top + 8) + 'px');
      };
      if (window.ResizeObserver) { const ro = new ResizeObserver(layout); ro.observe($('#topbar')); ro.observe($('#buildbar')); }
      window.addEventListener('resize', layout);
      layout();
      if (innerWidth < 680 || innerHeight < 520) $('#minimap').classList.add('small');
    }

    refreshPlayer() {
      const chip = $('#st-player'), pl = this.game.s && this.game.s.player;
      if (!chip || !pl) return;
      const av = DZ.avatarOf(pl);
      chip.innerHTML = `<span class="ico">${av.emoji}</span><span class="val">${esc(pl.name)}</span>`;
      chip.dataset.tip = `${av.title} du parc · ${av.name}. Cliquez pour centrer la vue.`;
    }

    /* Choix du nom, du genre et de l'avatar au début d'une partie. */
    avatarThumb(i, g) {
      const key = 'av' + i + g;
      return this.thumbs[key] || (this.thumbs[key] = this.r.thumbAvatar(i, g, 120, 110));
    }
    openPlayerSetup(opts, onDone) {
      opts = opts || {};
      const pl = { name: opts.name || '', gender: opts.gender || 'f', avatar: opts.avatar || 0 };
      const html = `<h2>${esc(opts.title || 'Nouvelle partie')}</h2><p>${esc(opts.text || 'Qui dirige le parc ? Choisissez votre nom, votre genre et votre avatar : il se rendra sur place à chacune de vos actions.')}</p>
        <label class="field"><span>Nom</span><input id="pl-name" maxlength="20" value="${esc(pl.name)}" placeholder="Votre nom" autocomplete="off" spellcheck="false"></label>
        <div class="field"><span>Genre</span><div class="seg" id="pl-gender">${DZ.GENDERS.map((g) => `<button data-g="${g.id}" class="${g.id === pl.gender ? 'on' : ''}">${g.label}</button>`).join('')}</div></div>
        <div class="grid avatars">${DZ.AVATARS.map((a, i) => `<button class="choice" data-av="${i}"><canvas></canvas><div class="n"></div></button>`).join('')}</div>
        <div class="btns"><button class="btn primary" data-go>${esc(opts.go || 'Commencer')}</button></div>`;
      this.modal(html, (card) => {
        $('#modal').onclick = null; // un choix est attendu
        const refresh = () => card.querySelectorAll('[data-av]').forEach((btn) => {
          const i = +btn.dataset.av;
          btn.classList.toggle('sel', i === pl.avatar);
          btn.querySelector('.n').textContent = DZ.AVATARS[i].name[pl.gender];
          const c = btn.querySelector('canvas'), src = this.avatarThumb(i, pl.gender);
          c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
        });
        card.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
          pl.gender = b.dataset.g;
          card.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x === b));
          refresh(); this.sound.play('click');
        }));
        card.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', () => {
          pl.avatar = +b.dataset.av;
          card.querySelectorAll('[data-av]').forEach((x) => x.classList.toggle('sel', x === b));
          this.sound.play('click');
        }));
        const input = card.querySelector('#pl-name');
        const go = () => {
          const name = input.value.trim().slice(0, 20) || (pl.gender === 'f' ? 'Directrice' : pl.gender === 'h' ? 'Directeur' : 'Direction');
          this.closeModal();
          onDone({ name, gender: pl.gender, avatar: pl.avatar });
        };
        card.querySelector('[data-go]').addEventListener('click', go);
        input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
        refresh();
        setTimeout(() => input.focus(), 50);
      });
    }
    greet() {
      const pl = this.game.s.player, av = DZ.avatarOf(pl);
      this.toast(av.emoji, `Bienvenue, ${pl.gender === 'a' ? '' : av.title + ' '}${esc(pl.name)} ! Votre avatar se rendra sur chaque chantier et auprès de chaque dinosaure.`, 'good');
    }

    setSpeed(i) { this.game.setSpeed(i); this.refreshSpeed(); this.sound.play('click'); }
    refreshSpeed() { document.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === this.game.speedIndex)); }

    toggleSound() {
      const st = DZ.Save.settings();
      st.muted = !this.sound.muted;
      this.sound.setMuted(st.muted);
      DZ.Save.setSettings(st);
      $('#btn-sound').textContent = st.muted ? '🔇' : '🔊';
    }

    toggleMusic() {
      this.sound.init();
      const on = !this.sound.musicOn;
      this.sound.setMusic(on);
      const st = DZ.Save.settings(); st.musicOn = on; DZ.Save.setSettings(st);
      $('#btn-music').classList.toggle('off', !on);
      this.toast('🎵', on ? 'Musique activée' : 'Musique coupée', 'music');
    }

    /* Position 3D (cases) d'un point de la carte, pour le son spatialisé. */
    pos3(x, y, up) {
      const h = this.r.world ? this.r.world.heightAt(x, y) : 0;
      return [x, h + (up || 0.6), y];
    }

    updateTop(dt) {
      const s = this.game.s;
      // compteur d'argent animé
      const diff = s.money - this.moneyShown;
      if (Math.abs(diff) < 1) this.moneyShown = s.money;
      else this.moneyShown += diff * Math.min(1, dt * 6) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 40);
      const m = $('#money');
      m.textContent = money(this.moneyShown);
      m.classList.toggle('up', diff > 1); m.classList.toggle('down', diff < -1);
      $('#day').textContent = 'Jour ' + s.day;
      $('#clock').textContent = U.hourStr(s.hour);
      $('#visitors').textContent = U.fmt(this.game.visitorsInPark());
      $('#rating').textContent = s.rating.toFixed(1).replace('.', ',');
      $('#stars-fill').style.width = (s.rating / 5 * 100) + '%';
      $('#st-money').dataset.tip = `<b>Argent</b><div class="t-grid"><span>Disponible</span><span>${money(s.money)}</span><span>Gains totaux</span><span>${money(s.totalEarned)}</span><span>Billet d'entrée</span><span>${money(this.game.ticketPrice())}</span></div>`;
      $('#st-vis').dataset.tip = `<b>Visiteurs</b><div class="t-grid"><span>Dans le parc</span><span>${U.fmt(this.game.visitorsInPark())}</span><span>Aujourd'hui</span><span>${U.fmt(s.today.visitors)}</span><span>Attendus</span><span>~${U.fmt(this.game.dailyTarget)}</span></div>`;
      const sc = this.game.dayScore();
      $('#st-rating').dataset.tip = `<b>Note du parc : ${s.rating.toFixed(2)} ★</b><div class="t-sub">Mise à jour chaque soir. Cliquez pour le détail.</div><div class="t-grid"><span>Satisfaction</span><span>${Math.round(sc.satisfaction)}</span><span>Propreté</span><span>${Math.round(sc.cleanliness)}</span><span>Diversité</span><span>${Math.round(sc.diversity)}</span><span>Qualité des enclos</span><span>${Math.round(sc.quality)}</span><span>Bien-être animal</span><span>${Math.round(sc.welfare)}</span></div>`;
      const ev = $('#st-event');
      const labels = { affluence: '🎉 Forte affluence', storm: '⛈️ Orage', sick: '🤒 Dinosaure malade', critic: '📝 Critique en visite', sponsor: '🤝 Mécène' };
      if (s.event && labels[s.event]) { ev.classList.remove('hidden'); ev.textContent = labels[s.event]; }
      else ev.classList.add('hidden');
    }

    moneyDelta(amount) {
      if (Math.abs(amount) < 40) return;
      const d = $('#money-delta');
      d.textContent = (amount > 0 ? '+' : '') + money(amount);
      d.className = 'show ' + (amount > 0 ? 'pos' : 'neg');
      void d.offsetWidth;
      d.classList.add('show');
    }

    /* ------------------------------------------------------------------
       Menu de construction
       ------------------------------------------------------------------ */
    buildTabs() {
      $('#buildbar').classList.remove('collapsed');
      const tabs = $('#tabs');
      tabs.innerHTML = '';
      for (const t of TABS) {
        const b = el('button', 'tab' + (t.id === this.tab ? ' on' : ''), `<span class="k">${t.icon}</span>${t.name}`);
        b.dataset.tab = t.id;
        b.addEventListener('click', () => {
          const bar = $('#buildbar');
          // toucher l'onglet déjà ouvert replie la barre (plus de place pour la carte)
          if (t.id === this.tab && !bar.classList.contains('collapsed')) { bar.classList.add('collapsed'); this.sound.play('click'); return; }
          bar.classList.remove('collapsed');
          this.tab = t.id; this.buildTabs(); this.sound.play('click');
        });
        tabs.appendChild(b);
      }
      this.buildItems();
    }

    thumb(key, make) {
      if (!this.thumbs[key]) this.thumbs[key] = make();
      const c = this.thumbs[key];
      const copy = R.canvas(c.width, c.height);
      copy.getContext('2d').drawImage(c, 0, 0);
      return copy;
    }

    buildItems() {
      const box = $('#items');
      box.innerHTML = '';
      const tab = TABS.find((t) => t.id === this.tab);
      const s = this.game.s;
      if (tab.items === 'dinos') {
        let fam = null;
        for (const id of DZ.SPECIES_ORDER) {
          const sp = DZ.SPECIES[id], bal = C.dinos[id];
          if (sp.family !== fam) { fam = sp.family; const sep = el('div', 'family-sep', DZ.FAMILIES[fam].short); sep.title = DZ.FAMILIES[fam].name; box.appendChild(sep); }
          const it = el('div', 'item');
          it.dataset.dino = id;
          it.appendChild(this.thumb('d_' + id, () => R.dinoThumb(id, 100, 56)));
          it.appendChild(el('div', 'name', esc(sp.short || sp.name)));
          it.appendChild(el('div', 'price', money(bal.price)));
          if (!s.unlocked[id]) {
            it.classList.add('locked');
            it.appendChild(el('div', 'lock', `<b>🔒</b>Jour ${bal.unlockDay}${bal.unlockRating ? ` · ${String(bal.unlockRating).replace('.', ',')} ★` : ''}`));
          } else if (!this.seenUnlocked.has(id) && s.unlocked[id] > 1 && s.unlocked[id] >= s.day - 1) it.appendChild(el('span', 'new', 'NOUVEAU'));
          it.dataset.tip = this.dinoTip(id);
          it.addEventListener('click', () => {
            if (!s.unlocked[id]) { this.toast('🔒', `${sp.name} se débloque au jour ${bal.unlockDay}${bal.unlockRating ? ' avec une note de ' + bal.unlockRating + ' ★' : ''}.`, 'error'); return; }
            this.seenUnlocked.add(id);
            this.setTool({ kind: 'dino', species: id });
          });
          box.appendChild(it);
        }
      } else {
        for (const key of tab.items) {
          const it = el('div', 'item');
          if (TOOLS[key]) {
            const tl = TOOLS[key];
            it.appendChild(el('div', 'emoji', tl.icon));
            it.appendChild(el('div', 'name', tl.name));
            it.appendChild(el('div', 'price', key === 'select' ? 'Échap' : key === 'move' ? 'Touche M' : key === 'link' ? 'dès ' + money(Math.round(C.links.base * C.links.gateFactor)) : key === 'merge' ? 'Enclos voisins' : key === 'sky' ? 'dès ' + money(this.game.skyCost(4)) : 'Touche X'));
            it.dataset.tip = `<b>${tl.name}</b><div class="t-sub">${tl.desc}</div>`;
            it.dataset.tool = key;
            it.addEventListener('click', () => this.setTool({ kind: key }));
          } else if (key === 'path') {
            it.appendChild(this.thumb('path', () => this.pathThumb()));
            it.appendChild(el('div', 'name', 'Chemin'));
            it.appendChild(el('div', 'price', money(C.path.cost) + ' / case'));
            it.dataset.tip = `<b>Chemin dallé</b><div class="t-sub">${BUILD_DESC.path}</div><div class="t-grid"><span>Case</span><span>${money(C.path.cost)}</span><span>Pont</span><span>${money(C.path.bridgeCost)}</span></div><div class="t-sub">Cliquez-glissez pour tracer.</div>`;
            it.dataset.tool = 'path';
            it.addEventListener('click', () => this.setTool({ kind: 'path' }));
          } else {
            const def = C.buildings[key];
            it.appendChild(this.thumb('b_' + key, () => R.buildingThumb(key, 100, 56)));
            it.appendChild(el('div', 'name', esc(def.name)));
            it.appendChild(el('div', 'price', money(def.cost)));
            it.dataset.tip = this.buildTip(key);
            it.dataset.build = key;
            it.addEventListener('click', () => this.setTool({ kind: 'build', type: key }));
          }
          box.appendChild(it);
        }
      }
      this.refreshItems();
    }

    refreshItems() {
      const s = this.game.s;
      document.querySelectorAll('#items .item').forEach((it) => {
        let on = false, cost = null;
        if (it.dataset.build) { on = this.tool.kind === 'build' && this.tool.type === it.dataset.build; cost = C.buildings[it.dataset.build].cost; }
        else if (it.dataset.dino) { on = this.tool.kind === 'dino' && this.tool.species === it.dataset.dino; cost = C.dinos[it.dataset.dino].price; }
        else if (it.dataset.tool) { on = this.tool.kind === it.dataset.tool; if (it.dataset.tool === 'path') cost = C.path.cost; }
        it.classList.toggle('on', on);
        it.classList.toggle('poor', cost != null && s.money < cost);
      });
    }

    pathThumb() {
      const c = R.canvas(200, 112), g = c.getContext('2d');
      g.scale(2, 2);
      g.fillStyle = '#58783a'; g.fillRect(0, 0, 100, 56);
      g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 60; i++) g.fillRect((i * 37) % 100, (i * 23) % 56, 1.5, 3);
      g.fillStyle = '#b5a68b'; g.fillRect(0, 16, 100, 24);
      g.strokeStyle = 'rgba(80,70,55,0.35)'; g.lineWidth = 0.6;
      for (let x = 4; x < 100; x += 9) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 3, 40); g.stroke(); }
      g.beginPath(); g.moveTo(0, 28); g.lineTo(100, 28); g.stroke();
      g.fillStyle = '#6c6354'; g.fillRect(0, 16, 100, 2); g.fillRect(0, 38, 100, 2);
      return c;
    }

    dinoTip(id) {
      const sp = DZ.SPECIES[id], bal = C.dinos[id], fam = DZ.FAMILIES[sp.family];
      const hab = sp.habitat === 'air' ? 'Volière' : sp.habitat === 'water' ? 'Lagon marin' : sp.size === 'L' ? 'Grand enclos' : sp.size === 'M' ? 'Enclos moyen ou grand' : 'Tout enclos';
      return `<b>${esc(sp.name)}</b><div class="t-sub">${fam.name} · ${sp.diet} · ${sp.period}</div>` +
        `<div class="t-grid"><span>Prix</span><span>${money(bal.price)}</span><span>Attractivité</span><span>${bal.attraction}</span><span>Nourriture / jour</span><span>${money(bal.upkeep)}</span><span>Place occupée</span><span>${bal.space}</span><span>Habitat</span><span>${hab}</span></div>` +
        `<div class="t-sub" style="margin-top:4px">${esc(sp.desc)}${sp.predator ? ' <br>⚠️ Prédateur : ne cohabite qu\'avec sa propre espèce.' : ''}${sp.social ? '<br>👥 Grégaire : préfère vivre en groupe.' : ''}</div>`;
    }

    buildTip(key) {
      const def = C.buildings[key];
      let grid = `<span>Prix</span><span>${money(def.cost)}</span>`;
      if (def.upkeep) grid += `<span>Entretien / jour</span><span>${money(def.upkeep[0])}</span>`;
      if (def.space) grid += `<span>Place</span><span>${def.space} (×2 au niveau 3)</span><span>Taille</span><span>${def.w} × ${def.h}</span>`;
      if (def.spend) grid += `<span>Dépense / visiteur</span><span>${money(def.spend[0])}</span>`;
      if (def.satisfaction) grid += `<span>Satisfaction</span><span>+${def.satisfaction[0]}</span>`;
      if (def.fun) grid += `<span>Amusement</span><span>+${def.fun[0]} satisfaction</span><span>Enfants à la fois</span><span>${def.kids[0]}</span>`;
      if (def.attraction && !def.space) grid += `<span>Attractivité</span><span>+${Array.isArray(def.attraction) ? def.attraction[0] : def.attraction}</span>`;
      return `<b>${esc(def.name)}</b><div class="t-sub">${BUILD_DESC[key] || ''}</div><div class="t-grid">${grid}</div>`;
    }

    /* ------------------------------------------------------------------
       Outils
       ------------------------------------------------------------------ */
    setTool(t) {
      this.tool = t;
      this.r.ghost = null;
      this.r.highlightEnclosures = null;
      this.canvas.className = '';
      const hint = $('#toolhint');
      let text = '';
      if (t.kind === 'path') { text = '🛤️ Cliquez-glissez pour tracer un chemin'; this.canvas.classList.add('tool-path'); }
      else if (t.kind === 'build') { text = `${C.buildings[t.type].icon} Placez : ${C.buildings[t.type].name} — reliez-le à un chemin`; this.canvas.classList.add('tool-build'); }
      else if (t.kind === 'dino') {
        const sp = DZ.SPECIES[t.species];
        text = `🦖 Cliquez sur un enclos adapté pour y installer un ${sp.short || sp.name}`;
        this.r.highlightEnclosures = (b) => this.game.canAddDino(t.species, b).ok;
      }
      else if (t.kind === 'demolish') { text = '🧨 Cliquez sur un bâtiment ou glissez sur des chemins pour démolir'; this.canvas.classList.add('tool-demolish'); }
      else if (t.kind === 'move') { text = t.id ? '✋ Choisissez le nouvel emplacement' : '✋ Choisissez le bâtiment à déplacer'; }
      else if (t.kind === 'sky') { text = t.a ? '🔭 Passerelle d\'observation : cliquez de l\'autre côté de l\'enclos' : '🔭 Passerelle d\'observation : cliquez d\'un côté de l\'enclos (à côté d\'un chemin)'; this.canvas.classList.add('tool-path'); }
      else if (t.kind === 'transfer') {
        const g = this.game, d = g.dinos.find((x) => x.id === t.dino);
        text = d ? (d.loose ? `🚁 Cliquez sur l'enclos où ramener ${esc(d.name)}` : `🚁 Cliquez sur le nouvel enclos de ${esc(d.name)}`) : '';
        this.r.highlightEnclosures = (b) => !!d && g.canTransfer(d, b).ok;
      }
      else if (t.kind === 'link' || t.kind === 'merge') {
        const g = this.game, a = t.a && g.buildings[t.a];
        const verb = t.kind === 'link' ? '🌉 Passerelle' : '🔗 Réunir';
        text = a ? `${verb} : cliquez sur le second enclos` : `${verb} : cliquez sur un premier enclos terrestre`;
        this.r.highlightEnclosures = (b) => {
          if (!a) return C.buildings[b.type].kind === 'land';
          if (b === a) return true;
          const p = t.kind === 'link' ? g.linkPlan(a.id, b.id) : g.mergePlan(a.id, b.id);
          return p.ok;
        };
      }
      this.pending = null;
      if (t.kind === 'build' && this.touch && C.buildings[t.type].cat !== 'deco') text = `${C.buildings[t.type].icon} Touchez l'endroit voulu pour : ${C.buildings[t.type].name}`;
      if (this.touch && text) text = text.replace(/Cliquez-glissez/g, 'Glissez le doigt').replace(/Cliquez/g, 'Touchez').replace(/glissez/g, 'glissez le doigt');
      if (text) this.showHint(text);
      else hint.classList.add('hidden');
      this.refreshItems();
      if (t.kind !== 'select') this.sound.play('click');
    }

    showHint(text) {
      const hint = $('#toolhint');
      hint.innerHTML = `<span>${text}</span>${this.touch ? '' : ' <kbd>Échap</kbd>'}<button class="btn small hint-x" data-cancel aria-label="Annuler l'outil">✕ Annuler</button>`;
      hint.classList.remove('hidden');
      hint.querySelector('[data-cancel]').onclick = () => this.setTool({ kind: 'select' });
    }

    tileAt(sx, sy) {
      const w = this.r.screenToWorld(sx, sy);
      return { x: Math.floor(w.x / T), y: Math.floor(w.y / T), wx: w.x, wy: w.y };
    }

    updateGhost(sx, sy) {
      const t = this.tool, g = this.game;
      if (this.pending) return;
      const p = this.tileAt(sx, sy);
      this.hoverTile = p;
      if (t.kind === 'path') {
        this.r.ghost = { kind: 'tile', x: p.x, y: p.y, ok: g.canPath(p.x, p.y).ok || g.isPath(p.x, p.y) };
      } else if (t.kind === 'build' || (t.kind === 'move' && t.id)) {
        const type = t.kind === 'build' ? t.type : g.buildings[t.id].type;
        const def = C.buildings[type];
        const x = Math.floor(p.wx / T - def.w / 2 + 0.5), y = Math.floor(p.wy / T - def.h / 2 + 0.5);
        const ok = t.kind === 'build' ? g.canPlace(type, x, y).ok : g.canPlace(type, x, y, t.id, true).ok;
        this.r.ghost = { kind: 'building', type, x, y, ok, level: t.kind === 'move' ? g.buildings[t.id].level : 1 };
      } else if (t.kind === 'sky') {
        if (t.a) { const plan = g.skyPlan(t.a[0], t.a[1], p.x, p.y); this.r.ghost = { kind: 'sky', a: t.a, plan, ok: plan.ok }; }
        else this.r.ghost = { kind: 'sky', a: [p.x, p.y], plan: null, ok: true };
      } else if (t.kind === 'demolish' || (t.kind === 'move' && !t.id)) {
        const b = g.buildingAt(p.x, p.y), l = g.linkAtTile(p.x, p.y) || this.rampAt(p);
        const sk = t.kind === 'demolish' && g.skyRunAt(p.x, p.y);
        if (sk) this.r.ghost = { kind: 'demolish', sky: sk };
        else if (b && !b.fixed && !(t.kind === 'demolish' && l)) this.r.ghost = { kind: 'demolish', building: b };
        else if (t.kind === 'demolish' && l) this.r.ghost = { kind: 'demolish', link: l };
        else if (t.kind === 'demolish' && g.isPath(p.x, p.y)) this.r.ghost = { kind: 'demolish', x: p.x, y: p.y };
        else this.r.ghost = null;
      } else if ((t.kind === 'link' || t.kind === 'merge') && t.a) {
        const b = g.buildingAt(p.x, p.y);
        if (b && b.id !== t.a && g.isEnclosure(b)) {
          const plan = t.kind === 'link' ? g.linkPlan(t.a, b.id) : g.mergePlan(t.a, b.id);
          this.r.ghost = { kind: t.kind, a: t.a, b: b.id, plan, ok: plan.ok };
        } else this.r.ghost = { kind: t.kind, a: t.a, b: null, ok: true };
      } else this.r.ghost = null;
    }

    setPending(pp) {
      const g = this.game;
      this.pending = pp;
      const ok = pp.id ? g.canPlace(pp.type, pp.x, pp.y, pp.id, true).ok : g.canPlace(pp.type, pp.x, pp.y).ok;
      this.r.ghost = { kind: 'building', type: pp.type, x: pp.x, y: pp.y, ok, level: pp.level };
      this.showHint(ok ? `👆 Touchez l'aperçu pour ${pp.id ? 'le déplacer ici' : 'construire'} · ailleurs pour le déplacer` : `✋ ${esc((pp.id ? g.canPlace(pp.type, pp.x, pp.y, pp.id, true) : g.canPlace(pp.type, pp.x, pp.y)).reason || 'Emplacement impossible')} · touchez ailleurs`);
      this.sound.play('click');
    }

    applyTool(sx, sy, dragging) {
      const t = this.tool, g = this.game;
      const p = this.tileAt(sx, sy);
      if (t.kind === 'path') {
        if (g.isPath(p.x, p.y)) return;
        const r = g.placePath(p.x, p.y);
        if (r.ok) { if (!dragging) this.sound.play('build'); else if (Math.random() < 0.3) this.sound.play('click'); }
        else if (!dragging && r.reason) this.error(r.reason);
      } else if (t.kind === 'build' && !dragging) {
        const def = C.buildings[t.type];
        let x = Math.floor(p.wx / T - def.w / 2 + 0.5), y = Math.floor(p.wy / T - def.h / 2 + 0.5);
        // au doigt : un premier toucher montre l'aperçu, un second sur l'aperçu construit
        if (this.touch && def.cat !== 'deco') {
          const pp = this.pending;
          const inside = pp && pp.type === t.type && p.x >= pp.x - 0.5 && p.x < pp.x + def.w + 0.5 && p.y >= pp.y - 0.5 && p.y < pp.y + def.h + 0.5;
          if (!inside) { this.setPending({ type: t.type, x, y, level: 1 }); return; }
          x = pp.x; y = pp.y; this.pending = null;
        }
        const r = g.build(t.type, x, y);
        if (r.ok) {
          this.sound.play('build');
          if (def.cat !== 'deco') this.toast('🚧', `Chantier lancé : ${def.name}, prêt dans ≈ ${fmtH(r.building.cons.dur)}.${!g.accessTiles(r.building).length ? ' Reliez-le à un chemin pour que les visiteurs puissent y accéder.' : ''}`, 'info');
          if (def.cat === 'enclos') { this.select({ kind: 'building', id: r.building.id }); this.setTool({ kind: 'select' }); }
        } else this.error(r.reason);
      } else if ((t.kind === 'link' || t.kind === 'merge') && !dragging) {
        const b = g.buildingAt(p.x, p.y);
        if (!b || !g.isEnclosure(b)) { this.error('Cliquez sur un enclos'); return; }
        if (!t.a || b.id === t.a) {
          if (C.buildings[b.type].kind !== 'land') { this.error(t.kind === 'link' ? 'Les passerelles relient deux enclos terrestres' : 'Seuls les enclos terrestres peuvent être réunis'); return; }
          if (b.id === t.a) { this.setTool({ kind: t.kind }); return; }
          this.setTool({ kind: t.kind, a: b.id }); this.sound.play('click'); return;
        }
        // au doigt : un premier toucher montre l'aperçu, un second confirme
        if (this.touch && !(this.pending && this.pending.target === b.id)) {
          const plan = t.kind === 'link' ? g.linkPlan(t.a, b.id) : g.mergePlan(t.a, b.id);
          this.pending = { target: b.id };
          this.r.ghost = { kind: t.kind, a: t.a, b: b.id, plan, ok: plan.ok };
          this.showHint(plan.ok ? `👆 ${t.kind === 'link' ? 'Passerelle' : 'Réunion'} : ${money(plan.cost)} · touchez à nouveau cet enclos pour confirmer` : `✋ ${esc(plan.reason)} · touchez un autre enclos`);
          return;
        }
        this.pending = null;
        if (t.kind === 'link') this.doLink(t.a, b.id); else this.doMerge(t.a, b.id);
        return;
      } else if (t.kind === 'sky' && !dragging) {
        if (!t.a) { this.setTool({ kind: 'sky', a: [p.x, p.y] }); this.updateGhost(sx, sy); return; }
        const plan = g.skyPlan(t.a[0], t.a[1], p.x, p.y);
        // au doigt : un premier toucher montre le tracé, un second au même endroit confirme
        if (this.touch && !(this.pending && this.pending.x === p.x && this.pending.y === p.y)) {
          this.pending = { x: p.x, y: p.y };
          this.r.ghost = { kind: 'sky', a: t.a, plan, ok: plan.ok };
          this.showHint(plan.ok ? `👆 Passerelle de ${plan.len} cases : ${money(plan.cost)} · touchez à nouveau pour confirmer` : `✋ ${esc(plan.reason)} · touchez ailleurs`);
          return;
        }
        this.pending = null;
        if (!plan.ok) { this.error(plan.reason); return; }
        const r = g.buildSky(t.a[0], t.a[1], p.x, p.y);
        if (r.ok) { this.sound.play('build'); this.toast('🔭', `Passerelle d'observation construite : ${r.plan.len} cases au-dessus ${r.plan.encs.length > 1 ? 'des enclos' : 'de l\'enclos'}. Les visiteurs vont adorer la vue.`, 'good'); this.setTool({ kind: 'sky' }); }
        else this.error(r.reason);
        return;
      } else if (t.kind === 'transfer' && !dragging) {
        const b = g.buildingAt(p.x, p.y);
        if (!b || !g.isEnclosure(b)) { this.error('Cliquez sur un enclos'); return; }
        this.doTransfer(t.dino, b.id);
        return;
      } else if (t.kind === 'demolish') {
        const b = g.buildingAt(p.x, p.y), l = !dragging && (g.linkAtTile(p.x, p.y) || this.rampAt(p));
        const sk = !dragging && g.skyRunAt(p.x, p.y);
        if (sk) { this.demolishSky(sk); return; }
        if (l) this.demolishLink(l);
        else if (b && !dragging) this.demolish(b);
        else if (!b && g.isPath(p.x, p.y)) { const r = g.removePath(p.x, p.y); if (!r.ok && r.reason && !dragging) this.error(r.reason); }
      } else if (t.kind === 'dino' && !dragging) {
        const b = g.buildingAt(p.x, p.y);
        if (!b || !g.isEnclosure(b)) { this.error('Cliquez sur un enclos'); return; }
        const r = g.buyDino(t.species, b.id, this.defaultSex(b, t.species));
        if (r.ok) { this.sound.play('upgrade'); this.deliveryToast(r.delivery); this.select({ kind: 'building', id: b.id }); }
        else this.error(r.reason);
      } else if (t.kind === 'move' && !dragging) {
        if (!t.id) {
          const b = g.buildingAt(p.x, p.y);
          if (b && !b.fixed) this.setTool({ kind: 'move', id: b.id });
          else if (b) this.error('L\'entrée ne peut pas être déplacée');
        } else {
          const def = C.buildings[g.buildings[t.id].type];
          let x = Math.floor(p.wx / T - def.w / 2 + 0.5), y = Math.floor(p.wy / T - def.h / 2 + 0.5);
          if (this.touch) {
            const pp = this.pending;
            const inside = pp && pp.id === t.id && p.x >= pp.x - 0.5 && p.x < pp.x + def.w + 0.5 && p.y >= pp.y - 0.5 && p.y < pp.y + def.h + 0.5;
            if (!inside) { this.setPending({ id: t.id, type: g.buildings[t.id].type, x, y, level: g.buildings[t.id].level }); return; }
            x = pp.x; y = pp.y; this.pending = null;
          }
          const r = g.moveBuilding(t.id, x, y);
          if (r.ok) { this.sound.play('build'); this.setTool({ kind: 'move' }); }
          else this.error(r.reason);
        }
      } else if (t.kind === 'select' && !dragging) {
        const d = this.r.pickDinoAt(sx, sy);
        if (d) { this.select({ kind: 'dino', id: d.id }); this.sound.play('click'); return; }
        const l = g.linkAtTile(p.x, p.y);
        if (l) { this.select({ kind: 'link', id: l.id }); this.sound.play('click'); return; }
        if (g.sky[p.y * C.map.w + p.x]) { this.select({ kind: 'sky', x: p.x, y: p.y }); this.sound.play('click'); return; }
        const b = g.buildingAt(p.x, p.y);
        if (b) { this.select({ kind: 'building', id: b.id }); this.sound.play('click'); }
        else this.select(null);
      }
      this.updateGhost(sx, sy);
    }

    demolish(b) {
      const g = this.game;
      if (b.fixed) { this.error('L\'entrée du parc ne peut pas être démolie'); return; }
      const dinos = g.dinosIn(b);
      const def = C.buildings[b.type];
      const doIt = () => {
        const r = g.demolish(b.id);
        if (r.ok) { this.sound.play('build'); this.toast('🧨', `${def.name} démoli : ${money(r.refund)} remboursés.`, 'info'); if (this.r.selected && this.r.selected.id === b.id) this.select(null); }
        else this.error(r.reason);
      };
      if (dinos.length) this.confirm('Démolir cet enclos ?', `${dinos.length} dinosaure${dinos.length > 1 ? 's' : ''} ${dinos.length > 1 ? 'seront revendus' : 'sera revendu'} à ${Math.round(C.economy.dinoSellRate * 100)} % de leur valeur.`, 'Démolir', doIt);
      else doIt();
    }

    /* Rampe de passerelle sous le pointeur (à l'intérieur d'un enclos). */
    rampAt(p) {
      const g = this.game, b = g.buildingAt(p.x, p.y);
      if (!b || !g.isEnclosure(b)) return null;
      const gt = g.gatesOf(b).find((q) => p.wx / T > q.x0 && p.wx / T < q.x1 && p.wy / T > q.y0 && p.wy / T < q.y1);
      return gt ? gt.link : null;
    }
    linkName(l) {
      const g = this.game, A = g.buildings[l.a], B = g.buildings[l.b];
      return `${l.len ? 'Passerelle' : 'Porte'} ${A ? esc(DZ.bName(A)) : '?'} ↔ ${B ? esc(DZ.bName(B)) : '?'}`;
    }
    doLink(aId, bId) {
      const g = this.game, r = g.buildLink(aId, bId);
      if (!r.ok) { this.error(r.reason); return; }
      this.sound.play('build');
      this.toast('🚧', `Chantier lancé : ${r.link.len ? `passerelle de ${r.link.len} case${r.link.len > 1 ? 's' : ''}` : 'porte entre les deux enclos'}, prête dans ≈ ${fmtH(r.link.cons.dur)}.`, 'info');
      this.setTool({ kind: 'select' });
      this.select({ kind: 'building', id: aId });
    }
    doMerge(aId, bId) {
      const g = this.game, p = g.mergePlan(aId, bId);
      if (!p.ok) { this.error(p.reason); return; }
      const A = g.buildings[aId], B = g.buildings[bId];
      const n = g.dinosIn(A).length + g.dinosIn(B).length;
      const lv = p.level > Math.min(A.level, B.level) ? ` L'enclos le moins avancé passe au niveau ${p.level} (compris dans le prix).` : '';
      const sz = p.size === 'L' ? ' Il accueillera les grandes espèces.' : p.size === 'M' ? ' Il accueillera les espèces moyennes.' : '';
      this.confirm('Réunir ces deux enclos ?', `La clôture commune (${p.shared} cases) sera démontée : place ${g.capacity(A)} + ${g.capacity(B)} → ${p.cap}.${sz}${lv} ${n ? `Les ${n} pensionnaires vivront ensemble : attention aux prédateurs et aux mâles rivaux.` : ''} Coût ${money(p.cost)}, travaux ≈ ${fmtH(p.hours)}.`, 'Réunir', () => {
        const r = g.mergeEnclosures(aId, bId);
        if (!r.ok) { this.error(r.reason); return; }
        this.sound.play('build');
        this.toast('🔗', `Réunion des enclos lancée : prête dans ≈ ${fmtH(r.hours)}.`, 'info');
        this.setTool({ kind: 'select' });
        this.select({ kind: 'building', id: aId });
      });
    }
    demolishSky(r) {
      const g = this.game, refund = Math.round(g.skyCost(r.len) * C.economy.refundRate);
      this.confirm('Démolir cette passerelle d\'observation ?', `Les ${r.len} cases du tablier et leurs escaliers seront démontés. Remboursement : ${money(refund)}.`, 'Démolir', () => {
        const res = g.demolishSky(r.x, r.y);
        if (res.ok) { this.sound.play('build'); this.toast('🧨', `Passerelle d'observation démolie : ${money(res.refund)} remboursés.`, 'info'); if (this.panelSel && this.panelSel.kind === 'sky') this.select(null); }
      });
    }
    /* Transfert d'un dinosaure : confirmation (prix, dangers), puis vétérinaire et hélicoptère. */
    doTransfer(dinoId, bid) {
      const g = this.game, d = g.dinos.find((x) => x.id === dinoId), b = g.buildings[bid];
      const c = g.canTransfer(d, b);
      if (!c.ok) { this.error(c.reason); return; }
      const warn = [];
      if (c.warning) warn.push(`⚠️ ${capFirst(DZ.leSp(c.warning.predator))} risque d'attaquer ${DZ.leSp(c.warning.prey)} dans cet enclos.`);
      if (c.rivals) warn.push(`⚔️ ${c.rivals} autre${c.rivals > 1 ? 's' : ''} mâle${c.rivals > 1 ? 's' : ''} de son espèce y vi${c.rivals > 1 ? 'vent' : 't'} déjà : risque de combats.`);
      const loose = !!d.loose;
      this.confirm(`${loose ? 'Capturer' : 'Transférer'} ${d.name} ?`, `Une vétérinaire va ${loose ? 'le rattraper et ' : ''}l'endormir avec une fléchette, puis un hélicoptère ${d.sex === 'F' ? 'la' : 'le'} portera dans un filet jusqu'à ${esc(DZ.bName(b))}${loose && b.id === d.enc ? ' (son enclos, réparé)' : ''}. Coût : ${money(c.cost)}.${warn.length ? '<br><br>' + warn.join('<br>') : ''}`, loose ? 'Capturer' : 'Transférer', () => {
        const r = g.transferDino(d.id, b.id);
        if (!r.ok) { this.error(r.reason); return; }
        this.sound.play('upgrade');
        this.toast('🩺', loose ? `La vétérinaire part à la poursuite de ${esc(d.name)}. L'hélicoptère suivra.` : `La vétérinaire part endormir ${esc(d.name)}. L'hélicoptère suivra.`, 'info');
        this.setTool({ kind: 'select' });
        this.select({ kind: 'dino', id: d.id });
      });
    }
    demolishLink(l) {
      const g = this.game;
      const refund = Math.round((l.invested || 0) * C.economy.refundRate);
      const crossing = g.dinos.filter((d) => d.cross && d.cross.l === l.id).length;
      this.confirm(`Démolir cette ${l.len ? 'passerelle' : 'porte'} ?`, `Les deux enclos ne communiqueront plus${crossing ? ' (les dinosaures en chemin regagnent leur enclos)' : ''}. Remboursement : ${money(refund)}.`, 'Démolir', () => {
        const r = g.demolishLink(l.id);
        if (r.ok) { this.sound.play('build'); this.toast('🧨', `${l.len ? 'Passerelle' : 'Porte'} démolie : ${money(r.refund)} remboursés.`, 'info'); if (this.panelSel && this.panelSel.kind === 'link') this.select(null); else this.renderPanel(); }
      });
    }

    /* ------------------------------------------------------------------
       Entrées : souris, tactile, molette, clavier
       ------------------------------------------------------------------ */
    bindCanvas() {
      const cv = this.canvas;
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      const touchish = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';
      cv.addEventListener('pointerdown', (e) => {
        this.sound.init();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointeur non capturable */ }
        if (e.isPrimary) { this.pointers.clear(); this.gestureLock = false; }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
        this.touch = touchish(e);
        document.body.classList.toggle('touch', this.touch);
        clearTimeout(this._longT);
        // deux doigts : déplacer, zoomer, tourner (et incliner)
        if (this.pointers.size >= 2) { this.startGesture(); return; }
        if (this.gestureLock) return;
        const rot = (e.button === 2 || (e.button === 0 && (e.altKey || e.ctrlKey)));
        const pan = !rot && (e.button === 1 || e.button === 2 || this.keys.has(' '));
        this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, pan, rot, button: e.button, painting: false, touch: this.touch };
        if (!pan && !rot && e.button === 0 && (this.tool.kind === 'path' || this.tool.kind === 'demolish')) {
          this.drag.painting = true;
          // au doigt, on attend de voir si un second doigt arrive avant de peindre
          if (this.touch) this.drag.paintPending = true;
          else { this.applyTool(e.clientX, e.clientY, false); this.lastPaint = this.tileAt(e.clientX, e.clientY); }
        }
        // appui long : informations sur ce qui est sous le doigt
        if (this.touch && (this.tool.kind === 'select' || this.tool.kind === 'dino')) {
          this._longT = setTimeout(() => {
            const d = this.drag;
            if (d && !d.moved && this.pointers.size === 1) { d.long = true; this.hoverTip(d.x, d.y); if (navigator.vibrate) navigator.vibrate(12); }
          }, 480);
        }
      });
      cv.addEventListener('pointermove', (e) => {
        const prev = this.pointers.get(e.pointerId);
        if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
        if (this.gesture) { if (this.pointers.size >= 2) this.moveGesture(); return; }
        if (this.gestureLock) return;
        const touch = touchish(e);
        if (!touch) this.mouse = { x: e.clientX, y: e.clientY };
        const d = this.drag;
        if (d) {
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > (d.touch ? 10 : 5)) { if (!d.moved) clearTimeout(this._longT); d.moved = true; }
          if (d.long) { this.hoverTip(e.clientX, e.clientY); d.x = e.clientX; d.y = e.clientY; return; }
          if (d.rot) {
            if (d.moved) { this.r.rotate(dx, dy); cv.classList.add('rot'); this.hideTip(); }
          } else if (d.painting) {
            if (d.paintPending) { if (!d.moved) return; d.paintPending = false; const p0 = this.r.screenToWorld(d.sx, d.sy); const s0 = this.r.worldToScreen(p0.x, p0.y); this.applyTool(s0.x, s0.y, false); this.lastPaint = this.tileAt(d.sx, d.sy); }
            const p = this.tileAt(e.clientX, e.clientY);
            if (!this.lastPaint || p.x !== this.lastPaint.x || p.y !== this.lastPaint.y) {
              // remplit les cases intermédiaires (ligne droite)
              const lp = this.lastPaint || p;
              const steps = Math.max(Math.abs(p.x - lp.x), Math.abs(p.y - lp.y));
              for (let i = 1; i <= steps; i++) {
                const x = Math.round(U.lerp(lp.x, p.x, i / steps)), y = Math.round(U.lerp(lp.y, p.y, i / steps));
                const s2 = this.r.worldToScreen((x + 0.5) * T, (y + 0.5) * T);
                this.applyTool(s2.x, s2.y, true);
              }
              this.lastPaint = p;
            }
          } else if (d.pan || (d.moved && (this.tool.kind === 'select' || this.tool.kind === 'build' || this.tool.kind === 'dino' || this.tool.kind === 'move'))) {
            this.r.pan(dx, dy);
            cv.classList.add('pan');
            this.hideTip();
          }
          d.x = e.clientX; d.y = e.clientY;
        }
        // au doigt, pas de survol : l'aperçu suit les touchers (voir applyTool)
        if (touch) return;
        this.updateGhost(e.clientX, e.clientY);
        if (!d || !d.moved) this.hoverTip(e.clientX, e.clientY);
      });
      const up = (e) => {
        this.pointers.delete(e.pointerId);
        clearTimeout(this._longT);
        if (this.gesture) {
          if (this.pointers.size < 2) { this.endGesture(); this.gestureLock = this.pointers.size > 0; }
          return;
        }
        if (this.gestureLock) { if (!this.pointers.size) this.gestureLock = false; return; }
        const d = this.drag;
        this.drag = null;
        cv.classList.remove('pan'); cv.classList.remove('rot');
        if (!d) return;
        if (d.long) { setTimeout(() => this.hideTip(), 1600); return; }
        if (d.button === 2 && !d.moved && this.tool.kind !== 'select') { this.setTool({ kind: 'select' }); return; }
        if (d.paintPending && !d.moved) { this.applyTool(e.clientX, e.clientY, false); return; }
        if (!d.moved && !d.pan && !d.rot && d.button === 0 && !d.painting) this.applyTool(e.clientX, e.clientY, false);
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('pointerleave', (e) => { if (touchish(e)) return; this.hideTip(); this.r.ghost = this.tool.kind === 'select' ? null : this.r.ghost; });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        // pincement sur pavé tactile (Ctrl + molette) : zoom plus fin
        const k = e.ctrlKey ? Math.min(3, Math.abs(e.deltaY) / 12) : Math.min(3, Math.abs(e.deltaY) / 60 + 0.4);
        const f = Math.pow(C.camera.zoomStep, -Math.sign(e.deltaY) * k);
        this.r.zoomAt(e.clientX, e.clientY, f);
      }, { passive: false });
      // empêche le zoom de la page (Safari) pendant les gestes
      for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    }

    /* ---------- Gestes à deux doigts ---------- */
    gesturePts() {
      const p = [...this.pointers.values()].slice(0, 2);
      return { a: p[0], b: p[1], m: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, ang: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    }
    startGesture() {
      // un geste annule l'action à un doigt en cours (pas de construction par erreur)
      this.drag = null;
      clearTimeout(this._longT);
      this.hideTip();
      for (const p of this.pointers.values()) { p.sx = p.x; p.sy = p.y; }
      const g = this.gesturePts();
      this.gesture = { d0: g.d, a0: g.ang, m0: g.m, prevD: g.d, prevM: g.m, mode: null };
      this.r.gestureBegin2(g.a, g.b);
    }
    moveGesture() {
      const G = this.gesture, g = this.gesturePts();
      if (!G.mode) {
        const ma = Math.hypot(g.a.x - g.a.sx, g.a.y - g.a.sy), mb = Math.hypot(g.b.x - g.b.sx, g.b.y - g.b.sy);
        if (Math.max(ma, mb) < 8) return;
        // deux doigts qui glissent ensemble verticalement : inclinaison
        const dya = g.a.y - g.a.sy, dyb = g.b.y - g.b.sy, dxa = g.a.x - g.a.sx, dxb = g.b.x - g.b.sx;
        const vertical = Math.sign(dya) === Math.sign(dyb) && Math.abs(dya) > Math.abs(dxa) * 1.6 && Math.abs(dyb) > Math.abs(dxb) * 1.6;
        G.mode = vertical && Math.abs(g.d / G.d0 - 1) < 0.1 ? 'tilt' : 'map';
      }
      if (G.mode === 'tilt') {
        if (!G.tiltStarted) { G.tiltStarted = true; this.r.gestureBegin(G.m0.x, G.m0.y); }
        this.r.gestureMove(G.m0.x, G.m0.y, 1, 0, (g.m.y - G.m0.y) * 0.004);
      } else this.r.gestureMove2({ x: g.a.x, y: g.a.y }, { x: g.b.x, y: g.b.y });
      G.prevD = g.d; G.prevM = g.m;
    }
    endGesture() {
      this.gesture = null;
      this.r.gestureEnd();
    }

    bindKeys() {
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        this.sound.init();
        const k = e.key.toLowerCase();
        this.keys.add(k === ' ' ? ' ' : k);
        if (this.game.s && this.game.s.over && k !== 'escape') return; // partie terminée : seul le bouton « Nouvelle partie »
        if (k === 'escape') { if (this.game.s && this.game.s.over) return; if (!$('#modal').classList.contains('hidden')) this.closeModal(); else if (this.tool.kind !== 'select') this.setTool({ kind: 'select' }); else this.select(null); }
        else if (k === ' ') { e.preventDefault(); this.setSpeed(this.game.speedIndex === 0 ? (this._lastSpeed || 1) : (this._lastSpeed = this.game.speedIndex, 0)); }
        else if (k === '1') this.setSpeed(1);
        else if (k === '2') this.setSpeed(2);
        else if (k === '3') this.setSpeed(3);
        else if (k === 'n') $('#minimap').classList.toggle('small');
        else if (k === 'x') this.setTool({ kind: 'demolish' });
        else if (k === 'm') this.setTool({ kind: 'move' });
        else if (k === 'v') this.setTool({ kind: 'select' });
        else if (k === 'c') this.setTool({ kind: 'path' });
        else if (k === '[' || k === 'pageup') this.r.rotateBy(Math.PI / 4);
        else if (k === ']' || k === 'pagedown') this.r.rotateBy(-Math.PI / 4);
        else if (k === 'home') { const c = this.r.cam; c.tyaw = 0; c.pitchOff = 0; c.tdist = 11; }
        else if (k === '+' || k === '=') this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, 1.25);
        else if (k === '-') this.r.zoomAt(this.r.vw / 2, this.r.vh / 2, 0.8);
        else if (k === 'delete' || k === 'backspace') { const s = this.r.selected; if (s && s.kind === 'building') this.demolish(this.game.buildings[s.id]); else if (s && s.kind === 'link' && this.game.s.links[s.id]) this.demolishLink(this.game.s.links[s.id]); else if (s && s.kind === 'sky') { const r = this.game.skyRunAt(s.x, s.y); if (r) this.demolishSky(r); } }
      });
      window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); this.keys.delete(k === ' ' ? ' ' : k); });
      window.addEventListener('blur', () => this.keys.clear());
    }

    updateKeys(dt) {
      const sp = 700 * dt;
      let dx = 0, dy = 0;
      if (this.keys.has('arrowleft') || this.keys.has('a') || this.keys.has('q')) dx += sp;
      if (this.keys.has('arrowright') || this.keys.has('d')) dx -= sp;
      if (this.keys.has('arrowup') || this.keys.has('w') || this.keys.has('z')) dy += sp;
      if (this.keys.has('arrowdown') || this.keys.has('s')) dy -= sp;
      if (dx || dy) this.r.pan(dx, dy);
    }

    /* ------------------------------------------------------------------
       Infobulles
       ------------------------------------------------------------------ */
    bindTips() {
      document.addEventListener('pointerover', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (!t) return;
        this.showTip(t.dataset.tip, t.getBoundingClientRect(), true);
      });
      document.addEventListener('pointerout', (e) => {
        const t = e.target.closest && e.target.closest('[data-tip]');
        if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) this.hideTip();
      });
    }

    showTip(html, rect, isDom) {
      const tip = $('#tooltip');
      tip.innerHTML = html;
      tip.classList.remove('hidden');
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x, y;
      if (isDom) { x = rect.left + rect.width / 2 - tw / 2; y = rect.top - th - 8; if (y < 8) y = rect.bottom + 8; }
      else { x = rect.x + 16; y = rect.y + 18; if (x + tw > innerWidth - 8) x = rect.x - tw - 12; if (y + th > innerHeight - 8) y = rect.y - th - 10; }
      tip.style.left = U.clamp(x, 8, innerWidth - tw - 8) + 'px';
      tip.style.top = U.clamp(y, 8, innerHeight - th - 8) + 'px';
    }
    hideTip() { $('#tooltip').classList.add('hidden'); }

    hoverTip(sx, sy) {
      const gh = this.r.ghost;
      if ((this.tool.kind === 'link' || this.tool.kind === 'merge') && gh && gh.b && gh.plan) {
        const p = gh.plan, link = this.tool.kind === 'link';
        const what = link ? (p.len ? `🌉 Passerelle de ${p.len} case${p.len > 1 ? 's' : ''}` : '🚪 Porte entre les deux enclos') : `🔗 Réunir · place ${p.cap}`;
        this.showTip(p.ok || p.cost ? `<b>${what}</b><div class="t-grid"><span>Prix</span><span>${money(p.cost)}</span><span>Travaux</span><span>≈ ${fmtH(p.hours)}</span></div>${p.ok ? '' : `<div class="t-sub" style="color:#f3c3b5">${esc(p.reason)}</div>`}` : `<div class="t-sub" style="color:#f3c3b5">${esc(p.reason)}</div>`, { x: sx, y: sy });
        return;
      }
      if (this.tool.kind === 'sky' && gh && gh.plan) {
        const p = gh.plan;
        this.showTip(p.ok ? `<b>🔭 Passerelle de ${p.len} cases</b><div class="t-grid"><span>Prix</span><span>${money(p.cost)}</span></div>` : `<div class="t-sub" style="color:#f3c3b5">${esc(p.reason)}</div>`, { x: sx, y: sy });
        return;
      }
      if (this.tool.kind === 'transfer') {
        const g = this.game, p = this.tileAt(sx, sy), b = g.buildingAt(p.x, p.y), d = g.dinos.find((x) => x.id === this.tool.dino);
        if (b && d && g.isEnclosure(b)) { const c = g.canTransfer(d, b); this.showTip(`<b>🚁 ${esc(DZ.bName(b))}</b>${c.ok ? `<div class="t-grid"><span>Prix</span><span>${money(c.cost)}</span></div>${c.warning ? '<div class="t-sub" style="color:#f3c3b5">⚠️ Prédateur et proie ensemble</div>' : ''}` : `<div class="t-sub" style="color:#f3c3b5">${esc(c.reason)}</div>`}`, { x: sx, y: sy }); }
        else this.hideTip();
        return;
      }
      if (this.tool.kind !== 'select' && this.tool.kind !== 'dino') { this.hideTip(); return; }
      const g = this.game, p = this.tileAt(sx, sy);
      const d = this.r.pickDinoAt(sx, sy);
      if (d) { this.showTip(this.dinoHover(d), { x: sx, y: sy }); return; }
      const l = g.linkAtTile(p.x, p.y);
      if (l) { this.showTip(this.linkHover(l), { x: sx, y: sy }); return; }
      const b = g.buildingAt(p.x, p.y);
      if (b) { this.showTip(this.buildingHover(b), { x: sx, y: sy }); return; }
      this.hideTip();
    }
    linkHover(l) {
      const g = this.game, n = g.dinos.filter((d) => d.cross && d.cross.l === l.id).length;
      const st = l.cons ? `🚧 chantier ${Math.round(g.linkProgress(l) * 100)} %` : n ? `${n} dinosaure${n > 1 ? 's' : ''} en chemin` : 'Ouverte';
      return `<b>${this.linkName(l)}</b><div class="t-sub">${st}</div><div class="t-grid"><span>Longueur</span><span>${l.len} case${l.len > 1 ? 's' : ''}</span></div>`;
    }

    dinoHover(d) {
      const sp = DZ.SPECIES[d.sp];
      return `<b>${esc(d.name)} ${SEX[d.sex] || ''}</b> <span class="t-sub">${esc(sp.name)}${d.young ? ' · bébé' : ''}${d.fight ? ' · ⚔️ se bat !' : d.hunt ? (d.hunt.pred === d ? ' · 🍖 chasse !' : ' · 😱 pourchassé !') : d.cross ? ' · 🌉 sur la passerelle' : ''}</span><div class="t-grid"><span>Bonheur</span><span>${Math.round(d.happiness)} %</span><span>Attractivité</span><span>${Math.round(this.game.dinoAttraction(d))}</span><span>Nourriture / jour</span><span>${money(C.dinos[d.sp].upkeep * (d.young ? C.breeding.babyUpkeep : 1))}</span><span>Santé</span><span>${d.sick ? (d.injured ? '🩹 Blessé' + (d.sex === 'F' ? 'e' : '') : '🤒 Malade') : '✓ Bonne'}</span></div>`;
    }

    buildingHover(b) {
      const g = this.game, def = C.buildings[b.type];
      let grid = '';
      if (def.cat === 'enclos') grid = `<span>Dinosaures</span><span>${g.dinosIn(b).length}</span><span>Place</span><span>${g.usedSpace(b)} / ${g.capacity(b)}</span><span>Attractivité</span><span>${Math.round(g.enclosureAttraction(b))}</span>${g.hasFence(b) ? `<span>Clôture</span><span>${g.fenceOf(b) < 40 ? '⚠️ ' : ''}${Math.round(g.fenceOf(b))} %</span>` : ''}`;
      else if (def.cat === 'service') grid = `<span>Revenus</span><span>${money(b.earned || 0)}</span><span>Entretien / jour</span><span>${money(g.upkeepOf(b))}</span>`;
      else if (b.type === 'entree') grid = `<span>Billet</span><span>${money(g.ticketPrice())}</span><span>Visiteurs du jour</span><span>${U.fmt(g.s.today.visitors)}</span>`;
      const lvl = (def.upgrade ? ` · Niveau ${b.level}` : '') + (b.cons ? ` · 🚧 chantier ${Math.round(g.worksProgress(b) * 100)} %` : b.upg ? ` · ${b.upg.repair ? '🔧 réparation' : b.upg.merge ? '🔗 réunion' : '⬆ travaux'} ${Math.round(g.worksProgress(b) * 100)} %` : '');
      const warn = def.cat !== 'deco' && b.type !== 'entree' && !b.cons && !g.isConnected(b) ? '<div class="t-sub" style="color:#f3c3b5">⚠️ Non relié à l\'entrée par un chemin</div>' : '';
      return `<b>${esc(DZ.bName(b))}</b><span class="t-sub">${lvl}</span>${warn}<div class="t-grid">${grid}</div>`;
    }

    /* ------------------------------------------------------------------
       Panneau d'informations
       ------------------------------------------------------------------ */
    select(sel) {
      this.r.selected = sel;
      this.panelSel = sel;
      this.renderPanel();
    }

    renderPanel() {
      const p = $('#panel');
      const sel = this.panelSel;
      const g = this.game;
      document.body.classList.toggle('panel-open', !!sel);
      if (!sel) { p.classList.add('hidden'); return; }
      let html = '';
      if (sel.kind === 'building') {
        const b = g.buildings[sel.id];
        if (!b) { this.select(null); return; }
        html = this.buildingPanel(b);
      } else if (sel.kind === 'link') {
        const l = g.s.links[sel.id];
        if (!l) { this.select(null); return; }
        html = this.linkPanel(l);
      } else if (sel.kind === 'sky') {
        const r = g.skyRunAt(sel.x, sel.y);
        if (!r) { this.select(null); return; }
        html = this.skyPanel(r);
      } else {
        const d = g.dinos.find((x) => x.id === sel.id);
        if (!d) { this.select(null); return; }
        html = this.dinoPanel(d);
      }
      const scroll = p.scrollTop;
      p.innerHTML = '<button class="close" data-act="close" aria-label="Fermer">✕</button>' + html;
      p.classList.remove('hidden');
      p.scrollTop = scroll;
      // vignettes
      p.querySelectorAll('canvas[data-thumb]').forEach((c) => {
        const id = c.dataset.thumb;
        const big = c.classList.contains('big-thumb');
        const src = this.thumbs['p_' + id + big] || (this.thumbs['p_' + id + big] = R.dinoThumb(id, big ? 300 : 54, big ? 130 : 34));
        c.width = src.width; c.height = src.height;
        c.getContext('2d').drawImage(src, 0, 0);
      });
      p.onclick = (e) => this.panelClick(e);
      // survol d'une option d'aménagement : aperçu sur la carte
      p.querySelectorAll('[data-prev], [data-prev-link]').forEach((it) => {
        it.addEventListener('pointerenter', () => {
          const sel2 = this.panelSel, g2 = this.game;
          if (it.dataset.prevLink) { const l = g2.s.links[+it.dataset.prevLink]; if (l) this.r.ghost = { kind: 'link', a: l.a, b: l.b, plan: l, ok: true }; return; }
          if (!sel2 || sel2.kind !== 'building') return;
          const [kind, id] = it.dataset.prev.split(':');
          const plan = kind === 'link' ? g2.linkPlan(sel2.id, +id) : g2.mergePlan(sel2.id, +id);
          this.r.ghost = { kind, a: sel2.id, b: +id, plan, ok: plan.ok };
        });
        it.addEventListener('pointerleave', () => { if (this.tool.kind === 'select') this.r.ghost = null; });
      });
      this._panelKey = this.panelKey();
    }

    panelKey() {
      const sel = this.panelSel, g = this.game;
      if (!sel) return '';
      const s = g.s;
      const moneyBand = Math.floor(s.money / 100);
      if (sel.kind === 'building') {
        const b = g.buildings[sel.id];
        if (!b) return 'x';
        const ds = g.dinosIn(b).map((d) => d.id + ':' + d.sick + d.upHab + d.upCare + Math.round(d.happiness) + d.young + !!d.hunt + !!d.fight).join(',');
        const dl = g.deliveriesTo(b).map((x) => x.id + g.deliveryPhase(x).phase + Math.round(g.deliveryPhase(x).left * 12)).join(',');
        const ls = g.linksOf(b).map((l) => l.id + ':' + Math.round(g.linkProgress(l) * 50)).join(',');
        const rv = g.rivalryInfo(b).map((r) => r.sp + r.n + r.calm).join(',');
        const kd = C.buildings[b.type].play ? g.kidsAt(b).length : '';
        const tf = (g.transfers || []).filter((tr) => tr.to === b.id || tr.from === b.id).map((tr) => tr.id + tr.phase).join(',');
        const fz = g.hasFence(b) ? Math.round(g.fenceOf(b)) + ':' + !!b.autoFix + ':' + g.dinosIn(b).some((d) => d.ram) : '';
        return [b.id, b.level, ds, dl, kd, tf, fz, moneyBand, g.isConnected(b), Math.round(b.earned || 0), b.x, b.y, b.w, b.h, Math.round(g.worksProgress(b) * 50), !!b.upg, JSON.stringify(b.breed || {}), ls, rv, Object.keys(g.buildings).length].join('|');
      }
      if (sel.kind === 'link') {
        const l = g.s.links[sel.id];
        return l ? [l.id, Math.round(g.linkProgress(l) * 50), g.dinos.filter((d) => d.cross && d.cross.l === l.id).length].join('|') : 'x';
      }
      if (sel.kind === 'sky') { const r = g.skyRunAt(sel.x, sel.y); return r ? [r.id, r.len, this.skyCrowd(r)].join('|') : 'x'; }
      const d = g.dinos.find((x) => x.id === sel.id);
      return d ? [d.id, d.sick, d.upHab, d.upCare, Math.round(d.happiness), moneyBand, d.young, d.enc, d.tr ? d.tr.phase : ''].join('|') : 'x';
    }

    buildingPanel(b) {
      const g = this.game, def = C.buildings[b.type], s = g.s;
      const pips = def.upgrade ? `<span class="pips">${[1, 2, 3].map((i) => `<i class="${i <= b.level ? 'on' : ''}"></i>`).join('')}</span>` : '';
      let h = `<h2>${b.parts ? '🏞️' : def.icon} ${esc(DZ.bName(b))}</h2><div class="sub">${def.upgrade ? 'Niveau ' + b.level + pips : (b.type === 'entree' ? 'Accueil et billetterie' : 'Décoration')}${b.parts ? ` · ${b.parts.length} enclos réunis` : ''}</div>`;
      const connected = g.isConnected(b);
      if (b.cons || b.upg) {
        const p = g.worksProgress(b);
        const what = b.cons ? `🚧 Chantier en cours · ${Math.round(p * 100)} %` : b.upg.repair ? `🔧 Réparation de la clôture · ${Math.round(p * 100)} %` : b.upg.merge ? `🔗 Réunion des enclos · ${Math.round(p * 100)} %` : `⬆ Travaux vers le niveau ${b.level + 1} · ${Math.round(p * 100)} %`;
        const after = b.cons ? (def.cat === 'enclos' ? 'Vous pourrez y installer des dinosaures à la fin des travaux.' : def.cat === 'service' ? 'Les visiteurs pourront en profiter à la fin des travaux.' : '') : 'Le bâtiment reste ouvert pendant les travaux.';
        h += `<div class="works"><div class="works-h">${what}</div><div class="meter"><i class="works-bar" style="width:${Math.round(p * 100)}%"></i></div><div class="works-s">Fin dans ≈ ${fmtH(g.worksLeft(b))}. ${after}</div></div>`;
      }
      if (def.cat !== 'deco' && b.type !== 'entree' && !connected && !b.cons) h += '<div class="warn">⚠️ Ce bâtiment n\'est pas relié à l\'entrée par un chemin : les visiteurs ne peuvent pas y accéder.</div>';
      if (def.cat === 'enclos') {
        const dinos = g.dinosIn(b);
        const cap = g.capacity(b), used = g.usedSpace(b);
        h += `<div class="rows"><span class="k">Clôture</span><span class="v">${def.kind === 'land' ? C.enclosureLevels.names[b.level - 1] : def.kind === 'air' ? ['Filet de corde', 'Arches d\'acier', 'Dôme de verre'][b.level - 1] : ['Bassin naturel', 'Bassin bétonné', 'Aquarium vitré'][b.level - 1]}</span>`;
        h += `<span class="k">Place occupée</span><span class="v">${used} / ${cap}</span>`;
        h += `<span class="k">Attractivité</span><span class="v">${Math.round(g.enclosureAttraction(b))}</span>`;
        h += `<span class="k">Entretien / jour</span><span class="v">${money(g.upkeepOf(b))}</span>`;
        if (b.parts) h += `<span class="k">Taille</span><span class="v">${{ S: 'petites espèces', M: 'espèces moyennes', L: 'grandes espèces' }[g.encSize(b)]}</span>`;
        h += '</div>';
        const pinfo = g.predationInfo(b);
        for (const pi of pinfo) {
          const P = DZ.SPECIES[pi.pred], Q = DZ.SPECIES[pi.prey], every = Math.round(pi.every);
          if (pi.duel) h += `<div class="warn">⚔️ ${esc(capFirst(DZ.leSp(pi.pred)))} et ${esc(DZ.leSp(pi.prey))} se disputent le territoire : combats réguliers, le plus grand l'emporte.</div>`;
          else if (pi.chance > 0) h += `<div class="warn">⚠️ ${esc(capFirst(DZ.leSp(pi.pred)))} chasse : ${pi.young ? 'les petits ' + esc(Q.name) : esc(DZ.leSp(pi.prey))} risque${pi.young ? 'nt' : ''} d'être attaqué${pi.young ? 's' : ''} environ toutes les ${every} h (réussite ≈ ${Math.round(pi.chance * 100)} %).</div>`;
          else h += `<div class="info">🛡️ ${esc(capFirst(DZ.leSp(pi.pred)))} attaque parfois ${esc(DZ.leSp(pi.prey))}, trop grand pour lui : la proie se défend et peut le blesser.</div>`;
        }
        if (pinfo.length) h += `<div class="info small">Séparez-les : transférez l'un d'eux dans un autre enclos (sélectionnez l'animal, puis 🚁 Transférer). Une passerelle permet aux proies de fuir.</div>`;
        if (g.hasFence(b) && !b.cons) h += this.fenceSection(b, dinos);
        {
          // risque d'évasion (au plus un par jour dans le parc)
          let risk = 0, pred = false;
          for (const d of dinos) { const r = g.escapeRisk(d, b); risk += r; if (r && DZ.SPECIES[d.sp].predator) pred = true; }
          if (risk >= 0.004) {
            const pc = Math.max(1, Math.round(Math.min(0.9, risk) * 100));
            const broken = g.fenceOf(b) < C.fence.breach;
            h += `<div class="${pred || risk > 0.05 || broken ? 'warn' : 'info'}">${pred ? '⚠️' : '🚧'} Risque d'évasion ≈ ${broken ? 'certain aujourd\'hui (clôture percée)' : pc + ' % par jour'}.${pred ? ' Un carnivore en liberté peut attaquer un visiteur : la partie serait perdue.' : ''} ${b.level < 3 ? (b.level === 1 ? 'Une clôture électrifiée le divise par cinq ; les murs de verre, bien entretenus, l\'empêchent.' : 'Les murs de verre (niveau 3), bien entretenus, l\'empêchent.') : ''}</div>`;
          }
        }
        for (const rv of g.rivalryInfo(b)) {
          const sp = DZ.SPECIES[rv.sp];
          const tip = rv.exit ? 'Le vaincu peut s\'éloigner par la passerelle.' : 'Une passerelle vers un enclos voisin permettrait au vaincu de s\'éloigner ; sinon, transférez un mâle dans un autre enclos.';
          h += `<div class="${rv.terr >= 0.4 ? 'warn' : 'info'} rival">⚔️ ${rv.n} ${esc(sp.short || sp.name)} mâles adultes : rivalité ${rv.level}${rv.calm ? ' (trêve après un combat)' : ''}. ${rv.terr >= 0.4 ? 'Combats fréquents, risque de blessures. ' : ''}${tip}</div>`;
        }
        h += '<div class="section"><h3>Pensionnaires</h3>';
        const incoming = g.deliveriesTo(b);
        if (!dinos.length && !incoming.length) h += `<div class="info">${b.cons ? 'L\'enclos sera prêt à la fin du chantier.' : 'Cet enclos est vide. Ajoutez un dinosaure pour attirer les visiteurs.'}</div>`;
        for (const d of dinos) {
          const sp = DZ.SPECIES[d.sp];
          const hp = Math.round(d.happiness);
          h += `<div class="dino-row" data-act="dino" data-id="${d.id}"><canvas data-thumb="${d.sp}"></canvas><div><div class="n">${esc(d.name)} <span class="sex ${d.sex}">${SEX[d.sex] || ''}</span>${d.young ? ' <span class="baby">bébé</span>' : ''} ${d.sick ? (d.injured ? '🩹' : '🤒') : ''}${d.fight ? ' ⚔️' : ''}${d.hunt ? (d.hunt.pred === d ? ' 🍖' : ' 😱') : ''}${d.cross ? ' 🌉' : ''}${d.tr ? ' 🚁' : d.loose ? ' 🚨' : ''}</div><div class="s">${esc(sp.short || sp.name)} · ❤ ${hp} % · ★ ${Math.round(g.dinoAttraction(d))}</div><div class="meter"><i class="${hp < 40 ? 'low' : hp < 65 ? 'mid' : ''}" style="width:${hp}%"></i></div></div></div>`;
        }
        for (const tr of g.transfers) {
          if (tr.to !== b.id || tr.landed) continue;
          const sp = DZ.SPECIES[tr.d.sp];
          h += `<div class="dino-row incoming" data-act="dino" data-id="${tr.d.id}"><canvas data-thumb="${tr.d.sp}"></canvas><div><div class="n">🚁 ${esc(tr.d.name)} <span class="sex ${tr.d.sex}">${SEX[tr.d.sex] || ''}</span></div><div class="s">${esc(sp.short || sp.name)} · transfert : ${esc(g.transferPhaseText(tr).replace(/^\S+ /, ''))}</div></div></div>`;
        }
        for (const dl of incoming) {
          const sp = DZ.SPECIES[dl.sp], ph = g.deliveryPhase(dl);
          const st = ph.phase === 'prep' ? `en préparation · arrivée dans ≈ ${fmtH(ph.left)}` : ph.phase === 'fly' ? 'hélicoptère en approche' : 'livraison en cours…';
          h += `<div class="dino-row incoming"><canvas data-thumb="${dl.sp}"></canvas><div><div class="n">🚁 ${esc(dl.name)} <span class="sex ${dl.sex}">${SEX[dl.sex]}</span></div><div class="s">${esc(sp.short || sp.name)} · ${st}</div><div class="meter"><i class="works-bar" style="width:${Math.round(U.clamp(dl.t / g.deliveryTotal(dl), 0, 1) * 100)}%"></i></div></div></div>`;
        }
        // reproduction
        const species = [...new Set(dinos.filter((d) => !d.young).map((d) => d.sp))];
        for (const spId of species) {
          const bi = g.breedingInfo(b, spId), sp = DZ.SPECIES[spId];
          if (bi.pending) h += `<div class="info breed">🐣 ${esc(sp.short || sp.name)} : une naissance est attendue aujourd'hui !</div>`;
          else if (bi.pair && !bi.happyOk) h += `<div class="info breed">💞 ${esc(sp.short || sp.name)} : couple formé, mais trop peu heureux pour avoir des petits.</div>`;
          else if (bi.pair) { const left = Math.max(1, bi.need - bi.days); h += `<div class="info breed">💞 ${esc(sp.short || sp.name)} : couple formé — naissance probable dans ${left} jour${left > 1 ? 's' : ''}.</div>`; }
          else h += `<div class="info breed">💡 ${esc(sp.short || sp.name)} : ajoutez ${bi.m ? 'une femelle ♀' : 'un mâle ♂'} pour avoir des petits.</div>`;
        }
        h += `<button class="btn wide" data-act="add" ${used >= cap || b.cons ? 'disabled' : ''}>＋ Ajouter un dinosaure</button></div>`;
        if (def.kind === 'land') h += this.layoutSection(b);
      } else if (def.cat === 'service') {
        const lv = b.level - 1;
        h += '<div class="rows">';
        if (def.spend) h += `<span class="k">Dépense moyenne</span><span class="v">${money(def.spend[lv])} / visiteur</span>`;
        if (def.chance) h += `<span class="k">Taux d'achat</span><span class="v">${pct(def.chance[lv])}</span>`;
        if (def.satisfaction) h += `<span class="k">Satisfaction</span><span class="v">+${def.satisfaction[lv]}</span>`;
        if (def.play) h += `<span class="k">Amusement</span><span class="v">+${def.fun[lv]} satisfaction</span><span class="k">Enfants qui jouent</span><span class="v">${g.kidsAt(b).length} / ${def.kids[lv]}</span>`;
        if (!def.play) h += `<span class="k">Revenus cumulés</span><span class="v">${money(b.earned || 0)}</span>`;
        h += `<span class="k">Entretien / jour</span><span class="v">${money(def.upkeep[lv])}</span></div>`;
        if (def.play) h += '<div class="desc">Gratuit pour les visiteurs. Les familles avec des enfants y passent un moment : toute la famille repart plus satisfaite.</div>';
      } else if (b.type === 'entree') {
        h += `<div class="rows"><span class="k">Prix du billet</span><span class="v">${money(g.ticketPrice())}</span><span class="k">Visiteurs aujourd'hui</span><span class="v">${U.fmt(s.today.visitors)}</span><span class="k">Visiteurs au total</span><span class="v">${U.fmt(s.totalVisitors || 0)}</span></div><div class="info">Le prix du billet augmente avec la note du parc.</div>`;
      } else {
        h += `<div class="desc">${BUILD_DESC[b.type] || ''}</div>`;
      }
      // amélioration
      const up = g.upgradeCost(b);
      if (def.upgrade && !b.cons && !b.upg) {
        if (up != null) {
          h += `<div class="section"><h3>Amélioration</h3><div class="info">${this.upgradeText(b)}</div><button class="btn primary wide" data-act="upgrade" ${s.money < up ? 'disabled' : ''}>⬆ Améliorer au niveau ${b.level + 1} <span class="cost">${money(up)}</span></button></div>`;
        } else h += '<div class="section"><div class="info">✨ Niveau maximal atteint.</div></div>';
      }
      if (!b.fixed) {
        const refund = Math.round(b.invested * C.economy.refundRate);
        h += `<div class="btns"><button class="btn" data-act="move" ${g.busy(b) || b.parts || g.linksOf(b).length ? 'disabled' : ''} title="${b.parts ? 'Un enclos agrandi ne se déplace pas' : g.linksOf(b).length ? 'Démolissez d\'abord ses passerelles' : ''}">✋ Déplacer</button><button class="btn danger" data-act="demolish">🧨 Démolir (+${money(refund)})</button></div>`;
      }
      return h;
    }

    /* État de la clôture : jauge, réparation, entretien automatique. */
    fenceSection(b, dinos) {
      const g = this.game, F = C.fence, c = Math.round(g.fenceOf(b)), cost = g.repairCost(b);
      const cls = c < 40 ? 'low' : c < 70 ? 'mid' : '';
      const rams = dinos.some((d) => d.ram);
      let h = `<div class="section"><h3>Clôture</h3><div class="rows"><span class="k">État</span><span class="v">${c} %${rams ? ' · 💥 un animal la charge !' : ''}</span></div><div class="meter"><i class="${cls}" style="width:${c}%"></i></div>`;
      if (c < F.breach) h += `<div class="warn">🚨 Clôture percée : un animal va s'échapper. Réparez-la tout de suite.</div>`;
      else if (c < 40) h += `<div class="warn">⚠️ Clôture très abîmée : le risque d'évasion est multiplié par ${(g.fenceRisk(b) / Math.max(1e-6, b.level >= 3 ? C.escape.fence[1] : C.escape.fence[b.level - 1])).toFixed(1).replace('.', ',')}.</div>`;
      else h += `<div class="info small">Elle s'use avec le temps et sous les charges des gros animaux, surtout des carnivores malheureux. Plus elle est abîmée, plus une évasion est probable.</div>`;
      h += `<button class="btn wide opt" data-act="repair" ${c >= 100 || g.busy(b) || g.s.money < cost ? 'disabled' : ''}><span>🔧 Réparer la clôture</span><span class="cost">${c >= 100 ? '✓' : money(cost)}</span></button>`;
      h += `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:12.5px;color:var(--muted);cursor:pointer"><input type="checkbox" data-act="autofix" ${b.autoFix ? 'checked' : ''}> <span>Entretien automatique : réparée chaque nuit sous ${F.auto} % (+${Math.round(F.autoExtra * 100)} %)</span></label>`;
      return h + '</div>';
    }

    /* Passerelles et réunion d'enclos (panneau d'un enclos terrestre). */
    layoutSection(b) {
      const g = this.game, s = g.s;
      let h = '<div class="section"><h3>Aménagements</h3>';
      for (const l of g.linksOf(b)) {
        const o = g.linkOther(l, b), n = g.dinos.filter((d) => d.cross && d.cross.l === l.id).length;
        const st = l.cons ? `🚧 chantier ${Math.round(g.linkProgress(l) * 100)} % · fin dans ≈ ${fmtH(l.cons.dur - l.cons.t)}` : n ? `${n} dinosaure${n > 1 ? 's' : ''} en chemin` : 'ouverte';
        h += `<div class="lk-row" data-prev-link="${l.id}"><div><div class="n">${l.len ? '🌉' : '🚪'} ${l.len ? 'Passerelle' : 'Porte'} vers ${o ? esc(DZ.bName(o)) : '?'}</div><div class="s">${l.len} case${l.len > 1 ? 's' : ''} · ${st}</div></div><button class="btn small" data-act="lk-go" data-id="${o ? o.id : ''}" title="Voir l'enclos">👁</button><button class="btn small danger" data-act="unlink" data-id="${l.id}" title="Démolir">🧨</button></div>`;
      }
      const lc = g.linkCandidates(b), mc = g.mergeCandidates(b);
      for (const c of lc) {
        const p = c.plan;
        h += `<button class="btn wide opt" data-act="link" data-id="${c.other.id}" data-prev="link:${c.other.id}" ${p.ok ? '' : 'disabled'}><span>${p.len ? '🌉 Passerelle' : '🚪 Porte'} vers ${esc(DZ.bName(c.other))}${p.len ? ` · ${p.len} case${p.len > 1 ? 's' : ''}` : ''}</span><span class="cost">${money(p.cost)}</span></button>`;
      }
      for (const c of mc) {
        const p = c.plan;
        h += `<button class="btn wide opt" data-act="merge" data-id="${c.other.id}" data-prev="merge:${c.other.id}" ${p.ok ? '' : 'disabled'} title="${p.ok ? '' : esc(p.reason)}"><span>🔗 Réunir avec ${esc(DZ.bName(c.other))} · place ${p.cap}</span><span class="cost">${money(p.cost)}</span></button>`;
      }
      if (!lc.length && !mc.length && !g.linksOf(b).length) h += '<div class="info">💡 Construisez un autre enclos terrestre bien en face, à moins de ' + C.links.maxLen + ' cases, pour les relier par une passerelle (les visiteurs passent dessous), ou collé à celui-ci pour les réunir.</div>';
      else if (lc.length || mc.length) h += '<div class="info small">Survolez une option pour la voir sur la carte.</div>';
      return h + '</div>';
    }

    linkPanel(l) {
      const g = this.game, A = g.buildings[l.a], B = g.buildings[l.b];
      const n = g.dinos.filter((d) => d.cross && d.cross.l === l.id);
      let h = `<h2>${l.len ? '🌉 Passerelle' : '🚪 Porte'}</h2><div class="sub">Relie ${A ? esc(DZ.bName(A)) : '?'} et ${B ? esc(DZ.bName(B)) : '?'}</div>`;
      if (l.cons) { const p = g.linkProgress(l); h += `<div class="works"><div class="works-h">🚧 Chantier en cours · ${Math.round(p * 100)} %</div><div class="meter"><i class="works-bar" style="width:${Math.round(p * 100)}%"></i></div><div class="works-s">Fin dans ≈ ${fmtH(l.cons.dur - l.cons.t)}.</div></div>`; }
      h += `<div class="rows"><span class="k">Longueur</span><span class="v">${l.len} case${l.len > 1 ? 's' : ''}</span><span class="k">En chemin</span><span class="v">${n.length ? n.map((d) => esc(d.name)).join(', ') : 'personne'}</span></div>`;
      h += `<div class="desc">Les dinosaures terrestres passent d'un enclos à l'autre quand il y a de la place et pas de prédateur en face. ${l.len ? 'Les visiteurs adorent les voir passer au-dessus des allées.' : ''} Un mâle vaincu dans un combat s'enfuit par ici.</div>`;
      h += `<div class="btns">${A ? `<button class="btn" data-act="enc" data-id="${A.id}">🏞️ ${esc(DZ.bName(A))}</button>` : ''}${B ? `<button class="btn" data-act="enc" data-id="${B.id}">🏞️ ${esc(DZ.bName(B))}</button>` : ''}</div>`;
      h += `<div class="btns"><button class="btn danger" data-act="unlink" data-id="${l.id}">🧨 Démolir (+${money(Math.round((l.invested || 0) * C.economy.refundRate))})</button></div>`;
      return h;
    }

    skyCrowd(r) {
      let n = 0;
      for (const v of this.game.visitors) { const x = Math.floor(v.x), y = Math.floor(v.y); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) n += v.members.length * v.scale; }
      return Math.round(n);
    }
    skyPanel(r) {
      const g = this.game, names = r.encs.map((id) => g.buildings[id]).filter((b) => b).map((b) => esc(DZ.bName(b)));
      const att = r.encs.reduce((a, id) => a + (g.buildings[id] ? g.enclosureAttraction(g.buildings[id]) : 0), 0) * C.skywalk.attraction;
      let h = `<h2>🔭 Passerelle d'observation</h2><div class="sub">Au-dessus de ${names.join(' et ') || '?'}</div>`;
      h += `<div class="rows"><span class="k">Longueur</span><span class="v">${r.len} cases</span><span class="k">Visiteurs dessus</span><span class="v">${this.skyCrowd(r)}</span><span class="k">Attractivité en plus</span><span class="v">+${Math.round(att)}</span></div>`;
      h += `<div class="desc">Les visiteurs montent par l'escalier et regardent les dinosaures d'en haut : ils gagnent ${Math.round((C.skywalk.view - 1) * 100)} % de satisfaction en plus qu'à travers la clôture, et préfèrent les enclos qu'on peut survoler.</div>`;
      h += `<div class="btns">${r.encs.map((id) => g.buildings[id] ? `<button class="btn" data-act="enc" data-id="${id}">🏞️ ${esc(DZ.bName(g.buildings[id]))}</button>` : '').join('')}</div>`;
      h += `<div class="btns"><button class="btn danger" data-act="unsky">🧨 Démolir (+${money(Math.round(g.skyCost(r.len) * C.economy.refundRate))})</button></div>`;
      return h;
    }

    upgradeText(b) {
      const def = C.buildings[b.type], n = b.level;
      const L = C.enclosureLevels;
      if (def.cat === 'enclos') {
        const names = def.kind === 'land' ? L.names : def.kind === 'air' ? ['Filet de corde', 'Arches d\'acier', 'Dôme de verre'] : ['Bassin naturel', 'Bassin bétonné', 'Aquarium vitré'];
        const space = this.game.encSpace(b);
        return `${names[n]} : place ${Math.floor(space * L.capacity[n - 1])} → ${Math.floor(space * L.capacity[n])}, attractivité ×${String(L.attraction[n]).replace('.', ',')}, bonheur +${L.happiness[n] - L.happiness[n - 1]}.`;
      }
      if (b.type === 'boutique') return `Dépense ${money(def.spend[n - 1])} → ${money(def.spend[n])}, taux d'achat ${pct(def.chance[n - 1])} → ${pct(def.chance[n])}.`;
      if (b.type === 'restaurant') return `Repas ${money(def.spend[n - 1])} → ${money(def.spend[n])}, moins de déchets, visiteurs plus satisfaits.`;
      if (b.type === 'toilettes') return `Satisfaction +${def.satisfaction[n - 1]} → +${def.satisfaction[n]}.`;
      if (def.play) return `Amusement +${def.fun[n - 1]} → +${def.fun[n]}, ${def.kids[n - 1]} → ${def.kids[n]} enfants à la fois, attractivité +${def.attraction[n - 1]} → +${def.attraction[n]}.`;
      return '';
    }

    dinoPanel(d) {
      const g = this.game, sp = DZ.SPECIES[d.sp], bal = C.dinos[d.sp], s = g.s, up = C.economy.dinoUpgrades;
      const b = g.buildings[d.enc];
      const hp = Math.round(d.happiness);
      let h = `<h2>${esc(d.name)} <span class="sex ${d.sex}">${SEX[d.sex] || ''}</span></h2><div class="sub">${esc(sp.name)} ${d.sex === 'F' ? 'femelle' : 'mâle'}${d.young ? ' · bébé' : ''} · ${DZ.FAMILIES[sp.family].name}</div>`;
      if (d.young) { const left = Math.max(1, C.breeding.growDays[sp.size || 'M'] - (s.day - d.born)); h += `<div class="info">🍼 Né${d.sex === 'F' ? 'e' : ''} dans le parc le jour ${d.born}. Adulte dans ${left} jour${left > 1 ? 's' : ''}.</div>`; }
      h += `<canvas class="big-thumb" data-thumb="${d.sp}"></canvas>`;
      h += `<div class="desc">${esc(sp.desc)}</div>`;
      h += `<div class="rows"><span class="k">Régime</span><span class="v">${sp.diet}</span><span class="k">Époque</span><span class="v">${sp.period}</span><span class="k">Taille</span><span class="v">${sp.length}</span>`;
      h += `<span class="k">Attractivité</span><span class="v">${Math.round(g.dinoAttraction(d))} <span style="color:var(--muted);font-weight:400">(base ${bal.attraction})</span></span>`;
      h += `<span class="k">Nourriture / jour</span><span class="v">${money(bal.upkeep * (d.young ? C.breeding.babyUpkeep : 1))}</span><span class="k">${d.young ? 'Né' : 'Arrivé'}${d.sex === 'F' ? 'e' : ''} le</span><span class="v">jour ${d.born}</span></div>`;
      h += `<div class="rows"><span class="k">Bonheur</span><span class="v">${hp} %</span></div><div class="meter"><i class="${hp < 40 ? 'low' : hp < 65 ? 'mid' : ''}" style="width:${hp}%"></i></div>`;
      if (sp.social && !g.dinos.some((o) => o !== d && o.enc === d.enc && o.sp === d.sp)) h += '<div class="info">👥 Espèce grégaire : un congénère le rendrait plus heureux.</div>';
      if (sp.predator) h += `<div class="info">🍖 Prédateur : il chasse les autres espèces de son enclos. Il attrape facilement les plus petites et les bébés ; les plus grandes se défendent.</div>`;
      if (sp.terr >= 0.4 && sp.habitat === 'land') h += `<div class="info">⚔️ Tempérament ${sp.terr >= 0.7 ? 'très territorial' : 'territorial'} : deux mâles adultes dans le même enclos finissent par se battre.</div>`;
      if (d.bruise && s.day - d.bruise <= 1) h += `<div class="info">🤕 ${d.sex === 'F' ? 'Elle' : 'Il'} a perdu un combat récemment et se fait discret${d.sex === 'F' ? 'e' : ''}.</div>`;
      if (d.sick && d.injured) h += `<div class="warn">🩹 Blessé${d.sex === 'F' ? 'e' : ''} dans un combat depuis ${d.sickDays} jour${d.sickDays > 1 ? 's' : ''}. Sans soins, ${d.sex === 'F' ? 'elle' : 'il'} ne survivra pas au-delà de ${C.events.sickDaysToDeath} jours.</div><button class="btn primary wide" data-act="treat" ${s.money < g.treatCost(d) ? 'disabled' : ''}>💉 Soigner <span class="cost">${money(g.treatCost(d))}</span></button>`;
      else if (d.sick) h += `<div class="warn">🤒 Malade depuis ${d.sickDays} jour${d.sickDays > 1 ? 's' : ''}. Sans soins, il ne survivra pas au-delà de ${C.events.sickDaysToDeath} jours.</div><button class="btn primary wide" data-act="treat" ${s.money < g.treatCost(d) ? 'disabled' : ''}>💉 Soigner <span class="cost">${money(g.treatCost(d))}</span></button>`;
      h += '<div class="section"><h3>Améliorations</h3>';
      for (const k of ['habitat', 'care']) {
        const done = k === 'habitat' ? d.upHab : d.upCare;
        const cost = g.dinoUpgradeCost(d, k);
        const u = up[k];
        h += `<button class="btn wide" style="margin-bottom:6px;justify-content:space-between" data-act="dup" data-k="${k}" ${done || s.money < cost ? 'disabled' : ''}><span>${k === 'habitat' ? '🌿' : '🩺'} ${u.name} · +${Math.round(u.attraction * 100)} % attractivité</span><span class="cost">${done ? '✓' : money(cost)}</span></button>`;
      }
      h += '</div>';
      if (d.loose && !d.tr) {
        const cost = g.transferCost(d);
        h += `<div class="warn">🚨 ${d.sex === 'F' ? 'Elle' : 'Il'} s'est ${d.sex === 'F' ? 'échappée' : 'échappé'} et erre dans le parc !${sp.predator ? ' Ce carnivore peut attaquer un visiteur : la partie serait perdue.' : ''}</div>`;
        h += `<button class="btn primary wide" data-act="transfer" ${s.money < cost ? 'disabled' : ''}><span>🚁 Capturer et ramener dans un enclos</span> <span class="cost">${money(cost)}</span></button>`;
      } else if (d.tr) {
        const to = g.buildings[d.tr.to];
        h += `<div class="section"><h3>Transfert</h3><div class="info">🚁 Vers ${to ? esc(DZ.bName(to)) : '?'} · ${esc(g.transferPhaseText(d.tr) || 'terminé')}</div></div>`;
      } else {
        const cost = g.transferCost(d);
        h += `<div class="section"><h3>Changer d'enclos</h3><div class="info small">Une vétérinaire l'endort, un hélicoptère le dépose dans l'enclos choisi.</div><button class="btn wide opt" data-act="transfer" ${s.money < cost ? 'disabled' : ''}><span>🚁 Transférer dans un autre enclos</span><span class="cost">${money(cost)}</span></button></div>`;
      }
      h += `<div class="btns"><button class="btn" data-act="enc" data-id="${b ? b.id : ''}">🏞️ Voir l'enclos</button><button class="btn danger" data-act="sell" ${d.tr ? 'disabled' : ''}>Vendre (+${money(Math.round(g._dinoValue(d) * C.economy.dinoSellRate))})</button></div>`;
      return h;
    }

    panelClick(e) {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const g = this.game, sel = this.panelSel;
      const act = t.dataset.act;
      if (act === 'close') { this.select(null); return; }
      if (act === 'dino') { this.select({ kind: 'dino', id: +t.dataset.id }); return; }
      if (act === 'enc' || act === 'lk-go') { this.select({ kind: 'building', id: +t.dataset.id }); const o = g.buildings[+t.dataset.id]; if (o && act === 'lk-go') this.focus((o.x + o.w / 2) * T, (o.y + o.h / 2) * T); return; }
      if (act === 'unlink') { const l = g.s.links[+t.dataset.id]; if (l) this.demolishLink(l); return; }
      if (act === 'unsky' && sel.kind === 'sky') { const r = g.skyRunAt(sel.x, sel.y); if (r) this.demolishSky(r); return; }
      if (sel.kind === 'building') {
        const b = g.buildings[sel.id];
        if (act === 'repair') { const r = g.repairFence(b.id); if (r.ok) { this.sound.play('build'); this.toast('🔧', `Réparation de la clôture lancée : ${money(r.cost)}, prête dans ≈ ${fmtH(r.hours)}.`, 'info'); } else this.error(r.reason); }
        else if (act === 'autofix') { g.setAutoFence(b.id, t.checked); this.sound.play('click'); return; }
        else if (act === 'upgrade') { const r = g.upgrade(b.id); if (r.ok) { this.sound.play('build'); this.toast('🚧', `Travaux d'amélioration lancés : ${C.buildings[b.type].name}, niveau ${b.level + 1} dans ≈ ${fmtH(r.hours)}.`, 'info'); } else this.error(r.reason); }
        else if (act === 'demolish') this.demolish(b);
        else if (act === 'move') this.setTool({ kind: 'move', id: b.id });
        else if (act === 'add') this.openAddDino(b);
        else if (act === 'link') { this.r.ghost = null; this.doLink(b.id, +t.dataset.id); }
        else if (act === 'merge') { this.r.ghost = null; this.doMerge(b.id, +t.dataset.id); return; }
      } else if (sel.kind === 'dino') {
        const d = g.dinos.find((x) => x.id === sel.id);
        if (!d) return;
        if (act === 'treat') { const r = g.treatDino(d.id); if (r.ok) this.sound.play('upgrade'); else this.error(r.reason); }
        else if (act === 'transfer') {
          const n = Object.values(g.buildings).filter((o) => g.canTransfer(d, o).ok).length;
          if (!n) { this.error((d.loose ? 'Aucun enclos adapté n\'a de place pour ' : 'Aucun autre enclos adapté n\'a de place pour ') + d.name); return; }
          this.setTool({ kind: 'transfer', dino: d.id }); return;
        }
        else if (act === 'dup') { const r = g.upgradeDino(d.id, t.dataset.k); if (r.ok) { this.sound.play('upgrade'); this.r.burst(d.x * T, d.y * T - 10, 16, 'sparkle'); } else this.error(r.reason); }
        else if (act === 'sell') {
          this.confirm(`Vendre ${d.name} ?`, `Vous récupérerez ${money(Math.round(g._dinoValue(d) * C.economy.dinoSellRate))}.`, 'Vendre', () => { const encId = d.enc; const r = g.sellDino(d.id); if (r.ok) { this.sound.play('coin'); this.select({ kind: 'building', id: encId }); } });
        }
      }
      this.renderPanel();
    }

    /* Sexe proposé : celui qui permet de former des couples dans l'enclos. */
    defaultSex(b, spId) {
      const g = this.game;
      const list = g.dinosIn(b).filter((d) => !spId || d.sp === spId).map((d) => d.sex).concat(g.deliveriesTo(b).filter((x) => !spId || x.sp === spId).map((x) => x.sex));
      const f = list.filter((x) => x === 'F').length, m = list.length - f;
      return f > m ? 'M' : m > f ? 'F' : (list.length % 2 ? 'M' : 'F');
    }
    deliveryToast(dl) {
      const sp = DZ.SPECIES[dl.sp];
      this.toast('🚁', `${esc(dl.name)}, ${esc(sp.name)} ${dl.sex === 'F' ? 'femelle' : 'mâle'}, est en préparation : livraison par hélicoptère dans ≈ ${fmtH(this.game.deliveryTotal(dl))}.`, 'info');
    }
    openAddDino(b) {
      const g = this.game;
      const list = DZ.SPECIES_ORDER.filter((id) => g.habitatOk(id, b));
      let sex = this.defaultSex(b);
      let h = `<h2>Ajouter un dinosaure</h2><p>${esc(C.buildings[b.type].name)} · place libre : ${g.capacity(b) - g.usedSpace(b)}. Livraison par hélicoptère ; un mâle et une femelle de la même espèce auront des petits.</p>
        <div class="field"><span>Sexe</span><div class="seg" id="sex-seg"><button data-sex="F" class="${sex === 'F' ? 'on' : ''}">♀ Femelle</button><button data-sex="M" class="${sex === 'M' ? 'on' : ''}">♂ Mâle</button></div></div><div class="grid">`;
      for (const id of list) {
        const sp = DZ.SPECIES[id], bal = C.dinos[id];
        const c = g.canAddDino(id, b);
        const locked = !g.s.unlocked[id];
        const why = locked ? `🔒 Jour ${bal.unlockDay}${bal.unlockRating ? ' · ' + bal.unlockRating + ' ★' : ''}` : c.ok ? (c.warning ? '⚠️ Conflit avec les pensionnaires' : `Place ${bal.space} · ★ ${bal.attraction} · 🚁 ${fmtH(g.deliveryHours(id) + C.delivery.flight + C.delivery.hover)}`) : c.reason;
        h += `<button class="choice" data-sp="${id}" ${c.ok ? '' : 'disabled'} data-tip="${esc(this.dinoTip(id))}"><canvas data-thumb="${id}"></canvas><div class="n">${esc(sp.short || sp.name)} · ${money(bal.price)}</div><div class="s">${why}</div></button>`;
      }
      h += '</div><div class="btns"><button class="btn" data-close>Fermer</button></div>';
      this.modal(h, (card) => {
        card.querySelectorAll('canvas[data-thumb]').forEach((c) => { const src = R.dinoThumb(c.dataset.thumb, 140, 70); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); });
        card.querySelectorAll('[data-sex]').forEach((btn) => btn.addEventListener('click', () => {
          sex = btn.dataset.sex;
          card.querySelectorAll('[data-sex]').forEach((x) => x.classList.toggle('on', x === btn));
          this.sound.play('click');
        }));
        card.querySelectorAll('[data-sp]').forEach((btn) => btn.addEventListener('click', () => {
          const r = g.buyDino(btn.dataset.sp, b.id, sex);
          if (r.ok) { this.sound.play('upgrade'); this.deliveryToast(r.delivery); this.closeModal(); this.renderPanel(); } else this.error(r.reason);
        }));
      });
    }

    /* ------------------------------------------------------------------
       Notifications, résumé, fenêtres
       ------------------------------------------------------------------ */
    toast(icon, text, kind, action) {
      const box = $('#toasts');
      const t = el('div', 'toast ' + (kind || 'info'));
      t.innerHTML = `<div class="i">${icon}</div><div>${text}</div><button class="x" aria-label="Fermer">✕</button>`;
      if (action) {
        const labels = { treat: '💉 Soigner', select: '🔎 Voir', catalog: '🦖 Voir l\'espèce', dino: '🔎 Voir' };
        const b = el('button', 'btn small act', labels[action.type] || 'Voir');
        b.addEventListener('click', () => {
          if (action.type === 'treat') { const r = this.game.treatDino(action.dino); if (!r.ok) this.error(r.reason || 'Impossible'); else this.sound.play('upgrade'); }
          else if (action.type === 'select') { const bb = this.game.buildings[action.building]; if (bb) { this.select({ kind: 'building', id: bb.id }); this.focus((bb.x + bb.w / 2) * T, (bb.y + bb.h / 2) * T); } }
          else if (action.type === 'catalog') { this.tab = 'dinos'; this.buildTabs(); }
          else if (action.type === 'dino') this.showDino(action.dino);
          close();
        });
        t.appendChild(b);
      }
      const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 350); };
      t.querySelector('.x').addEventListener('click', close);
      box.appendChild(t);
      while (box.children.length > 5) box.firstChild.remove();
      setTimeout(close, kind === 'error' || kind === 'music' ? 3000 : kind === 'bad' ? 11000 : 7000);
    }

    /* Sélectionne un dinosaure et centre la vue dessus. */
    showDino(id) {
      const d = this.game.dinos.find((x) => x.id === id);
      if (!d) return;
      this.select({ kind: 'dino', id: d.id });
      this.focus(d.x * T, d.y * T);
    }
    /* Bandeau d'alerte tant qu'un dinosaure est en liberté. */
    updateAlert() {
      const g = this.game, loose = g.looseDinos();
      let a = this._alert;
      if (!a) {
        a = this._alert = el('button', 'glass hidden', '');
        a.id = 'alert';
        a.addEventListener('click', () => { const l = this.game.looseDinos(); if (l.length) { const d = l[(this._alertI = ((this._alertI || 0) + 1) % l.length)]; this.showDino(d.id); } });
        $('#app').appendChild(a);
      }
      const key = loose.map((d) => d.id + (d.tr ? d.tr.phase : '')).join(',') + g.looseOpenFactor();
      if (key === this._alertKey) return;
      this._alertKey = key;
      a.classList.toggle('hidden', !loose.length);
      if (!loose.length) return;
      const d = loose[0], sp = DZ.SPECIES[d.sp], more = loose.length > 1 ? ` (+${loose.length - 1})` : '';
      const closed = g.looseOpenFactor() <= 0;
      const what = d.tr ? g.transferPhaseText(d.tr) : `envoyez la vétérinaire${sp.predator ? ' au plus vite' : ''}`;
      a.innerHTML = `<b>🚨 ${esc(d.name)} (${esc(sp.short || sp.name)}) en liberté${more}</b><span>${esc(what)}${closed ? ' · parc fermé' : ''}</span>`;
    }
    /* Fin de partie : un carnivore évadé a attaqué un visiteur. */
    showGameOver() {
      const g = this.game, o = g.s.over;
      if (!o) return;
      g.setSpeed(0); this.refreshSpeed();
      this.modal(`<h2>🦖 Partie terminée</h2><p>${esc(o.text)}</p>
        <div class="rows"><span class="k">Jour atteint</span><span class="v">${o.day}</span><span class="k">Gains depuis l'ouverture</span><span class="v">${money(o.earned)}</span></div>
        <p class="info small">Pour éviter les évasions : clôtures électrifiées ou murs de verre pour les carnivores, animaux heureux. Si un dinosaure s'échappe, sélectionnez-le tout de suite et envoyez la vétérinaire.</p>
        <div class="btns"><button class="btn primary" data-over>🔄 Nouvelle partie</button></div>`, (card) => {
        card.querySelector('[data-over]').addEventListener('click', () => { this.closeModal(); if (this.onReset) this.onReset(); });
      });
      $('#modal').onclick = null; // pas de fermeture en cliquant à côté
      this.sound.play('alarm');
    }

    error(reason) { this.toast('✋', esc(reason || 'Action impossible'), 'error'); this.sound.play('error'); }

    focus(x, y) { this.r.focus(x, y); }

    showSummary(sm) {
      const box = $('#summary');
      const line = (k, v, cls) => `<span class="k">${k}</span><span class="v ${cls || ''}">${v}</span>`;
      const sign = (v) => (v >= 0 ? '+' : '') + money(v);
      const d = sm.ratingDelta;
      box.innerHTML = `<h2>Fin du jour ${sm.day}</h2><div class="sub" style="color:var(--muted);font-size:12.5px">${U.fmt(sm.visitors)} visiteurs · satisfaction ${Math.round(sm.satisfaction)} / 100</div>
        <div class="rows">
          ${line('🎟️ Billets', sign(sm.tickets), 'pos')}
          ${line('🛍️ Boutiques', sign(sm.shops), 'pos')}
          ${line('🍽️ Restauration', sign(sm.food), 'pos')}
          ${sm.events ? line('✨ Événements', sign(sm.events), sm.events >= 0 ? 'pos' : 'neg') : ''}
          ${line('🥩 Nourriture des dinosaures', sign(-sm.upkeepDinos), 'neg')}
          ${line('🔧 Entretien et personnel', sign(-sm.upkeepBuildings), 'neg')}
          <span class="k total">Bénéfice du jour</span><span class="v total ${sm.net >= 0 ? 'pos' : 'neg'}">${sign(sm.net)}</span>
          ${line('Note du parc', sm.rating.toFixed(2) + ' ★ ' + (Math.abs(d) >= 0.01 ? `<span class="${d > 0 ? 'pos' : 'neg'}">(${d > 0 ? '+' : ''}${d.toFixed(2)})</span>` : ''))}
          ${sm.construction || sm.dinos ? line('Investissements', money(-(sm.construction + sm.dinos))) : ''}
          ${this.game.s.fear > 0.02 ? line('😨 Peur après une évasion', `−${Math.round(this.game.s.fear * 100)} % de visiteurs demain`, 'neg') : ''}
        </div><div class="bar"><i></i></div>`;
      box.classList.remove('hidden');
      const bar = box.querySelector('.bar i');
      bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 9000, easing: 'linear' });
      clearTimeout(this._sumT);
      this._sumT = setTimeout(() => box.classList.add('hidden'), 9000);
      box.onclick = () => box.classList.add('hidden');
    }

    modal(html, setup) {
      const m = $('#modal'), card = m.querySelector('.modal-card');
      card.innerHTML = html;
      m.classList.remove('hidden');
      card.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeModal()));
      m.onclick = (e) => { if (e.target === m) this.closeModal(); };
      if (setup) setup(card);
    }
    closeModal() { $('#modal').classList.add('hidden'); this.hideTip(); }

    confirm(title, text, yes, onYes) {
      this.modal(`<h2>${esc(title)}</h2><p>${text}</p><div class="btns"><button class="btn" data-close>Annuler</button><button class="btn primary" data-yes>${esc(yes)}</button></div>`, (card) => {
        card.querySelector('[data-yes]').addEventListener('click', () => { this.closeModal(); onYes(); });
      });
    }

    openMenu() {
      const q = this.quality;
      this.modal(`<h2>DinoZoo</h2><p>Jour ${this.game.s.day} · ${money(this.game.s.totalEarned)} gagnés depuis l'ouverture.</p>
        <div class="menu-list">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span style="font-size:14px">Qualité graphique</span><div class="seg" id="q-seg">${['low', 'medium', 'high'].map((k) => `<button data-q="${k}" class="${q === k ? 'on' : ''}">${{ low: 'Basse', medium: 'Moyenne', high: 'Élevée' }[k]}</button>`).join('')}</div></div>
          <div class="section" style="margin-top:4px"><h3>Son et musique</h3>
            ${[['master', 'Volume général'], ['music', 'Musique'], ['sfx', 'Effets'], ['amb', 'Ambiance']].map(([k, l]) => `<label class="vol-row"><span>${l}</span><input type="range" min="0" max="100" value="${Math.round(this.sound.vol[k] * 100)}" data-vol="${k}"><span>${Math.round(this.sound.vol[k] * 100)} %</span></label>`).join('')}
            <div class="btns" style="justify-content:flex-start"><button class="btn small" data-m="music">${this.sound.musicOn ? '🎵 Couper la musique' : '🎵 Activer la musique'}</button><button class="btn small" data-m="next">⏭ Thème suivant</button><span style="font-size:12px;color:var(--muted);align-self:center;font-family:var(--serif);font-style:italic">${this.sound.music && this.sound.music.title ? '♪ ' + esc(this.sound.music.title) : ''}</span></div>
          </div>
          <button class="btn" data-m="stats">📊 Score et statistiques</button>
          <button class="btn" data-m="help">❔ Aide et raccourcis</button>
          <button class="btn" data-m="tuto">🎓 Revoir le tutoriel</button>
          <button class="btn" data-m="save">💾 Sauvegarder maintenant</button>
          <button class="btn danger" data-m="reset">🔄 Recommencer une partie</button>
        </div><div class="btns"><button class="btn" data-close>Fermer</button></div>`, (card) => {
        card.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { this.onQuality(b.dataset.q, true); card.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b)); }));
        card.querySelectorAll('[data-vol]').forEach((inp) => inp.addEventListener('input', () => {
          this.sound.init();
          const v = {}; v[inp.dataset.vol] = inp.value / 100; this.sound.setVolumes(v);
          inp.nextElementSibling.textContent = inp.value + ' %';
          const s = DZ.Save.settings(); s.vol = Object.assign({}, this.sound.vol); DZ.Save.setSettings(s);
        }));
        card.querySelector('[data-m="music"]').addEventListener('click', (e) => { this.toggleMusic(); e.target.textContent = this.sound.musicOn ? '🎵 Couper la musique' : '🎵 Activer la musique'; });
        card.querySelector('[data-m="next"]').addEventListener('click', () => { this.sound.init(); if (this.sound.music) { this.sound.music.on = true; this.sound.music.next(); } });
        card.querySelector('[data-m="stats"]').addEventListener('click', () => this.openStats());
        card.querySelector('[data-m="help"]').addEventListener('click', () => this.openHelp());
        card.querySelector('[data-m="tuto"]').addEventListener('click', () => { this.closeModal(); DZ.tutorial.start(true); });
        card.querySelector('[data-m="save"]').addEventListener('click', () => { DZ.Save.save(this.game); this.toast('💾', 'Partie sauvegardée.', 'good'); });
        card.querySelector('[data-m="reset"]').addEventListener('click', () => this.confirm('Recommencer une partie ?', 'Le parc actuel sera définitivement perdu.', 'Recommencer', () => this.onReset()));
      });
    }

    openStats() {
      const g = this.game, s = g.s;
      const best = DZ.Save.best();
      const a = g.computeAttraction();
      const sc = g.dayScore();
      const hist = s.history.slice(-14);
      const maxNet = Math.max(1, ...hist.map((x) => Math.abs(x.net)));
      const bars = hist.map((x) => `<div title="Jour ${x.day} : ${money(x.net)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:60px"><i style="display:block;border-radius:3px 3px 0 0;height:${Math.max(2, Math.abs(x.net) / maxNet * 58)}px;background:${x.net >= 0 ? 'var(--green)' : 'var(--red)'}"></i></div>`).join('');
      this.modal(`<h2>Score et statistiques</h2>
        <div class="score"><div><small>Jour</small><b>${s.day}</b></div><div><small>Gains totaux (score)</small><b>${money(s.totalEarned)}</b></div>
        <div><small>Meilleur score</small><b>${money(Math.max(best.earned, s.totalEarned))}</b></div><div><small>Visiteurs accueillis</small><b>${U.fmt(s.totalVisitors || 0)}</b></div></div>
        <div class="section"><h3>Attractivité : ${Math.round(a.total)}</h3><div class="rows">
          <span class="k">Dinosaures</span><span class="v">${Math.round(a.dinos)}</span><span class="k">Diversité (${a.species} espèces, ${a.families} familles)</span><span class="v">${Math.round(a.diversity)}</span>
          <span class="k">Services</span><span class="v">${Math.round(a.services)}</span><span class="k">Décor</span><span class="v">${Math.round(a.decor)}</span><span class="k">Propreté</span><span class="v">${Math.round(a.clean)} / 100</span></div></div>
        <div class="section"><h3>Note du parc : ${s.rating.toFixed(2)} ★</h3><div class="rows">
          <span class="k">Satisfaction des visiteurs</span><span class="v">${Math.round(sc.satisfaction)}</span><span class="k">Propreté</span><span class="v">${Math.round(sc.cleanliness)}</span>
          <span class="k">Diversité des espèces</span><span class="v">${Math.round(sc.diversity)}</span><span class="k">Qualité des enclos</span><span class="v">${Math.round(sc.quality)}</span><span class="k">Bien-être animal</span><span class="v">${Math.round(sc.welfare)}</span></div></div>
        ${hist.length ? `<div class="section"><h3>Bénéfice des derniers jours</h3><div style="display:flex;gap:3px;align-items:flex-end">${bars}</div></div>` : ''}
        <div class="btns"><button class="btn" data-close>Fermer</button></div>`);
    }

    openHelp() {
      this.modal(`<h2>Aide</h2>
        <p>Construisez des <b>chemins</b> depuis l'entrée, des <b>enclos</b> reliés aux chemins, puis installez-y des <b>dinosaures</b>. Les visiteurs paient un billet, se promènent, regardent les enclos et dépensent dans les boutiques et restaurants. Gagnez un maximum d'argent pour agrandir le parc !</p>
        <p>Ajoutez des <b>toilettes</b>, des <b>restaurants</b> et des <b>poubelles</b> pour garder des visiteurs satisfaits. La <b>note du parc</b> dépend de leur satisfaction, de la propreté, de la diversité des espèces, de la qualité des enclos et du bien-être des animaux. Elle débloque de nouvelles espèces.</p>
        <p>⚠️ Les <b>carnivores</b> ne cohabitent qu'avec leur propre espèce : ils chassent les autres (les petites espèces et les bébés surtout ; les grandes se défendent) et se battent avec les autres prédateurs.</p>
        <p>🔧 Les <b>clôtures s'usent</b> avec le temps et sous les charges des gros animaux : surveillez leur état dans le panneau de l'enclos, réparez-les ou cochez l'entretien automatique.</p>
        <p>🚨 Derrière une clôture faible ou abîmée, un dinosaure peut <b>s'évader</b> (surtout les carnivores ; les murs de verre du niveau 3 tiennent tant qu'ils sont entretenus). Les visiteurs paniquent, la note baisse et la peur éloigne les visiteurs pendant quelques jours. <b>Si un carnivore évadé attaque un visiteur, la partie est perdue.</b> Cliquez sur le bandeau rouge, puis <b>Capturer</b> : la vétérinaire le rattrape et l'endort, l'hélicoptère le ramène dans l'enclos choisi.</p>
        <p>🌉 Une <b>passerelle</b> relie deux enclos terrestres face à face (onglet Enclos, ou panneau de l'enclos) : les dinosaures passent de l'un à l'autre, au-dessus des allées. 🔗 Deux enclos terrestres qui se touchent peuvent être <b>réunis</b> en un seul. ⚔️ Deux <b>mâles adultes</b> d'une même espèce finissent par se battre, surtout chez les espèces territoriales : le vaincu peut être blessé ; une passerelle lui permet de s'éloigner.</p>
        <p>🔭 Une <b>passerelle d'observation</b> (onglet Chemins) fait passer les visiteurs au-dessus d'un enclos : la meilleure vue sur les dinosaures. 🛝 Les <b>aires de jeux</b> (onglet Services) amusent les enfants et rendent les familles plus heureuses. 🚁 Pour changer un dinosaure d'enclos, sélectionnez-le puis <b>Transférer</b> : une vétérinaire l'endort et un hélicoptère le dépose dans son nouvel enclos.</p>
        <div class="keys">
          <kbd>Clic gauche</kbd> sélectionner / construire · <kbd>Clic droit</kbd> ou <kbd>Échap</kbd> annuler l'outil<br>
          <kbd>Glisser</kbd> déplacer la vue · <kbd>Molette</kbd> zoomer / dézoomer · <kbd>Flèches</kbd> / <kbd>ZQSD</kbd> / <kbd>WASD</kbd> se déplacer<br>
          <kbd>Clic droit glissé</kbd> ou <kbd>Ctrl + glisser</kbd> tourner et incliner la caméra · <kbd>[</kbd> <kbd>]</kbd> pivoter · <kbd>Début</kbd> recentrer<br>
          <b>Écran tactile :</b> un doigt pour déplacer la vue · deux doigts pour zoomer et tourner la carte · deux doigts glissés vers le haut ou le bas pour l'incliner · appui long pour les informations · toucher l'onglet ouvert pour replier la barre · 🧭 pour remettre le nord en haut<br>
          <kbd>Espace</kbd> pause · <kbd>1</kbd> vitesse normale · <kbd>2</kbd> rapide · <kbd>3</kbd> très rapide · <kbd>N</kbd> minicarte<br>
          <kbd>C</kbd> chemin · <kbd>V</kbd> sélection · <kbd>M</kbd> déplacer · <kbd>X</kbd> démolir · <kbd>Suppr</kbd> démolir la sélection
        </div><div class="btns"><button class="btn" data-close>Fermer</button></div>`);
    }

    /* ------------------------------------------------------------------
       Liaison avec le jeu
       ------------------------------------------------------------------ */
    bindGame() {
      const g = this.game;
      g.on('notify', (n) => { this.toast(n.icon, esc(n.text), n.kind, n.action); this.sound.play(n.kind === 'bad' ? 'error' : 'notify'); if (n.icon === '🦖') { this.buildItems(); if (this.sound.music) this.sound.music.wonder(); } });
      g.on('dayEnd', (sm) => { this.showSummary(sm); this.sound.play('coin'); this.buildItems(); });
      g.on('money', (a) => { this._pendingDelta = (this._pendingDelta || 0) + a; });
      g.on('spend', (e) => { if (e.b) e.b.earned = (e.b.earned || 0) + e.amount; this.sound.play('coin', { pos: this.pos3(e.x, e.y, 0.3) }); });
      g.on('roar', (d) => {
        const sp = DZ.SPECIES[d.sp];
        const air = sp.habitat === 'air';
        this.sound.dino(d.sp, this.pos3(d.x, d.y, air ? 1.2 : 0.9), true);
        if (sp.predator && C.dinos[d.sp].space >= 5) this.sound.crowdReact('ooh');
      });
      g.on('splash', (d) => this.sound.play('splash', { pos: this.pos3(d.x, d.y, 0) }));
      g.on('thunder', () => this.sound.play('thunder'));
      g.on('escape', (e) => { this.sound.play('alarm'); if (this.sound.music && e.danger >= 0.3) this.sound.music.alert(); this.sound.crowdReact('peur'); });
      g.on('panic', () => { if (!this._panicSnd || performance.now() - this._panicSnd > 4000) { this._panicSnd = performance.now(); this.sound.crowdReact('peur'); } });
      g.on('attack', (e) => { this.sound.dino(e.dino.sp, this.pos3(e.x, e.y, 0.9), true); this.focus(e.x * T, e.y * T); });
      g.on('gameOver', () => { DZ.Save.save(g); setTimeout(() => this.showGameOver(), 1800); });
      g.on('watched', (e) => { if (e.gain > 16 && Math.random() < 0.25) this.sound.crowdReact('ooh'); });
      g.on('dinoAdded', (d) => { if (C.dinos[d.sp].attraction >= 80 && this.sound.music) this.sound.music.wonder(); });
      g.on('reset', () => { this.moneyShown = g.s.money; this.select(null); this.buildItems(); this.mmBase = null; this.mmDirty = true; this.refreshPlayer(); });
      g.on('player', () => this.refreshPlayer());
      g.on('dinoBorn', (d) => { this.sound.dino(d.sp, this.pos3(d.x, d.y, 0.4), false); });
      g.on('clash', (e) => this.sound.play('clash', { pos: this.pos3(e.x, e.y, 0.5), sp: e.sp }));
      g.on('fight', () => this.sound.crowdReact('ooh'));
      g.on('kill', () => this.sound.crowdReact(g.s.rating >= 3.5 ? 'ooh' : 'peur'));
      g.on('constructed', (b) => { if (C.buildings[b.type].cat !== 'deco') this.sound.play('upgrade'); });
      g.on('mapChanged', () => { this.mmDirty = true; });
      g.on('fenceHit', (e) => this.sound.play('clash', { pos: this.pos3(e.x, e.y, 0.4), sp: e.sp }));
      g.on('dart', (tr) => this.sound.play('dart', { pos: this.pos3(tr.d.x, tr.d.y, 0.4) }));
      g.on('transferred', (tr) => { if (this.panelSel && this.panelSel.kind === 'dino' && this.panelSel.id === tr.d.id) this.renderPanel(); });
    }

    update(dt) {
      this.updateKeys(dt);
      this.updateAlert();
      if (this.compass && this.r.project) {
        const c = this.r.cam, a = this.r.project(c.tx, c.ty, c.tz), b = this.r.project(c.tx, c.ty, c.tz - 4);
        if (a && b) this.compass.style.transform = `rotate(${Math.atan2(b.x - a.x, a.y - b.y)}rad)`;
      }
      this.updateTop(dt);
      this.panelT += dt;
      if (this.panelT > 0.4) {
        this.panelT = 0;
        if (this._pendingDelta) { this.moneyDelta(this._pendingDelta); this._pendingDelta = 0; }
        if (this.panelSel && this.panelKey() !== this._panelKey) this.renderPanel();
        this.refreshItems();
        this.sound.setEnv(this.game.s.hour, this.game.stormIntensity());
        if (this.game.speed) {
          const cx = this.r.cam.tx, cz = this.r.cam.tz;
          for (const id in this.game.buildings) {
            const b = this.game.buildings[id];
            if (!this.game.busy(b) || C.buildings[b.type].cat === 'deco') continue;
            if (Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cz) < 45 && Math.random() < 0.55) this.sound.play('hammer', { pos: this.pos3(b.x + Math.random() * b.w, b.y + Math.random() * b.h, 0.3) });
          }
        }
        this.drawMinimap();
      }
    }
  }

  /* ------------------------------------------------------------------
     Minicarte
     ------------------------------------------------------------------ */
  UI.prototype.bindMinimap = function () {
    const cv = $('#mm-canvas');
    this.mmCanvas = cv;
    cv.width = 440; cv.height = 312;
    $('#mm-toggle').addEventListener('click', () => { $('#minimap').classList.toggle('small'); $('#mm-toggle').textContent = $('#minimap').classList.contains('small') ? '+' : '–'; });
    const go = (e) => {
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * C.map.w, y = (e.clientY - r.top) / r.height * C.map.h;
      this.focus(x * T, y * T);
    };
    let down = false;
    cv.addEventListener('pointerdown', (e) => { down = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* */ } go(e); });
    cv.addEventListener('pointermove', (e) => { if (down) go(e); });
    cv.addEventListener('pointerup', () => { down = false; });
    this.mmDirty = true;
  };

  UI.prototype.minimapBase = function () {
    const g = this.game, W = C.map.w, H = C.map.h;
    const c = R.canvas(W, H), x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data;
    const B = DZ.BIOME, TER = DZ.TER;
    for (let i = 0; i < W * H; i++) {
      const t = g.terrain[i], b = g.biome[i], e = g.elev[i];
      let col;
      if (t === TER.WATER) col = b === B.SEA ? [36 + 30 * (1 + e), 86 + 30 * (1 + e), 110 + 25 * (1 + e)] : [70, 128, 132];
      else if (t === TER.SAND) col = [204, 186, 140];
      else if (t === TER.ROCK || b === B.MOUNTAIN) col = e > 5 ? [236, 238, 240] : e > 3.5 ? [170, 166, 160] : [132, 126, 116];
      else if (b === B.JUNGLE) col = [46, 88, 34];
      else if (b === B.FOREST) col = [62, 92, 40];
      else if (b === B.HILLS) col = [110, 118, 70];
      else if (t === TER.DIRT) col = [140, 116, 74];
      else col = [112, 140, 64];
      const shade = t === TER.WATER ? 1 : 0.9 + Math.min(0.25, e * 0.05);
      d[i * 4] = col[0] * shade; d[i * 4 + 1] = col[1] * shade; d[i * 4 + 2] = col[2] * shade; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };

  UI.prototype.drawMinimap = function () {
    if (!this.mmCanvas || $('#minimap').classList.contains('small') || document.body.classList.contains('panel-open')) return;
    const g = this.game, W = C.map.w, H = C.map.h;
    if (!this.mmBase) this.mmBase = this.minimapBase();
    if (this.mmDirty || !this.mmPark) {
      this.mmDirty = false;
      const c = this.mmPark || R.canvas(W, H), x = c.getContext('2d');
      x.clearRect(0, 0, W, H);
      x.fillStyle = '#e8dcc0';
      for (let i = 0; i < W * H; i++) if (g.path[i]) x.fillRect(i % W, Math.floor(i / W), 1, 1);
      for (const id in g.buildings) {
        const b = g.buildings[id], def = C.buildings[b.type];
        x.fillStyle = def.cat === 'enclos' ? (def.kind === 'water' ? '#4fb0c0' : '#c79a5a') : def.cat === 'service' ? '#e6bb5c' : b.type === 'entree' ? '#e07a5f' : '#9cc47a';
        for (const [px, py, pw, ph] of DZ.encParts(b)) x.fillRect(px, py, pw, ph);
      }
      x.fillStyle = '#8a6545';
      for (const id in g.s.links) { const l = g.s.links[id]; x.fillRect(l.x, l.y, Math.max(1, l.w), Math.max(1, l.h)); }
      x.fillStyle = '#f4ead2';
      for (const r of g.skyRuns()) x.fillRect(r.x, r.y, r.w, r.h);
      this.mmPark = c;
    }
    const cv = this.mmCanvas, x = cv.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.drawImage(this.mmBase, 0, 0, cv.width, cv.height);
    x.imageSmoothingEnabled = false;
    x.drawImage(this.mmPark, 0, 0, cv.width, cv.height);
    const sx = cv.width / W, sy = cv.height / H;
    // dinosaures
    x.fillStyle = '#ffffff';
    for (const d of g.dinos) x.fillRect(d.x * sx - 1, d.y * sy - 1, 2.5, 2.5);
    // dinosaures en liberté
    for (const d of g.dinos) if (d.loose) { x.fillStyle = '#ff4a36'; x.beginPath(); x.arc(d.x * sx, d.y * sy, 4 + Math.sin(performance.now() / 150) * 1.2, 0, U.TAU); x.fill(); x.fillStyle = '#ffffff'; }
    // vue actuelle
    const v = this.r.view;
    if (v) {
      x.strokeStyle = 'rgba(255,240,200,0.95)'; x.lineWidth = 2;
      x.strokeRect(v.x0 / T * sx, v.y0 / T * sy, (v.x1 - v.x0) / T * sx, (v.y1 - v.y0) / T * sy);
    }
  };

  DZ.UI = UI;
})();
