/* =====================================================================
   DinoZoo — Environnement sonore (Web Audio API, aucun fichier).
   - Mixage : bus musique / effets / ambiance / interface, réverbération
     de salle générée, compresseur final, volumes réglables.
   - Son 3D : chaque source (dinosaure, foule, éclaboussure) est placée
     dans l'espace (HRTF) par rapport à la caméra ; la distance atténue
     et assourdit.
   - Voix de dinosaures : modèle source-filtre (voix qui tremble, gorge,
     souffle), assemblé différemment pour chaque famille.
   - Ambiances mixées selon le lieu : vagues, rivière, pluie et vent
     d'orage, tonnerre, oiseaux, cigales, grillons, grenouilles, foule.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const U = DZ.util;
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  DZ.mtof = mtof;

  /* Famille vocale de chaque espèce */
  const VOICE = {
    trex: { type: 'roar', f0: 48, dur: 3.0, rasp: 0.8, sub: 1, bright: 2200 },
    spinosaurus: { type: 'roar', f0: 62, dur: 2.6, rasp: 0.6, sub: 0.8, bright: 1900, gurgle: true },
    allosaurus: { type: 'roar', f0: 78, dur: 2.2, rasp: 0.9, sub: 0.6, bright: 2800 },
    carnotaurus: { type: 'roar', f0: 72, dur: 2.0, rasp: 1.0, sub: 0.6, bright: 2600 },
    dilophosaurus: { type: 'hoot', f0: 420 },
    velociraptor: { type: 'raptor', f0: 720 },
    compsognathus: { type: 'chirp', f0: 2300 },
    dryosaurus: { type: 'squeak', f0: 900 },
    psittacosaurus: { type: 'squeak', f0: 760 },
    pachycephalosaurus: { type: 'bellow', f0: 150, dur: 0.7 },
    parasaurolophus: { type: 'horn', f0: 92 },
    triceratops: { type: 'bellow', f0: 82, dur: 1.1 },
    stegosaurus: { type: 'bellow', f0: 70, dur: 0.9 },
    ankylosaurus: { type: 'bellow', f0: 64, dur: 0.8 },
    diplodocus: { type: 'moan', f0: 52 },
    brachiosaurus: { type: 'moan', f0: 42 },
    pteranodon: { type: 'screech', f0: 1150 },
    quetzalcoatlus: { type: 'screech', f0: 760 },
    plesiosaurus: { type: 'song', f0: 290 },
    mosasaurus: { type: 'deep', f0: 58 }
  };
  /* Niveau de chaque type de voix (équilibré par rendu hors ligne). */
  const G = { roar: 1, horn: 0.9, moan: 1, bellow: 0.6, raptor: 0.85, purr: 1, hoot: 0.8, chirp: 1, squeak: 1, screech: 1.6, song: 0.75, deep: 0.75 };

  class Sound {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.vol = { master: 0.85, music: 0.5, sfx: 0.85, amb: 0.75 };
      this.musicOn = true;
      this._last = {};
      this.active = 0;
      this.env = { hour: 12, storm: 0, wind: 0.3, sea: 0, fresh: 0, forest: 0, jungle: 0, mountain: 0, crowd: 0, alt: 10, near: [] };
      this.lis = { x: 0, y: 10, z: 0 };
      this.hour = 12; this.storm = 0;
    }

    /* ------------------------------------------------------------------
       Démarrage et mixage
       ------------------------------------------------------------------ */
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -18; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
      this.master = c.createGain();
      this.outGain = c.createGain(); this.outGain.gain.value = 0.8;
      this.master.connect(this.comp); this.comp.connect(this.outGain); this.outGain.connect(c.destination);
      this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain(); this.uiBus = c.createGain();
      for (const b of [this.sfxBus, this.ambBus, this.uiBus]) b.connect(this.master);
      // musique : son direct adouci + grande salle de concert dédiée
      this.musicTone = c.createBiquadFilter(); this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 6500; this.musicTone.Q.value = 0.4;
      this.musicLow = c.createBiquadFilter(); this.musicLow.type = 'highpass'; this.musicLow.frequency.value = 45;
      this.musicDry = c.createGain(); this.musicDry.gain.value = 0.62;
      this.musicBus.connect(this.musicLow); this.musicLow.connect(this.musicTone); this.musicTone.connect(this.musicDry); this.musicDry.connect(this.master);
      // réverbération de salle
      this.reverb = c.createConvolver();
      this.reverb.buffer = this._impulse(3.2, 2.6);
      this.revOut = c.createGain(); this.revOut.gain.value = 0.9;
      this.reverb.connect(this.revOut); this.revOut.connect(this.master);
      this.hall = c.createConvolver(); this.hall.buffer = this._impulse(5.2, 2.7, 0.028);
      this.hallOut = c.createGain(); this.hallOut.gain.value = 0.95;
      this.musicSend = c.createGain(); this.musicSend.gain.value = 0.85;
      this.musicTone.connect(this.musicSend); this.musicSend.connect(this.hall); this.hall.connect(this.hallOut); this.hallOut.connect(this.master);
      this.sfxSend = c.createGain(); this.sfxSend.gain.value = 0.22; this.sfxBus.connect(this.sfxSend); this.sfxSend.connect(this.reverb);
      this.ambSend = c.createGain(); this.ambSend.gain.value = 0.12; this.ambBus.connect(this.ambSend); this.ambSend.connect(this.reverb);
      // bruits
      this.white = this._noise('white'); this.pink = this._noise('pink'); this.brown = this._noise('brown');
      this.applyVolumes();
      this._mkWaves();
      this._beds();
      this._crowdInit();
      if (DZ.Music) { this.music = new DZ.Music(this); if (this.musicOn && !this.muted) this.music.start(); }
      this._timer = setInterval(() => this._tick(), 100);
      this.started = true;
    }

    _noise(kind) {
      const c = this.ctx, len = c.sampleRate * 4;
      const buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
        for (let i = 0; i < len; i++) {
          const w = R() * 2 - 1;
          if (kind === 'white') d[i] = w * 0.5;
          else if (kind === 'pink') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        }
      }
      return buf;
    }

    /* Réponse impulsionnelle : premières réflexions + queue qui s'assombrit. */
    _impulse(seconds, decay, predelay) {
      const c = this.ctx, len = Math.floor(c.sampleRate * seconds);
      const pre = Math.floor(c.sampleRate * (predelay || 0));
      const buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / c.sampleRate;
          const k = Math.min(0.95, 0.15 + t * 0.35);
          lp = lp * k + (R() * 2 - 1) * (1 - k);
          d[i] = i < pre ? 0 : lp * Math.pow(1 - i / len, decay) * (t - pre / c.sampleRate < 0.02 ? Math.max(0, (t - pre / c.sampleRate) / 0.02) : 1);
        }
        for (let e = 0; e < 9; e++) { const p = Math.floor(c.sampleRate * rr(0.008, 0.09)); d[p] += (R() < 0.5 ? -1 : 1) * rr(0.2, 0.55); }
      }
      return buf;
    }

    applyVolumes() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime, v = this.vol;
      this.master.gain.setTargetAtTime(this.muted ? 0 : v.master, t, 0.08);
      this.musicBus.gain.setTargetAtTime(this.musicOn ? v.music * 0.55 : 0, t, 0.3);
      this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.08);
      this.ambBus.gain.setTargetAtTime(v.amb * 0.9, t, 0.2);
      this.uiBus.gain.setTargetAtTime(v.sfx * 0.7, t, 0.08);
    }
    setMuted(m) { this.muted = m; this.applyVolumes(); }
    setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
    setMusic(on) {
      this.musicOn = on;
      this.applyVolumes();
      if (this.music) { if (on) this.music.start(); }
    }

    /* ------------------------------------------------------------------
       Son 3D
       ------------------------------------------------------------------ */
    setListener(x, y, z, fx, fy, fz) {
      this.lis = { x, y, z };
      if (!this.ctx) return;
      const L = this.ctx.listener, t = this.ctx.currentTime;
      const ux = 0, uy = 1, uz = 0;
      if (L.positionX) {
        L.positionX.setTargetAtTime(x, t, 0.05); L.positionY.setTargetAtTime(y, t, 0.05); L.positionZ.setTargetAtTime(z, t, 0.05);
        L.forwardX.setTargetAtTime(fx, t, 0.05); L.forwardY.setTargetAtTime(fy, t, 0.05); L.forwardZ.setTargetAtTime(fz, t, 0.05);
        L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
      } else { L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    }

    /* Chaîne de sortie : gain → filtre d'éloignement → panoramique 3D → bus.
       Renvoie null si la source est inaudible. */
    out(pos, opts) {
      const c = this.ctx;
      opts = opts || {};
      const g = c.createGain();
      const bus = opts.bus || this.sfxBus;
      if (!pos) { g.connect(bus); return { g, end: () => {} }; }
      const dx = pos[0] - this.lis.x, dy = pos[1] - this.lis.y, dz = pos[2] - this.lis.z;
      const dist = Math.hypot(dx, dy, dz);
      const range = opts.range || 90;
      if (dist > range) return null;
      if (this.active > 28 && !opts.important) return null;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = U.clamp(18000 / (1 + dist * 0.09), 900, 18000);
      const p = c.createPanner();
      p.panningModel = opts.hrtf === false ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref || 6;
      p.maxDistance = 400;
      p.rolloffFactor = opts.rolloff || 1.1;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(lp); lp.connect(p); p.connect(bus);
      this.active++;
      let done = false;
      return { g, end: () => { if (!done) { done = true; this.active--; } } };
    }

    _env(param, t, a, peak, hold, rel) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      if (hold > 0) param.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
      param.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
    }
    _src(buf, t, dur, offset) {
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.start(t, offset === undefined ? R() * 3 : offset);
      if (dur) s.stop(t + dur);
      return s;
    }
    _osc(type, f, t, dur) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      o.start(t); o.stop(t + dur);
      return o;
    }
    _filter(type, f, q) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
    _shaper(amount) {
      const s = this.ctx.createWaveShaper(), n = 512, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
      s.curve = curve; s.oversample = '2x';
      return s;
    }
    _throttle(name, ms) {
      const now = performance.now();
      if (this._last[name] && now - this._last[name] < ms) return false;
      this._last[name] = now;
      return true;
    }
    ready() { return !!this.ctx && !this.muted; }

    /* ------------------------------------------------------------------
       Voix de dinosaures — modèle source-filtre
       Une source vocale (onde glottale riche dont la hauteur tremble au
       gré d'un bruit lent, sous-harmonique, souffle) traverse une gorge
       (formants qui suivent l'ouverture de la gueule), puis un léger
       grain de saturation. Chaque espèce assemble ces briques avec
       inspiration, expiration, ébrouements, claquements ou bulles.
       ------------------------------------------------------------------ */
    _mkWaves() {
      const c = this.ctx;
      const mk = (n, fn) => { const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let k = 1; k <= n; k++) im[k] = fn(k); return c.createPeriodicWave(re, im); };
      this.wv = {
        glottal: mk(60, (k) => Math.pow(k, -1.15) * (1 + 0.25 * Math.sin(k * 1.7))), // voix riche
        reed: mk(40, (k) => Math.pow(k, -0.8) * (k % 2 ? 1 : 0.55)), // nasal, cuivré
        soft: mk(12, (k) => Math.pow(k, -2)) // doux, sifflé
      };
    }

    /* Cri d'un dinosaure : big = rugissement complet, sinon cri d'humeur. */
    dino(sp, pos, big) {
      if (!this.ready()) return;
      const v = VOICE[sp];
      if (!v) return;
      if (!this._throttle('dino_' + sp + (big ? 'B' : ''), big ? 1500 : 900)) return;
      const t = this.ctx.currentTime + 0.02;
      const o = this.out(pos, { range: v.type === 'roar' || v.type === 'moan' || v.type === 'horn' ? 140 : 70, ref: v.type === 'roar' ? 10 : 6, important: big });
      if (!o) return;
      const k = big ? 1 : 0.55;
      switch (v.type) {
        case 'roar': this._roar(t, o, v, big ? 1 : 0.55, k); break;
        case 'horn': this._horn(t, o, v, k); break;
        case 'moan': this._moan(t, o, v, k); break;
        case 'bellow': this._bellow(t, o, v, k); break;
        case 'raptor': this._raptor(t, o, v, k, big); break;
        case 'hoot': this._hoot(t, o, v, k); break;
        case 'chirp': this._chirp(t, o, v, k); break;
        case 'squeak': this._squeak(t, o, v, k); break;
        case 'screech': this._screech(t, o, v, k); break;
        case 'song': this._song(t, o, v, k); break;
        case 'deep': this._deep(t, o, v, k); break;
      }
    }

    /* Une émission vocale. Renvoie l'instant où la voix se tait. */
    _voice(t, out, p) {
      const c = this.ctx, dur = p.dur, rel = p.rel || 0.4, end = t + dur + rel + 0.3, f0 = p.f0;
      const src = c.createGain();
      // hauteur instable : bruit grave filtré qui fait trembler la voix
      const jit = this._src(this.brown, t, end - t), jl = this._filter('lowpass', p.jitRate || 14, 0.5), jg = c.createGain();
      jg.gain.value = (p.jit === undefined ? 60 : p.jit) * 5; // bruit brun : écart type ≈ 0,18
      jit.connect(jl); jl.connect(jg);
      const cont = p.contour || [[0, 1], [1, 1]];
      const tone = (wave, mult, gain) => {
        const o = c.createOscillator(); o.setPeriodicWave(wave);
        o.frequency.setValueAtTime(f0 * mult * cont[0][1], t);
        for (let i = 1; i < cont.length; i++) o.frequency.linearRampToValueAtTime(f0 * mult * cont[i][1], t + dur * cont[i][0]);
        jg.connect(o.detune);
        if (p.vib) {
          const l = this._osc('sine', p.vib[0], t, end - t), lg = c.createGain();
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(p.vib[1], t + Math.min(0.4, dur * 0.5));
          l.connect(lg); lg.connect(o.detune);
        }
        const g = c.createGain(); g.gain.value = gain; o.connect(g); g.connect(src);
        o.start(t); o.stop(end);
      };
      tone(this.wv[p.wave || 'glottal'], 1, p.tone === undefined ? 1 : p.tone);
      if (p.sub) tone(this.wv.glottal, 0.5, p.sub);
      if (p.noise) {
        const n = this._src(p.noiseBuf || this.pink, t, end - t), ng = c.createGain(); ng.gain.value = p.noise;
        n.connect(ng); ng.connect(src);
      }
      // grain rugueux : modulation d'amplitude irrégulière (râle, grognement)
      let node = src;
      if (p.rough) {
        const am = c.createGain(); am.gain.value = 1 - p.rough[1];
        const l = c.createOscillator(); l.type = 'triangle'; l.frequency.value = p.rough[0];
        const lj = c.createGain(); lj.gain.value = 600; jl.connect(lj); lj.connect(l.detune);
        const lg = c.createGain(); lg.gain.value = p.rough[1]; l.connect(lg); lg.connect(am.gain);
        l.start(t); l.stop(end);
        src.connect(am); node = am;
      }
      // gorge : formants en parallèle qui suivent l'ouverture de la gueule
      const throat = c.createGain();
      const mouth = p.mouth || [[0, 1], [1, 1]];
      for (const [f, q, a] of p.formants) {
        const bp = this._filter('bandpass', f, q), g = c.createGain(); g.gain.value = a;
        bp.frequency.setValueAtTime(f * mouth[0][1], t);
        for (let i = 1; i < mouth.length; i++) bp.frequency.linearRampToValueAtTime(f * mouth[i][1], t + dur * mouth[i][0]);
        node.connect(bp); bp.connect(g); g.connect(throat);
      }
      let last = throat;
      if (p.drive) { const sh = this._shaper(p.drive); last.connect(sh); last = sh; }
      const lp = this._filter('lowpass', p.lp || 6000, 0.5); last.connect(lp);
      const env = c.createGain(); lp.connect(env); env.connect(out);
      const a = p.att || 0.08, lvl = (p.level || 1) * (p.gain || 1);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(lvl, t + a);
      env.gain.linearRampToValueAtTime(lvl * (p.sustain || 0.8), t + Math.max(a + 0.01, dur));
      env.gain.setTargetAtTime(0.0001, t + Math.max(a + 0.01, dur), rel / 3);
      return t + dur;
    }

    _breath(t, out, dur, lvl, inhale) {
      const c = this.ctx, n = this._src(this.pink, t, dur + 0.4), bp = this._filter('bandpass', 700, 1.1), g = c.createGain();
      if (inhale) { bp.frequency.setValueAtTime(450, t); bp.frequency.exponentialRampToValueAtTime(1300, t + dur); }
      else { bp.frequency.setValueAtTime(1000, t); bp.frequency.exponentialRampToValueAtTime(320, t + dur); }
      n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      if (inhale) { g.gain.linearRampToValueAtTime(lvl, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
      else { g.gain.linearRampToValueAtTime(lvl, t + 0.06); g.gain.setTargetAtTime(0.0001, t + 0.1, dur / 3); }
    }
    _thump(t, out, f, dur, lvl) { // résonance de la poitrine
      const c = this.ctx, o = c.createOscillator(); o.setPeriodicWave(this.wv.soft);
      o.frequency.setValueAtTime(f * 0.8, t); o.frequency.linearRampToValueAtTime(f * 1.1, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
      const lp = this._filter('lowpass', 150, 0.7), g = c.createGain();
      o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(lvl, t + 0.2); g.gain.setTargetAtTime(0.0001, t + dur * 0.7, 0.2);
    }
    _gurgle(t, out, dur, lvl) {
      const c = this.ctx, n = this._src(this.brown, t, dur), bp = this._filter('bandpass', 320, 5), g = c.createGain();
      const m = this._src(this.brown, t, dur), ml = this._filter('lowpass', 9), mg = c.createGain(); mg.gain.value = 900;
      m.connect(ml); ml.connect(mg); mg.connect(bp.frequency);
      n.connect(bp); bp.connect(g); g.connect(out);
      this._env(g.gain, t, 0.2, lvl, dur * 0.5, dur * 0.3);
    }
    _snort(t, out, lvl) { // ébrouement : deux souffles nasaux
      const c = this.ctx;
      for (let i = 0; i < 2; i++) {
        const st = t + i * rr(0.12, 0.18), n = this._src(this.white, st, 0.25), bp = this._filter('bandpass', rr(900, 1500), 1.3), lp = this._filter('lowpass', 3000), g = c.createGain();
        n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
        this._env(g.gain, st, 0.008, lvl * (i ? 0.6 : 1), 0.03, 0.12);
      }
    }
    _bubbles(t, out, n, lo, hi, lvl, span) { // bulles : petite sinusoïde qui monte en s'éteignant
      const c = this.ctx;
      for (let i = 0; i < n; i++) {
        const st = t + R() * span, f = rr(lo, hi), o = this._osc('sine', f, st, 0.1), g = c.createGain();
        o.frequency.setValueAtTime(f, st); o.frequency.exponentialRampToValueAtTime(f * rr(1.5, 2.2), st + 0.05);
        o.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(lvl * rr(0.4, 1), st + 0.003); g.gain.setTargetAtTime(0.0001, st + 0.005, 0.018);
      }
    }
    _clicks(t, out, n, lvl) { // claquements de bec ou de mâchoire
      const c = this.ctx;
      for (let i = 0; i < n; i++) {
        const st = t + i * rr(0.05, 0.09), s = c.createBufferSource(); s.buffer = this.white; s.start(st, R() * 3, 0.012);
        const bp = this._filter('bandpass', rr(2200, 3800), 3), g = c.createGain(); g.gain.value = lvl;
        s.connect(bp); bp.connect(g); g.connect(out);
      }
    }
    _done(o, end) { setTimeout(o.end, Math.max(0.5, end - this.ctx.currentTime + 1.2) * 1000); }

    /* Grands théropodes : inspiration, rugissement guttural, expiration. */
    _roar(t, o, v, len, k) {
      const dur = v.dur * len * rr(0.88, 1.12), f0 = v.f0 * rr(0.93, 1.07);
      let t0 = t;
      if (k >= 1) { this._breath(t, o.g, 0.42, 0.12, true); t0 = t + 0.4; }
      const end = this._voice(t0, o.g, {
        f0, dur, tone: 0.8, sub: 0.75 * v.sub, noise: 0.8 * v.rasp, jit: 70, jitRate: 16,
        contour: [[0, 0.72], [0.22, 1.15], [0.55, 1.02], [1, 0.6]],
        rough: [rr(24, 34), 0.3 + v.rasp * 0.15],
        formants: [[170, 1.4, 1.1], [430, 2.2, 1.4], [920, 3, 1.1], [1750, 4, 0.5], [2900, 5, 0.22]],
        mouth: [[0, 0.7], [0.25, 1.25], [0.6, 1.05], [1, 0.75]],
        drive: 2.2, lp: v.bright, att: 0.18, sustain: 0.6, rel: dur * 0.35 + 0.3, level: k, gain: G.roar
      });
      if (v.gurgle) this._gurgle(t0, o.g, dur, 0.15 * k);
      this._thump(t0, o.g, f0 * 0.5, dur * 0.8, 0.25 * v.sub * k);
      this._breath(t0 + dur * 0.95, o.g, 0.9, 0.12 * k, false);
      o.g.gain.value = 0.85;
      this._done(o, end + dur * 0.35 + 1);
    }

    /* Parasaurolophus : appel de trompe dans une crête creuse (modes d'un tube fermé). */
    _horn(t, o, v, k) {
      const dur = rr(2.0, 2.8) * (k < 1 ? 0.65 : 1), f0 = v.f0 * rr(0.95, 1.05);
      const end = this._voice(t, o.g, {
        f0, dur, wave: 'reed', jit: 18, jitRate: 6, vib: [4.6, 14], noise: 0.12,
        contour: [[0, 0.9], [0.15, 1.02], [0.8, 1.0], [1, 0.88]],
        formants: [[f0 * 3, 4, 1], [f0 * 5, 5, 0.75], [f0 * 7, 6, 0.4], [f0 * 11, 6, 0.15]],
        drive: 1.3, lp: 2200, att: 0.35, sustain: 0.85, rel: 0.6, level: k, gain: G.horn
      });
      this._breath(t, o.g, 0.3, 0.03 * k, false);
      o.g.gain.value = 0.9; this._done(o, end + 0.6);
    }

    /* Sauropodes : longue plainte grave, presque un chant de baleine. */
    _moan(t, o, v, k) {
      const dur = rr(3, 4.2) * (k < 1 ? 0.65 : 1), f0 = v.f0 * rr(0.92, 1.08);
      const end = this._voice(t, o.g, {
        f0, dur, sub: 0.45, noise: 0.25, noiseBuf: this.brown, jit: 35, jitRate: 4, vib: [3.2, 10],
        contour: [[0, 0.85], [0.4, 1.25], [0.75, 1.1], [1, 0.8]],
        rough: [rr(10, 14), 0.15],
        formants: [[130, 1.5, 1.2], [310, 2.5, 1], [640, 3, 0.45], [1200, 4, 0.15]],
        mouth: [[0, 0.85], [0.4, 1.15], [1, 0.9]],
        lp: 1100, att: 0.7, sustain: 0.7, rel: dur * 0.4, level: k, gain: G.moan
      });
      this._thump(t, o.g, f0 * 0.5, dur, 0.2 * k);
      o.g.gain.value = 1; this._done(o, end + dur * 0.4);
    }

    /* Herbivores trapus : ébrouement puis mugissement. */
    _bellow(t, o, v, k) {
      const dur = v.dur * rr(0.85, 1.2), f0 = v.f0 * rr(0.9, 1.1);
      this._snort(t, o.g, 0.18 * k);
      const end = this._voice(t + 0.28, o.g, {
        f0, dur, sub: 0.4, noise: 0.35, jit: 45, jitRate: 10,
        contour: [[0, 1.08], [0.3, 1.0], [1, 0.74]],
        rough: [rr(14, 22), 0.28],
        formants: [[260, 2, 1.2], [540, 3, 1.1], [1150, 4, 0.5], [2400, 5, 0.18]],
        mouth: [[0, 0.85], [0.3, 1.1], [1, 0.8]],
        drive: 1.6, lp: 2600, att: 0.06, sustain: 0.7, rel: dur * 0.5, level: k, gain: G.bellow
      });
      o.g.gain.value = 0.9; this._done(o, end + dur * 0.5);
    }

    /* Vélociraptor : cri strident (alerte) ou ronronnement crépitant + aboiements. */
    _raptor(t, o, v, k, big) {
      let end = t;
      if (big) {
        this._breath(t, o.g, 0.18, 0.08, true);
        end = this._voice(t + 0.18, o.g, {
          f0: v.f0 * rr(0.55, 0.65), dur: rr(0.7, 0.9), wave: 'reed', noise: 0.6, noiseBuf: this.white, jit: 90, jitRate: 24,
          contour: [[0, 0.9], [0.2, 1.35], [0.6, 1.2], [1, 0.75]],
          rough: [rr(45, 60), 0.4],
          formants: [[850, 3, 1], [1800, 4, 1], [3100, 5, 0.5], [4500, 6, 0.2]],
          mouth: [[0, 0.8], [0.2, 1.15], [1, 0.85]],
          drive: 2.6, lp: 7000, att: 0.03, sustain: 0.6, rel: 0.25, level: k, gain: G.raptor
        });
      } else {
        this._voice(t, o.g, {
          f0: rr(85, 110), dur: rr(0.4, 0.6), sub: 0.3, noise: 0.3, jit: 40, rough: [rr(26, 34), 0.85],
          formants: [[320, 2, 1], [850, 3, 0.7], [1900, 4, 0.25]], lp: 3000, att: 0.05, sustain: 0.8, rel: 0.15, level: 0.55 * k, gain: G.purr
        });
        const n = 1 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) {
          const st = t + 0.55 + i * rr(0.22, 0.32);
          end = this._voice(st, o.g, {
            f0: v.f0 * rr(0.5, 0.7), dur: rr(0.1, 0.18), wave: 'reed', noise: 0.5, noiseBuf: this.white, jit: 60, jitRate: 30,
            contour: [[0, 1.25], [0.3, 1.15], [1, 0.8]], rough: [rr(45, 65), 0.45],
            formants: [[900, 3, 1], [1900, 4, 0.9], [3200, 5, 0.4]], drive: 2.4, lp: 6500, att: 0.008, sustain: 0.7, rel: 0.08, level: 0.8 * k, gain: G.raptor
          });
        }
        if (R() < 0.5) this._clicks(t + 0.3, o.g, 3, 0.4 * k);
      }
      o.g.gain.value = 0.7; this._done(o, end + 0.4);
    }

    /* Dilophosaure : hululements chevrotants puis crépitement sifflant. */
    _hoot(t, o, v, k) {
      const c = this.ctx;
      let end = t;
      const n = 2 + (R() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.5, f = v.f0 * rr(0.9, 1.1) * (i ? 0.86 : 1);
        end = this._voice(st, o.g, {
          f0: f, dur: 0.38, wave: 'soft', noise: 0.04, jit: 20, vib: [7, 35],
          contour: [[0, 0.9], [0.5, 1.08], [1, 0.84]], rough: [36, 0.25],
          formants: [[f, 2, 1], [f * 2, 3, 0.35]], lp: 3000, att: 0.04, sustain: 0.7, rel: 0.18, level: 0.8 * k, gain: G.hoot
        });
      }
      const st = end + 0.15;
      const h = this._src(this.white, st, 0.9), hp = this._filter('highpass', 2500), am = c.createGain(); am.gain.value = 0.5;
      const l = this._osc('triangle', 32, st, 0.9), lg = c.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
      const hg = c.createGain(); h.connect(hp); hp.connect(am); am.connect(hg); hg.connect(o.g); this._env(hg.gain, st, 0.05, 0.2 * k, 0.3, 0.35);
      o.g.gain.value = 0.6; this._done(o, st + 0.9);
    }

    /* Compsognathus : pépiements rapides. */
    _chirp(t, o, v, k) {
      const c = this.ctx, n = 3 + Math.floor(R() * 4);
      let st = t;
      for (let i = 0; i < n; i++) {
        const f = v.f0 * rr(0.85, 1.2), d = rr(0.04, 0.08);
        const s = c.createOscillator(); s.setPeriodicWave(this.wv.soft);
        s.frequency.setValueAtTime(f * 0.9, st); s.frequency.exponentialRampToValueAtTime(f * rr(1.3, 1.6), st + d);
        const g = c.createGain(); s.connect(g); g.connect(o.g); s.start(st); s.stop(st + d + 0.08);
        g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(0.4 * k * G.chirp, st + 0.006); g.gain.setTargetAtTime(0.0001, st + d * 0.6, 0.015);
        st += d + rr(0.03, 0.07);
      }
      o.g.gain.value = 0.6; this._done(o, st);
    }

    /* Petits ornithopodes : couinements nasillards. */
    _squeak(t, o, v, k) {
      let end = t;
      const n = 2 + (R() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const st = t + i * rr(0.25, 0.35), f = v.f0 * rr(0.5, 0.62);
        end = this._voice(st, o.g, {
          f0: f, dur: rr(0.14, 0.22), wave: 'reed', noise: 0.15, noiseBuf: this.white, jit: 40, jitRate: 20,
          contour: [[0, 1.15], [0.35, 1.28], [1, 0.82]],
          formants: [[1000, 3, 1], [2200, 4, 0.6], [3500, 5, 0.2]], drive: 1.3, lp: 6000, att: 0.012, sustain: 0.7, rel: 0.07, level: 0.7 * k, gain: G.squeak
        });
      }
      o.g.gain.value = 0.6; this._done(o, end + 0.2);
    }

    /* Ptérosaures : cri rauque et perçant, comme un héron. */
    _screech(t, o, v, k) {
      let end = t;
      const n = 1 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.7, d = rr(0.45, 0.7), f = v.f0 * rr(0.45, 0.55);
        end = this._voice(st, o.g, {
          f0: f, dur: d, wave: 'reed', noise: 0.6, noiseBuf: this.white, jit: 80, jitRate: 22,
          contour: [[0, 0.9], [0.3, 1.2], [1, 0.7]], rough: [rr(55, 80), 0.45],
          formants: [[1200, 3, 1], [2400, 4, 0.9], [3700, 5, 0.4]],
          mouth: [[0, 0.85], [0.3, 1.1], [1, 0.9]], drive: 2.4, lp: 7500, att: 0.03, sustain: 0.6, rel: 0.15, level: 0.75 * k, gain: G.screech
        });
      }
      o.g.gain.value = 0.55; this._done(o, end + 0.3);
    }

    /* Plésiosaure : chant glissé et bulles. */
    _song(t, o, v, k) {
      const dur = rr(1.6, 2.4), f = v.f0 * rr(0.9, 1.1);
      const end = this._voice(t, o.g, {
        f0: f, dur, wave: 'soft', noise: 0.03, jit: 25, jitRate: 3, vib: [5.5, 18],
        contour: [[0, 1], [0.45, 1.45], [0.8, 1.2], [1, 1.02]],
        formants: [[f * 1.1, 1.2, 1], [f * 2.3, 1.8, 0.4]],
        mouth: [[0, 0.9], [0.45, 1.3], [1, 1]], lp: 1600, att: 0.25, sustain: 0.75, rel: 0.6, level: 0.8 * k, gain: G.song
      });
      this._bubbles(t + 0.2, o.g, 4, 300, 700, 0.05 * k, dur);
      o.g.gain.value = 0.8; this._done(o, end + 0.6);
    }

    /* Mosasaure : grondement sous l'eau et chapelet de bulles. */
    _deep(t, o, v, k) {
      const dur = rr(1.6, 2.2), f = v.f0 * rr(0.9, 1.1);
      const end = this._voice(t, o.g, {
        f0: f, dur, sub: 0.6, noise: 0.3, noiseBuf: this.brown, jit: 50, jitRate: 8,
        contour: [[0, 0.9], [0.4, 1.1], [1, 0.7]], rough: [rr(15, 19), 0.4],
        formants: [[150, 1.5, 1.2], [380, 2.5, 1], [800, 3, 0.4]], drive: 1.8, lp: 650, att: 0.2, sustain: 0.65, rel: 0.6, level: k, gain: G.deep
      });
      this._bubbles(t, o.g, 10, 180, 600, 0.08 * k, dur + 0.5);
      o.g.gain.value = 1; this._done(o, end + 0.8);
    }

    /* ------------------------------------------------------------------
       Ambiances continues
       ------------------------------------------------------------------ */
    _bed(buf, filters, gain) {
      const c = this.ctx, s = this._src(buf, c.currentTime);
      let n = s;
      for (const f of filters) { n.connect(f); n = f; }
      const g = c.createGain(); g.gain.value = gain || 0;
      n.connect(g); g.connect(this.ambBus);
      return g;
    }
    _beds() {
      const c = this.ctx;
      this.b = {};
      // vent (grave + sifflement)
      this.windLp = this._filter('lowpass', 420, 0.6);
      this.b.wind = this._bed(this.brown, [this.windLp], 0);
      this.whistleBp = this._filter('bandpass', 700, 10);
      this.b.whistle = this._bed(this.white, [this.whistleBp], 0);
      // feuillage
      this.b.leaves = this._bed(this.white, [this._filter('highpass', 2600, 0.5), this._filter('lowpass', 9000)], 0);
      // mer : houle + écume
      this.b.sea = this._bed(this.pink, [this._filter('lowpass', 850, 0.5)], 0);
      this.b.wash = this._bed(this.white, [this._filter('highpass', 1800), this._filter('lowpass', 7000)], 0);
      // rivière : glouglous (trois bandes mobiles)
      this.riverBands = [];
      const riverSum = c.createGain(); riverSum.gain.value = 0;
      riverSum.connect(this.ambBus);
      this.b.river = riverSum;
      for (let i = 0; i < 3; i++) {
        const s = this._src(this.white, c.currentTime), bp = this._filter('bandpass', 800 + i * 500, 4), g = c.createGain(); g.gain.value = 0.6;
        s.connect(bp); bp.connect(g); g.connect(riverSum);
        this.riverBands.push(bp);
      }
      // pluie : sifflement, médium, grondement
      this.b.rainHi = this._bed(this.white, [this._filter('highpass', 1400), this._filter('lowpass', 10000)], 0);
      this.b.rainMid = this._bed(this.pink, [this._filter('bandpass', 700, 0.5)], 0);
      this.b.rainLow = this._bed(this.brown, [this._filter('lowpass', 220)], 0);
      // cigales : bande étroite modulée en amplitude
      const cs = this._src(this.white, c.currentTime), cbp = this._filter('bandpass', 5200, 7), cam = c.createGain(); cam.gain.value = 0.5;
      const cl = c.createOscillator(); cl.type = 'square'; cl.frequency.value = 46; cl.start();
      const clg = c.createGain(); clg.gain.value = 0.5; cl.connect(clg); clg.connect(cam.gain);
      const cig = c.createGain(); cig.gain.value = 0;
      cs.connect(cbp); cbp.connect(cam); cam.connect(cig); cig.connect(this.ambBus);
      this.b.cicada = cig;
      this.gust = 1;
      this._nextGust = 0; this._nextWave = 0; this._nextCicada = 0;
    }

    /* ------------------------------------------------------------------
       Foule de visiteurs : murmure de fond + quelques voix proches
       (source glottale qui tremble, souffle, trois formants).
       ------------------------------------------------------------------ */
    _crowdInit() {
      const c = this.ctx, now = c.currentTime;
      this.crowdOut = c.createGain(); this.crowdOut.gain.value = 0;
      const hp = this._filter('highpass', 110), lp = this._filter('lowpass', 3600, 0.5);
      this.crowdOut.connect(hp); hp.connect(lp); lp.connect(this.ambBus);
      // murmure : des dizaines de voix lointaines confondues
      this.murmur = c.createGain(); this.murmur.gain.value = 0;
      const mam = c.createGain(); mam.gain.value = 0.65;
      const ml = this._src(this.brown, now), mll = this._filter('lowpass', 5), mlg = c.createGain(); mlg.gain.value = 0.9;
      ml.connect(mll); mll.connect(mlg); mlg.connect(mam.gain);
      const mn = this._src(this.pink, now);
      for (const [f, q, a] of [[480, 1.4, 1], [1050, 1.8, 0.55], [2500, 2.5, 0.2]]) {
        const bp = this._filter('bandpass', f, q), g = c.createGain(); g.gain.value = a;
        mn.connect(bp); bp.connect(g); g.connect(mam);
      }
      mam.connect(this.murmur); this.murmur.connect(this.crowdOut);
      // voix proches
      const jit = [0, 1].map(() => { const s = this._src(this.brown, now), l = this._filter('lowpass', 7), g = c.createGain(); g.gain.value = 140; s.connect(l); l.connect(g); return g; });
      const breath = this._src(this.pink, now);
      this.voices = [];
      const kinds = ['m', 'm', 'f', 'f', 'f', 'c', 'm', 'c'];
      for (let i = 0; i < kinds.length; i++) {
        const o = c.createOscillator(); o.setPeriodicWave(this.wv.glottal);
        const base = kinds[i] === 'm' ? rr(100, 135) : kinds[i] === 'f' ? rr(185, 235) : rr(260, 320);
        o.frequency.value = base; o.start();
        jit[i % 2].connect(o.detune);
        const vg = c.createGain(); vg.gain.value = 0;
        const bg = c.createGain(); bg.gain.value = 0.3; breath.connect(bg);
        const fs = [[700, 6, 1], [1200, 9, 0.55], [2600, 12, 0.18]].map(([f, q, a]) => {
          const bp = this._filter('bandpass', f, q), g = c.createGain(); g.gain.value = a;
          o.connect(bp); bg.connect(bp); bp.connect(g); g.connect(vg);
          return bp;
        });
        this._panTo(vg, rr(-0.8, 0.8), this.crowdOut);
        this.voices.push({ o, f1: fs[0], f2: fs[1], vg, base, kind: kinds[i], next: 0 });
      }
    }
    _crowdTick(now) {
      const dens = this.env.crowd;
      this.crowdOut.gain.setTargetAtTime(dens * 0.16, now, 0.6);
      this.murmur.gain.setTargetAtTime(Math.min(1, dens * 1.5) * 0.55, now, 1);
      if (dens < 0.02) return;
      const VOW = [[800, 1200], [400, 2300], [300, 2600], [480, 820], [330, 720], [650, 1700], [550, 1000]];
      for (const v of this.voices) {
        if (now < v.next) continue;
        // une phrase de 2 à 6 syllabes, intonation descendante, puis une pause
        const syl = 2 + Math.floor(R() * 5);
        let t = now + rr(0, 0.05);
        const k = v.kind === 'c' ? 1.2 : v.kind === 'f' ? 1.1 : 1;
        for (let i = 0; i < syl; i++) {
          const d = rr(0.08, 0.2), w = VOW[Math.floor(R() * VOW.length)];
          const p = v.base * rr(0.92, 1.15) * (1 - i / syl * 0.12);
          v.o.frequency.setTargetAtTime(p, t, 0.03);
          v.f1.frequency.setTargetAtTime(w[0] * k, t, 0.02);
          v.f2.frequency.setTargetAtTime(w[1] * k, t, 0.02);
          v.vg.gain.setTargetAtTime(rr(0.5, 1), t, 0.02);
          v.vg.gain.setTargetAtTime(0, t + d * 0.8, 0.025);
          t += d + rr(0.01, 0.06);
        }
        v.next = t + rr(0.3, 2.5) / Math.max(0.3, dens);
      }
      // rire d'enfant de temps en temps
      if (R() < 0.006 * dens) this._laugh(now);
    }
    /* Rire : des « ha » soufflés qui descendent. */
    _laugh(t) {
      const c = this.ctx, n = 4 + Math.floor(R() * 3);
      const out = c.createGain(); out.gain.value = 0.055 * this.env.crowd; this._panTo(out, rr(-0.7, 0.7));
      let st = t;
      for (let i = 0; i < n; i++) {
        const f = 430 - i * 15 + rr(-12, 12);
        const s = c.createOscillator(); s.setPeriodicWave(this.wv.glottal);
        s.frequency.setValueAtTime(f * 1.05, st); s.frequency.linearRampToValueAtTime(f * 0.92, st + 0.1); s.start(st); s.stop(st + 0.16);
        const h = c.createBufferSource(); h.buffer = this.pink; h.start(st, R() * 3, 0.16);
        const hg = c.createGain(); hg.gain.setValueAtTime(0.6, st); hg.gain.setTargetAtTime(0.12, st + 0.02, 0.02); h.connect(hg);
        const sum = c.createGain(); s.connect(sum); hg.connect(sum);
        const env = c.createGain();
        for (const [ff, q, a] of [[900, 5, 1], [1500, 7, 0.6], [3000, 9, 0.2]]) { const bp = this._filter('bandpass', ff, q), g = c.createGain(); g.gain.value = a; sum.connect(bp); bp.connect(g); g.connect(env); }
        env.connect(out);
        env.gain.setValueAtTime(0.0001, st); env.gain.linearRampToValueAtTime(1, st + 0.015); env.gain.setTargetAtTime(0.0001, st + 0.07, 0.025);
        st += rr(0.12, 0.16);
      }
    }
    /* Réaction de la foule : « Ooooh ! » (ou cris de peur). */
    crowdReact(kind) {
      if (!this.ready() || this.env.crowd < 0.05) return;
      if (!this._throttle('react', 4000)) return;
      const c = this.ctx, t = c.currentTime + 0.25;
      const scared = kind === 'peur';
      const out = c.createGain(); out.gain.value = 0.08 * Math.min(1, this.env.crowd * 2);
      out.connect(this.ambBus);
      const F = scared ? [[850, 5, 1], [1400, 7, 0.6], [2700, 9, 0.2]] : [[450, 5, 1], [800, 7, 0.55], [2600, 9, 0.12]];
      for (let i = 0; i < 12; i++) {
        const base = i % 3 === 0 ? rr(110, 140) : i % 3 === 1 ? rr(190, 240) : rr(270, 330);
        const st = t + rr(0, 0.3), dur = scared ? rr(0.6, 1.1) : rr(1.2, 1.9);
        const s = c.createOscillator(); s.setPeriodicWave(this.wv.glottal);
        s.frequency.setValueAtTime(base * (scared ? 1.6 : 0.95), st);
        s.frequency.linearRampToValueAtTime(base * (scared ? 1.9 : 1.15), st + dur * 0.35);
        s.frequency.linearRampToValueAtTime(base * (scared ? 1.4 : 0.85), st + dur);
        const l = this._osc('sine', rr(4.5, 6), st, dur + 0.3), lg = c.createGain(); lg.gain.value = rr(15, 30); l.connect(lg); lg.connect(s.detune);
        s.start(st); s.stop(st + dur + 0.3);
        const env = c.createGain();
        for (const [ff, q, a] of F) { const bp = this._filter('bandpass', ff * (i % 3 === 2 ? 1.15 : 1), q), g = c.createGain(); g.gain.value = a; s.connect(bp); bp.connect(g); g.connect(env); }
        this._panTo(env, rr(-0.85, 0.85), out);
        env.gain.setValueAtTime(0.0001, st); env.gain.linearRampToValueAtTime(1, st + dur * 0.3); env.gain.setValueAtTime(1, st + dur * 0.6); env.gain.linearRampToValueAtTime(0.0001, st + dur);
      }
    }

    /* ------------------------------------------------------------------
       Événements d'ambiance (toutes les 100 ms)
       ------------------------------------------------------------------ */
    setEnv(hour, storm) { this.env.hour = hour; this.env.storm = storm; }

    _tick() {
      if (!this.ctx) return;
      const c = this.ctx, now = c.currentTime, e = this.env;
      const h = e.hour, night = h > 20.2 || h < 6.3, dawn = h < 8, storm = e.storm;
      const near = U.clamp(1.4 - e.alt / 50, 0.15, 1); // proche du sol : plus de détails
      // vent et rafales
      if (now > this._nextGust) {
        this._nextGust = now + rr(1.2, 4);
        this.gust = rr(0.55, 1.35);
        this.windLp.frequency.setTargetAtTime(U.clamp(260 + this.gust * 380 + storm * 500 + e.alt * 4, 200, 1400), now, 1.2);
        this.whistleBp.frequency.setTargetAtTime(rr(500, 1300), now, 1.5);
      }
      // pas de vent permanent : il ne souffle que pendant l'orage
      this.b.wind.gain.setTargetAtTime(storm * 0.3 * this.gust, now, 0.8);
      this.b.whistle.gain.setTargetAtTime(storm * 0.015, now, 1);
      this.b.leaves.gain.setTargetAtTime((e.forest + e.jungle) * near * storm * 0.05 * this.gust, now, 0.5);
      // vagues
      if (e.sea > 0.01 && now > this._nextWave) {
        const p = rr(5.5, 9);
        this._nextWave = now + p;
        const g = this.b.sea.gain, w = this.b.wash.gain, lvl = e.sea * near * (0.35 + storm * 0.3);
        g.cancelScheduledValues(now); g.setTargetAtTime(lvl * 0.35, now, 0.5); g.setTargetAtTime(lvl, now + p * 0.25, 0.9); g.setTargetAtTime(lvl * 0.25, now + p * 0.5, 1.4);
        w.cancelScheduledValues(now); w.setTargetAtTime(0.0001, now, 0.4); w.setTargetAtTime(lvl * 0.22, now + p * 0.38, 0.25); w.setTargetAtTime(0.0001, now + p * 0.55, 1.2);
      }
      if (e.sea <= 0.01) { this.b.sea.gain.setTargetAtTime(0, now, 1); this.b.wash.gain.setTargetAtTime(0, now, 1); }
      // rivière
      this.b.river.gain.setTargetAtTime(e.fresh * near * 0.11, now, 0.6);
      if (e.fresh > 0.01) for (const bp of this.riverBands) bp.frequency.setTargetAtTime(rr(450, 2400), now, 0.05);
      // pluie
      // la pluie arrive par vagues, au rythme des rafales
      this.b.rainHi.gain.setTargetAtTime(storm * 0.16 * (0.75 + this.gust * 0.3), now, 0.8);
      this.b.rainMid.gain.setTargetAtTime(storm * 0.14 * (0.8 + this.gust * 0.2), now, 0.8);
      this.b.rainLow.gain.setTargetAtTime(storm * 0.18, now, 0.8);
      if (storm > 0.05) this._drops(now, storm);
      // cigales (journées chaudes, végétation)
      const hot = h > 10.5 && h < 18 ? 1 : 0;
      if (now > this._nextCicada) { this._nextCicada = now + rr(4, 10); this._cicadaLvl = rr(0.4, 1.2); }
      this.b.cicada.gain.setTargetAtTime(hot * (1 - storm) * (e.forest + e.jungle * 1.4) * near * 0.022 * (this._cicadaLvl || 1), now, 1.5);
      if (!this.muted) {
        if (night) {
          if (R() < 0.06 * near * (1 - storm)) this._cricket(now);
          if (e.fresh + e.sea * 0.3 > 0.05 && R() < 0.025 * near) this._frog(now);
          if (R() < 0.004 * (e.forest + e.jungle)) this._owl(now);
        } else if (storm < 0.3) {
          const veg = 0.25 + e.forest + e.jungle * 1.5;
          if (R() < 0.05 * near * veg * (dawn ? 2 : 1)) this._bird(now);
          if (e.jungle > 0.1 && R() < 0.008 * near * e.jungle) this._jungleCall(now);
          if (e.sea > 0.1 && R() < 0.01 * near) this._gull(now);
        }
        this._crowdTick(now);
      }
      if (this.music) this.music.tick();
    }

    _drops(now, storm) {
      const c = this.ctx, n = Math.floor(storm * 5 + R() * 2);
      for (let i = 0; i < n; i++) {
        const t = now + R() * 0.1, g = c.createGain();
        this._panTo(g, rr(-1, 1));
        if (R() < 0.3) { // goutte dans une flaque : petite bulle qui monte
          const f = rr(1400, 4200), o = this._osc('sine', f, t, 0.08);
          o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rr(1.4, 2), t + 0.04);
          o.connect(g);
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(rr(0.006, 0.025) * storm, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.004, 0.012);
        } else { // impact sur les feuilles, le toit, le sol
          const s = c.createBufferSource(); s.buffer = this.white; s.start(t, R() * 3, 0.04);
          const bp = this._filter('bandpass', rr(1800, 7000), rr(1.5, 5));
          s.connect(bp); bp.connect(g);
          this._env(g.gain, t, 0.001, rr(0.02, 0.08) * storm, 0.002, rr(0.015, 0.035));
        }
      }
    }

    _pan(node) { this._panTo(node, rr(-0.9, 0.9)); }
    _panTo(node, v, bus) {
      bus = bus || this.ambBus;
      if (!this.ctx.createStereoPanner) { node.connect(bus); return; }
      const p = this.ctx.createStereoPanner(); p.pan.value = v;
      node.connect(p); p.connect(bus);
    }

    /* Oiseaux : cinq chants, faits de notes glissées avec leur harmonique. */
    _bird(t) {
      const c = this.ctx, kind = Math.floor(R() * 5);
      const out = c.createGain(); out.gain.value = rr(0.3, 0.8); this._pan(out);
      const note = (st, f1, f2, d, a, harm, vib) => {
        const g = c.createGain();
        for (const [m, amp] of harm ? [[1, 1], [2, harm]] : [[1, 1]]) {
          const o = this._osc('sine', f1 * m, st, d + 0.02);
          o.frequency.setValueAtTime(f1 * m, st); o.frequency.exponentialRampToValueAtTime(f2 * m, st + d);
          if (vib) { const l = this._osc('sine', vib[0], st, d), lg = c.createGain(); lg.gain.value = vib[1] * m; l.connect(lg); lg.connect(o.frequency); }
          const ga = c.createGain(); ga.gain.value = amp; o.connect(ga); ga.connect(g);
        }
        g.connect(out);
        const at = Math.min(0.012, d * 0.25);
        g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(a, st + at); g.gain.setValueAtTime(a, st + Math.max(at + 0.002, d * 0.6)); g.gain.linearRampToValueAtTime(0.0001, st + d);
      };
      if (kind === 0) { // phrase flûtée variée (type merle)
        let st = t; const base = rr(1500, 2500), n = 4 + Math.floor(R() * 5);
        const steps = [1, 1.12, 1.26, 0.89, 1.5, 0.75, 1.33];
        for (let i = 0; i < n; i++) {
          const f = base * steps[Math.floor(R() * steps.length)], d = rr(0.07, 0.22);
          note(st, f * rr(0.92, 1.05), f * rr(0.88, 1.18), d, 0.028, 0.15, R() < 0.3 ? [rr(25, 40), f * 0.04] : null);
          st += d + rr(0.02, 0.08);
        }
      } else if (kind === 1) { // gazouillis rapide
        const base = rr(2600, 4400), n = 3 + Math.floor(R() * 6); let st = t;
        for (let i = 0; i < n; i++) { const d = rr(0.03, 0.07); note(st, base * rr(0.8, 1.05), base * rr(1.15, 1.6), d, 0.025, 0.08); st += d + rr(0.02, 0.06); }
      } else if (kind === 2) { // trille : deux hauteurs alternées très vite
        const a = rr(3200, 4800), b = a * rr(0.82, 0.9), n = 10 + Math.floor(R() * 14), rate = rr(0.045, 0.065);
        for (let i = 0; i < n; i++) { const f = i % 2 ? b : a; note(t + i * rate, f, f * 1.06, rate * 0.75, 0.018 * (1 - i / n * 0.5), 0.05); }
      } else if (kind === 3) { // tourterelle : trois roucoulements doux
        const f = rr(420, 520);
        for (const [dt, d, m] of [[0, 0.32, 0.9], [0.42, 0.55, 1.1], [1.05, 0.38, 0.85]]) note(t + dt, f * m, f * m * 0.94, d, 0.03, 0.25, [rr(5, 7), f * 0.02]);
      } else { // appel en deux notes descendantes répété (type mésange)
        const f = rr(3000, 4200), rep = 2 + Math.floor(R() * 3);
        for (let r = 0; r < rep; r++) { const st = t + r * 0.42; note(st, f, f * 0.97, 0.12, 0.025, 0.1); note(st + 0.16, f * 0.72, f * 0.7, 0.14, 0.022, 0.1); }
      }
    }

    _jungleCall(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.5, 1); this._pan(out);
      const n = 3 + Math.floor(R() * 4), base = rr(700, 1300);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.22, o = this._osc('sine', base, st, 0.25);
        o.frequency.setValueAtTime(base * 0.7, st); o.frequency.exponentialRampToValueAtTime(base * 1.4, st + 0.18);
        const m = this._osc('sine', base * 2.1, st, 0.25), mg = c.createGain(); mg.gain.value = base * 0.3; m.connect(mg); mg.connect(o.frequency);
        const g = c.createGain(); o.connect(g); g.connect(out); this._env(g.gain, st, 0.02, 0.035, 0.08, 0.12);
      }
    }
    _gull(t) { // mouette : cri rauque nasillard
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.4, 0.8); this._pan(out);
      for (let i = 0; i < 3; i++) {
        const st = t + i * rr(0.28, 0.36), f = rr(1100, 1500), d = rr(0.22, 0.3);
        const o = c.createOscillator(); o.setPeriodicWave(this.wv.reed);
        o.frequency.setValueAtTime(f * 1.25, st); o.frequency.exponentialRampToValueAtTime(f * 0.75, st + d); o.start(st); o.stop(st + d + 0.05);
        const am = c.createGain(); am.gain.value = 0.7; const l = this._osc('triangle', rr(50, 70), st, d), lg = c.createGain(); lg.gain.value = 0.3; l.connect(lg); lg.connect(am.gain);
        const b1 = this._filter('bandpass', 1900, 3), b2 = this._filter('bandpass', 3300, 4), g = c.createGain();
        o.connect(am); am.connect(b1); am.connect(b2); b1.connect(g); b2.connect(g); g.connect(out);
        this._env(g.gain, st, 0.015, 0.05, d * 0.4, d * 0.5);
      }
    }
    _cricket(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.3, 1); this._pan(out);
      const f = rr(4100, 4700), n = 3 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.06, g = c.createGain();
        for (const [m, a] of [[1, 1], [2, 0.12]]) { const o = this._osc('sine', f * m, st, 0.04), ga = c.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g); }
        g.connect(out); this._env(g.gain, st, 0.004, 0.016, 0.014, 0.018);
      }
    }
    _frog(t) { // coassement : gorge qui pulse vite
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.5, 1); this._pan(out);
      const n = 1 + Math.floor(R() * 3), f = rr(160, 260), pr = rr(25, 45);
      for (let i = 0; i < n; i++) {
        const st = t + i * rr(0.3, 0.45), d = rr(0.18, 0.3);
        const o = c.createOscillator(); o.setPeriodicWave(this.wv.glottal);
        o.frequency.setValueAtTime(f * 1.1, st); o.frequency.exponentialRampToValueAtTime(f * 0.85, st + d); o.start(st); o.stop(st + d + 0.05);
        const am = c.createGain(); am.gain.value = 0.5; const l = this._osc('triangle', pr, st, d), lg = c.createGain(); lg.gain.value = 0.5; l.connect(lg); lg.connect(am.gain);
        const b1 = this._filter('bandpass', rr(500, 800), 4), b2 = this._filter('bandpass', rr(1300, 1800), 6), g = c.createGain();
        o.connect(am); am.connect(b1); am.connect(b2); b1.connect(g); b2.connect(g); g.connect(out);
        this._env(g.gain, st, 0.02, 0.08, d * 0.6, 0.06);
      }
    }
    _owl(t) { // hibou : « hou… hou-hou » feutré
      const c = this.ctx, out = c.createGain(); out.gain.value = 0.6; this._pan(out);
      const f = rr(330, 380);
      for (const [dt, d, m] of [[0, 0.5, 1], [0.75, 0.22, 0.97], [1.05, 0.55, 0.94]]) {
        const st = t + dt, o = c.createOscillator(); o.setPeriodicWave(this.wv.soft);
        o.frequency.setValueAtTime(f * m * 1.02, st); o.frequency.linearRampToValueAtTime(f * m * 0.93, st + d); o.start(st); o.stop(st + d + 0.1);
        const n = this._src(this.pink, st, d + 0.1), nb = this._filter('bandpass', f * 2, 3), ng = c.createGain(); ng.gain.value = 0.15; n.connect(nb); nb.connect(ng);
        const g = c.createGain(); o.connect(g); ng.connect(g); g.connect(out);
        this._env(g.gain, st, Math.min(0.08, d * 0.3), 0.05, d * 0.4, d * 0.4);
      }
    }

    /* Tonnerre : crépitement (si l'éclair est proche), grondement roulant
       irrégulier et infrabasse, avec un écho prolongé. */
    thunder() {
      if (!this.ready()) return;
      const c = this.ctx, dist = R();
      const t = c.currentTime + 0.2 + dist * 2.5;
      const out = c.createGain(); out.gain.value = 0.7 * (1 - dist * 0.45);
      this._panTo(out, rr(-0.7, 0.7));
      const send = c.createGain(); send.gain.value = 0.6; out.connect(send); send.connect(this.reverb);
      if (dist < 0.55) {
        for (let i = 0; i < 8; i++) { // crépitement de l'arc
          const st = t + i * rr(0.008, 0.035), s = c.createBufferSource(); s.buffer = this.white; s.start(st, R() * 3, 0.04);
          const hp = this._filter('highpass', rr(1200, 3000)), g = c.createGain(); s.connect(hp); hp.connect(g); g.connect(out);
          this._env(g.gain, st, 0.001, 0.4 * (1 - i / 9), 0.004, 0.03);
        }
        const cr = this._src(this.white, t, 0.8), crl = this._filter('lowpass', 3000), cg = c.createGain();
        cr.connect(crl); crl.connect(cg); cg.connect(out); this._env(cg.gain, t, 0.003, 0.45, 0.02, 0.35);
      }
      const len = rr(4, 7), t1 = t + (dist < 0.55 ? 0.08 : 0);
      const n = this._src(this.brown, t1, len + 2.5), lp = this._filter('lowpass', 260, 0.8), g = c.createGain();
      const n2 = this._src(this.pink, t1, len + 1), lp2 = this._filter('lowpass', 700, 0.7), g2 = c.createGain();
      n.connect(lp); lp.connect(g); g.connect(out);
      n2.connect(lp2); lp2.connect(g2); g2.connect(out);
      for (const [gg, k] of [[g, 1.1], [g2, 0.3]]) {
        gg.gain.setValueAtTime(0.0001, t1);
        let tt = t1 + 0.04;
        for (let i = 0; i < 7; i++) {
          const pk = rr(0.4, 1) * (1 - i * 0.11) * k;
          gg.gain.exponentialRampToValueAtTime(Math.max(0.01, pk), tt + rr(0.05, 0.25));
          tt += rr(0.3, 0.9);
          gg.gain.exponentialRampToValueAtTime(Math.max(0.005, pk * 0.3), tt);
        }
        gg.gain.exponentialRampToValueAtTime(0.0001, tt + 2);
      }
      lp.frequency.setValueAtTime(dist < 0.55 ? 500 : 280, t1); lp.frequency.exponentialRampToValueAtTime(90, t1 + len + 1);
      lp2.frequency.setValueAtTime(1200, t1); lp2.frequency.exponentialRampToValueAtTime(200, t1 + len);
      const sub = this._osc('sine', rr(32, 45), t1, len + 1), sg = c.createGain();
      sub.connect(sg); sg.connect(out); this._env(sg.gain, t1, 0.3, 0.35, len * 0.3, len * 0.6);
    }

    /* ------------------------------------------------------------------
       Hélicoptères de livraison : rotor placé dans l'espace, suivi à
       chaque image ; il apparaît et s'éteint en fondu.
       ------------------------------------------------------------------ */
    heliSync(list) {
      if (!this.ctx) return;
      this.helis = this.helis || new Map();
      const c = this.ctx, now = c.currentTime, seen = new Set();
      for (const h of list) {
        seen.add(h.id);
        let v = this.helis.get(h.id);
        if (!v) { v = this._heliVoice(); this.helis.set(h.id, v); }
        const p = v.p;
        if (p.positionX) { p.positionX.setTargetAtTime(h.x, now, 0.05); p.positionY.setTargetAtTime(h.y, now, 0.05); p.positionZ.setTargetAtTime(h.z, now, 0.05); } else p.setPosition(h.x, h.y, h.z);
        const dist = Math.hypot(h.x - this.lis.x, h.y - this.lis.y, h.z - this.lis.z);
        v.lp.frequency.setTargetAtTime(U.clamp(16000 / (1 + dist * 0.07), 600, 16000), now, 0.15);
      }
      for (const [id, v] of this.helis) if (!seen.has(id)) {
        v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), now); v.g.gain.setTargetAtTime(0.0001, now, 0.5);
        for (const n of v.srcs) n.stop(now + 2.5);
        this.helis.delete(id);
      }
    }
    _heliVoice() {
      const c = this.ctx, now = c.currentTime;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.85, now + 2);
      const lp = this._filter('lowpass', 8000, 0.5);
      const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 9; p.rolloffFactor = 1; p.maxDistance = 600;
      g.connect(lp); lp.connect(p); p.connect(this.sfxBus);
      // battement des pales : impulsions à ~17 Hz qui modulent un souffle grave et un « thump »
      const lfo = c.createOscillator(); lfo.frequency.value = rr(16, 18.5);
      const pulse = c.createWaveShaper(), n = 256, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.pow(Math.max(0, x), 4); }
      pulse.curve = curve; lfo.connect(pulse);
      const am = c.createGain(); am.gain.value = 0.06; pulse.connect(am.gain);
      const nz = this._src(this.brown, now), nb = this._filter('bandpass', 320, 0.8), ng = c.createGain(); ng.gain.value = 1.4;
      nz.connect(nb); nb.connect(ng); ng.connect(am);
      const th = c.createOscillator(); th.frequency.value = 38; const tg = c.createGain(); tg.gain.value = 0.5; th.connect(tg); tg.connect(am);
      am.connect(g);
      // sifflement de la turbine
      const wh = c.createOscillator(); wh.type = 'sawtooth'; wh.frequency.value = rr(2100, 2400);
      const wb = this._filter('bandpass', 2300, 9), wg = c.createGain(); wg.gain.value = 0.012;
      wh.connect(wb); wb.connect(wg); wg.connect(g);
      lfo.start(now); th.start(now); wh.start(now);
      return { g, lp, p, srcs: [nz, lfo, th, wh] };
    }

    /* ------------------------------------------------------------------
       Analyse du lieu autour de la caméra (appelée ~3 fois par seconde)
       ------------------------------------------------------------------ */
    analyze(game, renderer) {
      if (!this.ctx || !game.s) return;
      const C = DZ.CONFIG, T = C.map.tile, W = C.map.w, H = C.map.h;
      let cx, cz, alt;
      if (renderer.is3D) { cx = renderer.cam.tx; cz = renderer.cam.tz; alt = renderer.eye[1]; }
      else { cx = renderer.cam.x / T; cz = renderer.cam.y / T; alt = 8 / renderer.cam.zoom; }
      const rad = 14;
      let n = 0, sea = 0, fresh = 0, forest = 0, jungle = 0, mount = 0;
      const B = DZ.BIOME;
      for (let y = Math.floor(cz - rad); y <= cz + rad; y += 2) for (let x = Math.floor(cx - rad); x <= cx + rad; x += 2) {
        n++;
        if (x < 0 || y < 0 || x >= W || y >= H) { // hors carte : comme la case du bord la plus proche
          const ei = U.clamp(y, 0, H - 1) * W + U.clamp(x, 0, W - 1);
          if (game.terrain[ei] === DZ.TER.WATER && game.biome && game.biome[ei] === B.SEA) sea++; else forest++;
          continue;
        }
        const i = y * W + x, b = game.biome ? game.biome[i] : 0, t = game.terrain[i];
        if (t === DZ.TER.WATER) { if (b === B.SEA) sea++; else fresh++; }
        else if (b === B.FOREST || b === B.HILLS) forest++;
        else if (b === B.JUNGLE) jungle++;
        else if (b === B.MOUNTAIN || t === DZ.TER.ROCK) mount++;
      }
      // foule proche
      let people = 0;
      for (const g of game.visitors) if (!g.hidden && Math.abs(g.x - cx) < 16 && Math.abs(g.y - cz) < 16) people += g.members.length;
      const zoomK = U.clamp(1.3 - alt / 35, 0, 1);
      const e = this.env;
      e.sea = Math.min(1, sea / n * 2.2); e.fresh = Math.min(1, fresh / n * 3.5);
      e.forest = forest / n; e.jungle = jungle / n; e.mountain = mount / n;
      e.alt = alt;
      e.hour = game.s.hour; e.storm = game.stormIntensity();
      e.wind = U.clamp(0.22 + alt / 120 + e.mountain * 0.5 + e.storm * 0.8, 0, 1.4);
      e.crowd = U.clamp(people / 70, 0, 1) * zoomK;
      // cris d'humeur des dinosaures proches
      if (game.speed > 0 && this.ready() && R() < 0.12) {
        const cand = game.dinos.filter((d) => Math.abs(d.x - cx) < 30 && Math.abs(d.y - cz) < 30);
        if (cand.length) {
          const d = cand[Math.floor(R() * cand.length)];
          const y = renderer.world ? renderer.world.heightAt(d.x, d.y) + 0.8 : 0.5;
          this.dino(d.sp, [d.x, y, d.y], false);
        }
      }
      if (this.music) this.music.setContext({ hour: e.hour, storm: e.storm });
    }

    /* ------------------------------------------------------------------
       Bruitages ponctuels (interface et jeu)
       ------------------------------------------------------------------ */
    play(name, opt) {
      if (!this.ready()) return;
      const c = this.ctx, t = c.currentTime + 0.005;
      const pos = opt && opt.pos;
      switch (name) {
        case 'roar': { // compatibilité : cri positionné
          if (opt && opt.sp) this.dino(opt.sp, pos || null, true);
          break;
        }
        case 'coin': {
          if (!this._throttle('coin', 140)) return;
          const o = this.out(pos || null, { range: 40, bus: pos ? this.sfxBus : this.uiBus, hrtf: false });
          if (!o) return;
          for (const [f, dt, a] of [[1568, 0, 0.12], [2093, 0.07, 0.1], [3136, 0.07, 0.04]]) {
            const s = this._osc('sine', f, t + dt, 0.6), m = this._osc('sine', f * 3.5, t + dt, 0.6), mg = c.createGain();
            mg.gain.setValueAtTime(f * 0.8, t + dt); mg.gain.exponentialRampToValueAtTime(1, t + dt + 0.3); m.connect(mg); mg.connect(s.frequency);
            const g = c.createGain(); s.connect(g); g.connect(o.g); this._env(g.gain, t + dt, 0.003, a, 0.01, 0.45);
          }
          o.g.gain.value = 0.8; setTimeout(o.end, 800);
          break;
        }
        case 'build': {
          const o = this.out(pos || null, { range: 60, bus: pos ? this.sfxBus : this.uiBus });
          if (!o) return;
          // poutres posées au sol
          const n = this._src(this.brown, t, 0.5), l = this._filter('lowpass', 300), g = c.createGain();
          n.connect(l); l.connect(g); g.connect(o.g); this._env(g.gain, t, 0.004, 0.8, 0.04, 0.3);
          // coups de maillet : modes de vibration d'une planche + choc
          for (let i = 0; i < 4; i++) {
            const st = t + 0.14 + i * rr(0.1, 0.15), f = rr(260, 420);
            for (const [r, a, d] of [[1, 1, 0.09], [2.57, 0.5, 0.05], [4.9, 0.25, 0.03], [7.3, 0.1, 0.02]]) {
              const s = this._osc('sine', f * r, st, d * 5), gg = c.createGain();
              s.connect(gg); gg.connect(o.g); gg.gain.setValueAtTime(0.0001, st); gg.gain.linearRampToValueAtTime(0.28 * a, st + 0.0015); gg.gain.setTargetAtTime(0.0001, st + 0.003, d / 3);
            }
            const k = this._src(this.white, st, 0.03), kb = this._filter('bandpass', 1800, 1.5), kg = c.createGain();
            k.connect(kb); kb.connect(kg); kg.connect(o.g); this._env(kg.gain, st, 0.001, 0.2, 0.002, 0.02);
          }
          o.g.gain.value = 0.36; setTimeout(o.end, 1300);
          break;
        }
        case 'upgrade': { // glissando de harpe
          const o = this.out(null, { bus: this.uiBus });
          [62, 65, 69, 72, 74, 77, 81, 84].forEach((m, i) => {
            const st = t + i * 0.045, f = mtof(m), s = this._osc('triangle', f, st, 1.4), s2 = this._osc('sine', f * 2, st, 1.4), g = c.createGain(), g2 = c.createGain();
            g2.gain.value = 0.3; s.connect(g); s2.connect(g2); g2.connect(g); g.connect(o.g); this._env(g.gain, st, 0.003, 0.09, 0.02, 1.1);
          });
          break;
        }
        case 'click': { // petit déclic boisé
          const o = this.out(null, { bus: this.uiBus });
          const k = c.createBufferSource(); k.buffer = this.white; k.start(t, R() * 3, 0.03);
          const kb = this._filter('bandpass', 3200, 2.5), kg = c.createGain(); k.connect(kb); kb.connect(kg); kg.connect(o.g); this._env(kg.gain, t, 0.001, 0.14, 0.002, 0.02);
          const s = this._osc('sine', 1100, t, 0.06), g = c.createGain();
          s.frequency.exponentialRampToValueAtTime(760, t + 0.03); s.connect(g); g.connect(o.g); this._env(g.gain, t, 0.001, 0.08, 0.003, 0.03);
          break;
        }
        case 'error': {
          const o = this.out(null, { bus: this.uiBus });
          for (const [f, dt] of [[330, 0], [262, 0.12]]) { const s = this._osc('triangle', f, t + dt, 0.3), g = c.createGain(); s.connect(g); g.connect(o.g); this._env(g.gain, t + dt, 0.005, 0.12, 0.04, 0.15); }
          break;
        }
        case 'notify': { // marimba douce
          const o = this.out(null, { bus: this.uiBus });
          for (const [m, dt] of [[76, 0], [83, 0.11]]) {
            const f = mtof(m), s = this._osc('sine', f, t + dt, 0.8), s2 = this._osc('sine', f * 4, t + dt, 0.3), g = c.createGain(), g2 = c.createGain();
            g2.gain.value = 0.2; s.connect(g); s2.connect(g2); g2.connect(g); g.connect(o.g); this._env(g.gain, t + dt, 0.003, 0.12, 0.01, 0.55);
          }
          break;
        }
        case 'thunder': this.thunder(); break;
        case 'hammer': { // un coup de maillet sur un chantier
          if (!this._throttle('hammer', 110)) return;
          const o = this.out(pos || null, { range: 45 });
          if (!o) return;
          const f = rr(280, 430);
          for (const [r, a, d] of [[1, 1, 0.08], [2.57, 0.45, 0.045], [4.9, 0.2, 0.025]]) {
            const s = this._osc('sine', f * r, t, d * 5), gg = c.createGain();
            s.connect(gg); gg.connect(o.g); gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(0.22 * a, t + 0.0015); gg.gain.setTargetAtTime(0.0001, t + 0.003, d / 3);
          }
          const k = this._src(this.white, t, 0.03), kb = this._filter('bandpass', 2000, 1.5), kg = c.createGain();
          k.connect(kb); kb.connect(kg); kg.connect(o.g); this._env(kg.gain, t, 0.001, 0.12, 0.002, 0.02);
          o.g.gain.value = 0.45; setTimeout(o.end, 700);
          break;
        }
        case 'splash': {
          if (!this._throttle('splash', 350)) return;
          const o = this.out(pos || null, { range: 50 });
          if (!o) return;
          // impact sourd, gerbe d'eau, puis gouttes qui retombent
          const th = this._src(this.brown, t, 0.3), tl = this._filter('lowpass', 260), tg = c.createGain();
          th.connect(tl); tl.connect(tg); tg.connect(o.g); this._env(tg.gain, t, 0.004, 0.6, 0.02, 0.15);
          const n = this._src(this.white, t, 1.1), bp = this._filter('bandpass', 900, 0.8), lp = this._filter('lowpass', 6000), g = c.createGain();
          bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.12); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.8);
          n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(o.g); this._env(g.gain, t, 0.01, 0.5, 0.06, 0.55);
          this._bubbles(t + 0.15, o.g, 9, 700, 2500, 0.06, 0.9);
          o.g.gain.value = 0.7; setTimeout(o.end, 1500);
          break;
        }
        case 'alarm': { // sirène du parc, à travers un haut-parleur
          const o = this.out(null, { bus: this.sfxBus });
          for (let i = 0; i < 6; i++) {
            const st = t + i * 0.55, s = c.createOscillator(); s.setPeriodicWave(this.wv.reed);
            s.frequency.setValueAtTime(560, st); s.frequency.linearRampToValueAtTime(900, st + 0.25); s.frequency.linearRampToValueAtTime(560, st + 0.5); s.start(st); s.stop(st + 0.55);
            const b1 = this._filter('peaking', 1100, 2), b2 = this._filter('peaking', 2600, 3); b1.gain.value = 8; b2.gain.value = 5;
            const hp = this._filter('highpass', 350), sh = this._shaper(1.5), lp = this._filter('lowpass', 3800), g = c.createGain();
            s.connect(hp); hp.connect(b1); b1.connect(b2); b2.connect(sh); sh.connect(lp); lp.connect(g); g.connect(o.g); this._env(g.gain, st, 0.02, 0.07, 0.35, 0.1);
          }
          this.crowdReact('peur');
          break;
        }
        default: break;
      }
    }
  }
  DZ.Sound = Sound;
  DZ.VOICE = VOICE;
})();
