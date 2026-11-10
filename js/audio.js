/* =====================================================================
   DinoZoo — Environnement sonore (Web Audio API, aucun fichier).
   - Mixage : bus musique / effets / ambiance / interface, réverbération
     de salle générée, compresseur final, volumes réglables.
   - Son 3D : chaque source (dinosaure, pas, foule) est placée dans
     l'espace (HRTF) par rapport à la caméra ; la distance atténue et
     assourdit.
   - Voix de dinosaures synthétisées par famille, pas lourds.
   - Ambiances mixées selon le lieu : vent, feuillage, vagues, rivière,
     pluie, tonnerre, oiseaux, cigales, grillons, grenouilles, foule.
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
       Voix de dinosaures
       ------------------------------------------------------------------ */
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

    _roar(t, o, v, len, k) {
      const c = this.ctx, dur = v.dur * len * rr(0.9, 1.1), f0 = v.f0 * rr(0.94, 1.06);
      const mix = c.createGain();
      // source tonale gutturale (glissement montant puis descendant + instabilité)
      const s1 = this._osc('sawtooth', f0, t, dur + 0.3);
      s1.frequency.setValueAtTime(f0 * 0.75, t);
      s1.frequency.linearRampToValueAtTime(f0 * 1.18, t + dur * 0.28);
      s1.frequency.linearRampToValueAtTime(f0 * 1.0, t + dur * 0.6);
      s1.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + dur);
      const j1 = this._osc('sine', 6.3, t, dur + 0.3), j1g = c.createGain(); j1g.gain.value = f0 * 0.05; j1.connect(j1g); j1g.connect(s1.frequency);
      const j2 = this._osc('sine', 2.1, t, dur + 0.3), j2g = c.createGain(); j2g.gain.value = f0 * 0.06; j2.connect(j2g); j2g.connect(s1.frequency);
      const s1g = c.createGain(); s1g.gain.value = 0.55; s1.connect(s1g); s1g.connect(mix);
      // sous-harmonique (infrabasse)
      const sub = this._osc('square', f0 / 2, t, dur + 0.3);
      sub.frequency.setValueAtTime(f0 * 0.38, t); sub.frequency.linearRampToValueAtTime(f0 * 0.58, t + dur * 0.3); sub.frequency.exponentialRampToValueAtTime(f0 * 0.3, t + dur);
      const subLp = this._filter('lowpass', 180, 0.7), subG = c.createGain(); subG.gain.value = 0.55 * v.sub;
      sub.connect(subLp); subLp.connect(subG); subG.connect(mix);
      // râle (souffle dans la gorge)
      const n = this._src(this.white, t, dur + 0.4), nb = this._filter('bandpass', 1100, 0.7), ng = c.createGain();
      nb.frequency.setValueAtTime(700, t); nb.frequency.linearRampToValueAtTime(1500, t + dur * 0.3); nb.frequency.linearRampToValueAtTime(600, t + dur);
      ng.gain.value = 0.9 * v.rasp; n.connect(nb); nb.connect(ng); ng.connect(mix);
      if (v.gurgle) { const gq = this._osc('sine', 9, t, dur), gg = c.createGain(); gg.gain.value = 400; gq.connect(gg); gg.connect(nb.frequency); }
      // grognement (trémolo)
      const trem = c.createGain(); trem.gain.value = 0.7;
      const tl = this._osc('sine', rr(19, 27), t, dur + 0.3), tlg = c.createGain(); tlg.gain.value = 0.32; tl.connect(tlg); tlg.connect(trem.gain);
      mix.connect(trem);
      // distorsion + formants de gueule
      const sh = this._shaper(2.4);
      const f1 = this._filter('peaking', 280, 1.2); f1.gain.value = 9;
      const f2 = this._filter('peaking', 760, 1.6); f2.gain.value = 7;
      const f3 = this._filter('peaking', 1900, 2); f3.gain.value = 4;
      f2.frequency.setValueAtTime(600, t); f2.frequency.linearRampToValueAtTime(950, t + dur * 0.35); f2.frequency.linearRampToValueAtTime(650, t + dur);
      const lp = this._filter('lowpass', v.bright, 0.6);
      const env = c.createGain();
      trem.connect(sh); sh.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(lp); lp.connect(env); env.connect(o.g);
      this._env(env.gain, t, 0.16, 0.9 * k, dur * 0.55, dur * 0.45 + 0.3);
      o.g.gain.value = 0.85;
      // expiration finale
      const b = this._src(this.brown, t + dur * 0.9, 0.9), bl = this._filter('lowpass', 500), bg = c.createGain();
      b.connect(bl); bl.connect(bg); bg.connect(o.g); this._env(bg.gain, t + dur * 0.9, 0.08, 0.5 * k, 0.1, 0.6);
      setTimeout(o.end, (dur + 1.4) * 1000);
    }

    _horn(t, o, v, k) {
      const c = this.ctx, dur = rr(2.0, 2.8) * (k < 1 ? 0.7 : 1), f0 = v.f0 * rr(0.95, 1.05);
      const s = this._osc('sawtooth', f0, t, dur + 0.6);
      s.frequency.setValueAtTime(f0 * 0.92, t); s.frequency.linearRampToValueAtTime(f0 * 1.03, t + 0.4); s.frequency.setValueAtTime(f0 * 1.03, t + dur * 0.75); s.frequency.linearRampToValueAtTime(f0 * 0.9, t + dur);
      const vib = this._osc('sine', 4.8, t, dur + 0.6), vg = c.createGain(); vg.gain.value = f0 * 0.012; vib.connect(vg); vg.connect(s.frequency);
      // résonance de la crête creuse : filtre en peigne (retard + rétroaction)
      const d = c.createDelay(0.05); d.delayTime.value = 1 / (f0 * 2.02);
      const fb = c.createGain(); fb.gain.value = 0.72;
      const inG = c.createGain(); inG.gain.value = 0.4;
      s.connect(inG); inG.connect(d); d.connect(fb); fb.connect(d);
      const bp = this._filter('bandpass', 380, 0.9), lp = this._filter('lowpass', 1600, 0.7), env = c.createGain();
      d.connect(bp); inG.connect(bp); bp.connect(lp); lp.connect(env); env.connect(o.g);
      this._env(env.gain, t, 0.35, 1.2 * k, dur * 0.6, dur * 0.4 + 0.4);
      o.g.gain.value = 0.9;
      setTimeout(o.end, (dur + 1.2) * 1000);
    }

    _moan(t, o, v, k) {
      const c = this.ctx, dur = rr(3, 4) * (k < 1 ? 0.7 : 1), f0 = v.f0 * rr(0.92, 1.08);
      const mix = c.createGain();
      [[1, 0.8, 'sine'], [2, 0.45, 'sine'], [3, 0.2, 'triangle'], [4.02, 0.08, 'sine']].forEach(([h, a, type]) => {
        const s = this._osc(type, f0 * h, t, dur + 0.5);
        s.frequency.setValueAtTime(f0 * h * 0.85, t); s.frequency.linearRampToValueAtTime(f0 * h * 1.25, t + dur * 0.4); s.frequency.exponentialRampToValueAtTime(f0 * h * 0.8, t + dur);
        const g = c.createGain(); g.gain.value = a; s.connect(g); g.connect(mix);
      });
      const n = this._src(this.brown, t, dur + 0.5), nl = this._filter('lowpass', 320), ng = c.createGain(); ng.gain.value = 0.35; n.connect(nl); nl.connect(ng); ng.connect(mix);
      const lp = this._filter('lowpass', 700, 0.8), env = c.createGain();
      mix.connect(lp); lp.connect(env); env.connect(o.g);
      this._env(env.gain, t, 0.7, 1.0 * k, dur * 0.4, dur * 0.6);
      o.g.gain.value = 1;
      setTimeout(o.end, (dur + 1) * 1000);
    }

    _bellow(t, o, v, k) {
      const c = this.ctx, dur = v.dur * rr(0.85, 1.2), f0 = v.f0 * rr(0.9, 1.1);
      // ébrouement initial
      const sn = this._src(this.white, t, 0.3), snb = this._filter('bandpass', 900, 1), sng = c.createGain();
      sn.connect(snb); snb.connect(sng); sng.connect(o.g); this._env(sng.gain, t, 0.01, 0.6 * k, 0.05, 0.18);
      // mugissement
      const s = this._osc('sawtooth', f0, t + 0.15, dur + 0.3);
      s.frequency.setValueAtTime(f0 * 1.1, t + 0.15); s.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.15 + dur);
      const tr = this._osc('sine', 14, t + 0.15, dur), trg = c.createGain(); trg.gain.value = f0 * 0.04; tr.connect(trg); trg.connect(s.frequency);
      const f1 = this._filter('bandpass', 480, 2), f2 = this._filter('bandpass', 950, 3), sum = c.createGain();
      s.connect(f1); s.connect(f2); f1.connect(sum); f2.connect(sum);
      const sh = this._shaper(1.6), env = c.createGain();
      sum.connect(sh); sh.connect(env); env.connect(o.g);
      this._env(env.gain, t + 0.15, 0.08, 1.4 * k, dur * 0.4, dur * 0.6);
      o.g.gain.value = 0.9;
      setTimeout(o.end, (dur + 1) * 1000);
    }

    _raptor(t, o, v, k, big) {
      const c = this.ctx;
      const n = big ? 1 : 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const st = t + i * rr(0.18, 0.28);
        const long = big && i === 0;
        const dur = long ? 0.8 : rr(0.12, 0.2), f = v.f0 * rr(0.85, 1.25) * (long ? 1.5 : 1);
        const s = this._osc('sawtooth', f, st, dur + 0.05);
        s.frequency.setValueAtTime(f * (long ? 1 : 1.25), st); s.frequency.exponentialRampToValueAtTime(f * (long ? 0.7 : 0.75), st + dur);
        const m = this._osc('sine', f * 1.48, st, dur + 0.05), mg = c.createGain(); mg.gain.value = f * (long ? 0.8 : 0.5); m.connect(mg); mg.connect(s.frequency);
        if (long) { const vib = this._osc('sine', 13, st, dur), vg = c.createGain(); vg.gain.value = f * 0.06; vib.connect(vg); vg.connect(s.frequency); }
        const bp = this._filter('bandpass', 1700, 1.4), env = c.createGain();
        s.connect(bp); bp.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.012, 0.9 * k, dur * 0.3, dur * 0.7);
        const h = this._src(this.white, st, dur + 0.05), hp = this._filter('highpass', 3200), hg = c.createGain();
        h.connect(hp); hp.connect(hg); hg.connect(o.g); this._env(hg.gain, st, 0.01, 0.18 * k, dur * 0.3, dur * 0.6);
      }
      o.g.gain.value = 0.7;
      setTimeout(o.end, 1600);
    }

    _hoot(t, o, v, k) {
      const c = this.ctx;
      for (let i = 0; i < 2; i++) {
        const st = t + i * 0.55, dur = 0.45, f = v.f0 * rr(0.9, 1.1) * (i ? 0.85 : 1);
        const s = this._osc('sine', f, st, dur + 0.1);
        s.frequency.setValueAtTime(f * 0.9, st); s.frequency.linearRampToValueAtTime(f * 1.1, st + dur * 0.5); s.frequency.linearRampToValueAtTime(f * 0.85, st + dur);
        const am = c.createGain(); am.gain.value = 0.6;
        const rt = this._osc('square', 36, st, dur), rtg = c.createGain(); rtg.gain.value = 0.4; rt.connect(rtg); rtg.connect(am.gain);
        const env = c.createGain();
        s.connect(am); am.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.04, 0.8 * k, dur * 0.4, dur * 0.5);
      }
      const h = this._src(this.white, t + 1.1, 0.8), hp = this._filter('highpass', 2500), hg = c.createGain();
      h.connect(hp); hp.connect(hg); hg.connect(o.g); this._env(hg.gain, t + 1.1, 0.05, 0.3 * k, 0.3, 0.4);
      o.g.gain.value = 0.6;
      setTimeout(o.end, 2200);
    }

    _chirp(t, o, v, k) {
      const c = this.ctx, n = 3 + Math.floor(R() * 4);
      for (let i = 0; i < n; i++) {
        const st = t + i * rr(0.07, 0.11), f = v.f0 * rr(0.85, 1.2);
        const s = this._osc('sine', f, st, 0.08);
        s.frequency.setValueAtTime(f, st); s.frequency.exponentialRampToValueAtTime(f * 1.45, st + 0.05);
        const env = c.createGain(); s.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.005, 0.45 * k, 0.02, 0.045);
      }
      o.g.gain.value = 0.7;
      setTimeout(o.end, 1000);
    }

    _squeak(t, o, v, k) {
      const c = this.ctx;
      for (let i = 0; i < 2; i++) {
        const st = t + i * 0.3, f = v.f0 * rr(0.9, 1.15), dur = 0.22;
        const s = this._osc('square', f, st, dur + 0.05);
        s.frequency.setValueAtTime(f * 1.15, st); s.frequency.exponentialRampToValueAtTime(f * 0.8, st + dur);
        const bp = this._filter('bandpass', 1500, 2.5), env = c.createGain();
        s.connect(bp); bp.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.015, 0.7 * k, dur * 0.3, dur * 0.6);
      }
      o.g.gain.value = 0.6;
      setTimeout(o.end, 1100);
    }

    _screech(t, o, v, k) {
      const c = this.ctx, n = 1 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.7, dur = rr(0.45, 0.7), f = v.f0 * rr(0.9, 1.1);
        const s = this._osc('sawtooth', f, st, dur + 0.05);
        s.frequency.setValueAtTime(f * 0.9, st); s.frequency.linearRampToValueAtTime(f * 1.2, st + dur * 0.3); s.frequency.exponentialRampToValueAtTime(f * 0.7, st + dur);
        const vib = this._osc('sine', 16, st, dur), vg = c.createGain(); vg.gain.value = f * 0.05; vib.connect(vg); vg.connect(s.frequency);
        const nz = this._src(this.white, st, dur), nb = this._filter('bandpass', 2600, 1.2), ngn = c.createGain(); ngn.gain.value = 0.5;
        nz.connect(nb); nb.connect(ngn);
        const bp = this._filter('bandpass', 2000, 1.1), sum = c.createGain(), sh = this._shaper(2), env = c.createGain();
        s.connect(bp); bp.connect(sum); ngn.connect(sum); sum.connect(sh); sh.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.03, 0.7 * k, dur * 0.4, dur * 0.5);
      }
      o.g.gain.value = 0.55;
      setTimeout(o.end, 2000);
    }

    _song(t, o, v, k) {
      const c = this.ctx, dur = rr(1.6, 2.4), f = v.f0 * rr(0.9, 1.1);
      const s = this._osc('sine', f, t, dur + 0.3);
      s.frequency.setValueAtTime(f, t); s.frequency.linearRampToValueAtTime(f * 1.45, t + dur * 0.45); s.frequency.exponentialRampToValueAtTime(f * 1.05, t + dur);
      const vib = this._osc('sine', 5.5, t, dur + 0.3), vg = c.createGain(); vg.gain.value = f * 0.02; vib.connect(vg); vg.connect(s.frequency);
      const s2 = this._osc('sine', f * 2.01, t, dur + 0.3), g2 = c.createGain(); g2.gain.value = 0.25; s2.connect(g2);
      const lp = this._filter('lowpass', 1400), env = c.createGain();
      s.connect(lp); g2.connect(lp); lp.connect(env); env.connect(o.g);
      this._env(env.gain, t, 0.25, 0.7 * k, dur * 0.5, dur * 0.5);
      o.g.gain.value = 0.8;
      setTimeout(o.end, (dur + 1) * 1000);
    }

    _deep(t, o, v, k) {
      const c = this.ctx, dur = rr(1.6, 2.2), f = v.f0 * rr(0.9, 1.1);
      const s = this._osc('sawtooth', f, t, dur + 0.3);
      s.frequency.setValueAtTime(f * 0.9, t); s.frequency.linearRampToValueAtTime(f * 1.1, t + dur * 0.4); s.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur);
      const trem = c.createGain(); trem.gain.value = 0.6;
      const tl = this._osc('sine', 17, t, dur + 0.3), tg = c.createGain(); tg.gain.value = 0.35; tl.connect(tg); tg.connect(trem.gain);
      s.connect(trem);
      // bulles sous l'eau
      const b = this._src(this.white, t, dur), bb = this._filter('bandpass', 400, 4), bg = c.createGain(); bg.gain.value = 0.5;
      const bm = this._osc('sine', 7, t, dur), bmg = c.createGain(); bmg.gain.value = 300; bm.connect(bmg); bmg.connect(bb.frequency);
      b.connect(bb); bb.connect(bg);
      const lp = this._filter('lowpass', 420, 1), env = c.createGain();
      trem.connect(lp); bg.connect(lp); lp.connect(env); env.connect(o.g);
      this._env(env.gain, t, 0.2, 1.1 * k, dur * 0.4, dur * 0.6);
      o.g.gain.value = 1;
      setTimeout(o.end, (dur + 1) * 1000);
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
       Foule de visiteurs : brouhaha de voix synthétiques
       ------------------------------------------------------------------ */
    _crowdInit() {
      const c = this.ctx;
      this.crowdOut = c.createGain(); this.crowdOut.gain.value = 0;
      const lp = this._filter('lowpass', 3200, 0.5);
      this.crowdOut.connect(lp); lp.connect(this.ambBus);
      this.voices = [];
      const kinds = ['m', 'm', 'f', 'f', 'f', 'c', 'm', 'c'];
      for (let i = 0; i < kinds.length; i++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const base = kinds[i] === 'm' ? rr(100, 135) : kinds[i] === 'f' ? rr(185, 235) : rr(260, 320);
        o.frequency.value = base; o.start();
        const f1 = this._filter('bandpass', 700, 6), f2 = this._filter('bandpass', 1200, 9);
        const g1 = c.createGain(), g2 = c.createGain(); g1.gain.value = 1; g2.gain.value = 0.55;
        const vg = c.createGain(); vg.gain.value = 0;
        const pan = c.createStereoPanner ? c.createStereoPanner() : null;
        o.connect(f1); o.connect(f2); f1.connect(g1); f2.connect(g2); g1.connect(vg); g2.connect(vg);
        if (pan) { pan.pan.value = rr(-0.8, 0.8); vg.connect(pan); pan.connect(this.crowdOut); } else vg.connect(this.crowdOut);
        this.voices.push({ o, f1, f2, vg, base, kind: kinds[i], next: 0 });
      }
    }
    _crowdTick(now) {
      const dens = this.env.crowd;
      this.crowdOut.gain.setTargetAtTime(dens * 0.16, now, 0.6);
      if (dens < 0.02) return;
      const VOW = [[800, 1200], [400, 2300], [300, 2600], [480, 820], [330, 720], [650, 1700], [550, 1000]];
      for (const v of this.voices) {
        if (now < v.next) continue;
        // une phrase de 2 à 6 syllabes, puis une pause
        const syl = 2 + Math.floor(R() * 5);
        let t = now + rr(0, 0.05);
        for (let i = 0; i < syl; i++) {
          const d = rr(0.08, 0.2), w = VOW[Math.floor(R() * VOW.length)];
          const p = v.base * rr(0.9, 1.2) * (i === syl - 1 ? 0.88 : 1);
          v.o.frequency.setTargetAtTime(p, t, 0.02);
          v.f1.frequency.setTargetAtTime(w[0] * (v.kind === 'c' ? 1.2 : v.kind === 'f' ? 1.1 : 1), t, 0.015);
          v.f2.frequency.setTargetAtTime(w[1] * (v.kind === 'c' ? 1.2 : v.kind === 'f' ? 1.1 : 1), t, 0.015);
          v.vg.gain.setTargetAtTime(rr(0.5, 1), t, 0.015);
          v.vg.gain.setTargetAtTime(0, t + d * 0.8, 0.02);
          t += d + rr(0.01, 0.06);
        }
        v.next = t + rr(0.3, 2.5) / Math.max(0.3, dens);
      }
      // rire d'enfant de temps en temps
      if (R() < 0.006 * dens) this._laugh(now);
    }
    _laugh(t) {
      const c = this.ctx, n = 4 + Math.floor(R() * 3);
      const o = this.out(null, { bus: this.ambBus });
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.13, f = 420 - i * 18 + rr(-10, 10);
        const s = this._osc('sawtooth', f, st, 0.12);
        const f1 = this._filter('bandpass', 950, 5), f2 = this._filter('bandpass', 1500, 7), sum = c.createGain(), env = c.createGain();
        s.connect(f1); s.connect(f2); f1.connect(sum); f2.connect(sum); sum.connect(env); env.connect(o.g);
        this._env(env.gain, st, 0.01, 0.12 * this.env.crowd, 0.03, 0.07);
      }
      o.g.gain.value = 1;
    }
    /* Réaction de la foule : « Ooooh ! » (ou cris de peur). */
    crowdReact(kind) {
      if (!this.ready() || this.env.crowd < 0.05) return;
      if (!this._throttle('react', 4000)) return;
      const c = this.ctx, t = c.currentTime + 0.25;
      const o = this.out(null, { bus: this.ambBus });
      const scared = kind === 'peur';
      for (let i = 0; i < 9; i++) {
        const base = i % 3 === 0 ? rr(110, 140) : i % 3 === 1 ? rr(190, 240) : rr(270, 330);
        const st = t + rr(0, 0.25), dur = scared ? rr(0.6, 1.1) : rr(1.2, 1.8);
        const s = this._osc('sawtooth', base, st, dur + 0.2);
        s.frequency.setValueAtTime(base * (scared ? 1.6 : 0.95), st);
        s.frequency.linearRampToValueAtTime(base * (scared ? 1.9 : 1.15), st + dur * 0.35);
        s.frequency.linearRampToValueAtTime(base * (scared ? 1.4 : 0.85), st + dur);
        const vow = scared ? [850, 1400] : [450, 800];
        const f1 = this._filter('bandpass', vow[0], 5), f2 = this._filter('bandpass', vow[1], 7), sum = c.createGain(), env = c.createGain();
        s.connect(f1); s.connect(f2); f1.connect(sum); f2.connect(sum); sum.connect(env); env.connect(o.g);
        this._env(env.gain, st, dur * 0.3, 0.09 * Math.min(1, this.env.crowd * 2), dur * 0.3, dur * 0.4);
      }
      o.g.gain.value = 1;
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
      this.b.rainHi.gain.setTargetAtTime(storm * 0.16, now, 0.8);
      this.b.rainMid.gain.setTargetAtTime(storm * 0.14, now, 0.8);
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
      const c = this.ctx, n = Math.floor(storm * 6 + R() * 2);
      for (let i = 0; i < n; i++) {
        const t = now + R() * 0.1;
        const s = c.createBufferSource(); s.buffer = this.white; s.start(t, R() * 3, 0.03);
        const bp = this._filter('bandpass', rr(2500, 7500), rr(2, 6)), g = c.createGain();
        const pan = c.createStereoPanner ? c.createStereoPanner() : null;
        s.connect(bp); bp.connect(g);
        if (pan) { pan.pan.value = rr(-1, 1); g.connect(pan); pan.connect(this.ambBus); } else g.connect(this.ambBus);
        this._env(g.gain, t, 0.001, rr(0.02, 0.09) * storm, 0.002, 0.025);
      }
    }

    _pan(node) {
      if (!this.ctx.createStereoPanner) { node.connect(this.ambBus); return; }
      const p = this.ctx.createStereoPanner(); p.pan.value = rr(-0.9, 0.9);
      node.connect(p); p.connect(this.ambBus);
    }

    _bird(t) {
      const c = this.ctx, kind = Math.floor(R() * 4);
      const out = c.createGain(); out.gain.value = rr(0.4, 1); this._pan(out);
      if (kind === 0) { // gazouillis
        const base = rr(2200, 4200), n = 2 + Math.floor(R() * 5);
        for (let i = 0; i < n; i++) {
          const st = t + i * rr(0.08, 0.16), o = this._osc('sine', base, st, 0.12), g = c.createGain();
          o.frequency.setValueAtTime(base * rr(0.85, 1.1), st); o.frequency.exponentialRampToValueAtTime(base * rr(1.15, 1.5), st + 0.07);
          o.connect(g); g.connect(out); this._env(g.gain, st, 0.008, 0.03, 0.02, 0.07);
        }
      } else if (kind === 1) { // trille
        const base = rr(3000, 5000), st = t, dur = rr(0.6, 1.2), o = this._osc('sine', base, st, dur), am = c.createGain();
        const lfo = this._osc('sine', rr(18, 30), st, dur), lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5;
        const g = c.createGain(); o.connect(am); am.connect(g); g.connect(out); this._env(g.gain, st, 0.05, 0.02, dur * 0.6, dur * 0.3);
      } else if (kind === 2) { // roucoulement
        for (let i = 0; i < 3; i++) {
          const st = t + i * 0.45, f = rr(380, 460), o = this._osc('sine', f, st, 0.4), g = c.createGain();
          const v = this._osc('sine', 6, st, 0.4), vg = c.createGain(); vg.gain.value = 12; v.connect(vg); vg.connect(o.frequency);
          o.connect(g); g.connect(out); this._env(g.gain, st, 0.06, 0.035, 0.12, 0.2);
        }
      } else { // appel sifflé à deux notes
        const f = rr(1800, 2800);
        for (let i = 0; i < 2; i++) {
          const st = t + i * 0.3, o = this._osc('sine', i ? f * 0.8 : f, st, 0.25), g = c.createGain();
          o.connect(g); g.connect(out); this._env(g.gain, st, 0.02, 0.03, 0.1, 0.12);
        }
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
    _gull(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.4, 0.8); this._pan(out);
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.32, f = rr(1300, 1700), o = this._osc('sawtooth', f, st, 0.3);
        o.frequency.setValueAtTime(f * 1.2, st); o.frequency.exponentialRampToValueAtTime(f * 0.75, st + 0.28);
        const bp = this._filter('bandpass', 2200, 3), g = c.createGain(); o.connect(bp); bp.connect(g); g.connect(out); this._env(g.gain, st, 0.02, 0.03, 0.08, 0.15);
      }
    }
    _cricket(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.3, 1); this._pan(out);
      const f = rr(4100, 4700);
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.065, o = this._osc('triangle', f, st, 0.05), g = c.createGain();
        o.connect(g); g.connect(out); this._env(g.gain, st, 0.004, 0.018, 0.015, 0.025);
      }
    }
    _frog(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = rr(0.5, 1); this._pan(out);
      const n = 1 + Math.floor(R() * 3), f = rr(140, 220);
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.28, o = this._osc('square', f, st, 0.22);
        o.frequency.setValueAtTime(f * 1.2, st); o.frequency.exponentialRampToValueAtTime(f * 0.75, st + 0.18);
        const lp = this._filter('lowpass', 700, 3), g = c.createGain(); o.connect(lp); lp.connect(g); g.connect(out); this._env(g.gain, st, 0.02, 0.045, 0.05, 0.14);
      }
    }
    _owl(t) {
      const c = this.ctx, out = c.createGain(); out.gain.value = 0.6; this._pan(out);
      for (let i = 0; i < 2; i++) {
        const st = t + i * 0.6, f = rr(340, 380), o = this._osc('sine', f, st, 0.55), g = c.createGain();
        o.frequency.setValueAtTime(f, st); o.frequency.linearRampToValueAtTime(f * 0.92, st + 0.5);
        o.connect(g); g.connect(out); this._env(g.gain, st, 0.08, 0.05, 0.15, 0.3);
      }
    }

    /* Tonnerre roulant : claquement puis grondement irrégulier. */
    thunder() {
      if (!this.ready()) return;
      const c = this.ctx, t = c.currentTime + rr(0.2, 1.5);
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const out = c.createGain(); out.gain.value = 1;
      if (pan) { pan.pan.value = rr(-0.7, 0.7); out.connect(pan); pan.connect(this.ambBus); } else out.connect(this.ambBus);
      const cr = this._src(this.white, t, 0.4), crh = this._filter('highpass', 900), crg = c.createGain();
      cr.connect(crh); crh.connect(crg); crg.connect(out); this._env(crg.gain, t, 0.005, 0.35, 0.03, 0.3);
      const n = this._src(this.brown, t, 6), lp = this._filter('lowpass', 180, 0.8), g = c.createGain();
      n.connect(lp); lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      let tt = t + 0.05;
      for (let i = 0; i < 6; i++) { const pk = rr(0.4, 1.1) * (1 - i * 0.12); g.gain.exponentialRampToValueAtTime(Math.max(0.01, pk), tt + rr(0.05, 0.2)); tt += rr(0.3, 0.9); g.gain.exponentialRampToValueAtTime(Math.max(0.01, pk * 0.35), tt); }
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 2);
      lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(120, tt + 1);
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
        if (x < 0 || y < 0 || x >= W || y >= H) { if (x >= W) sea++; else forest++; continue; }
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
          const n = this._src(this.brown, t, 0.4), l = this._filter('lowpass', 420), g = c.createGain();
          n.connect(l); l.connect(g); g.connect(o.g); this._env(g.gain, t, 0.004, 0.7, 0.05, 0.25);
          for (let i = 0; i < 4; i++) {
            const st = t + 0.12 + i * rr(0.09, 0.14), f = rr(380, 620);
            const s = this._osc('triangle', f, st, 0.12), bp = this._filter('bandpass', f * 2.2, 4), gg = c.createGain();
            s.connect(bp); bp.connect(gg); gg.connect(o.g); this._env(gg.gain, st, 0.002, 0.35, 0.005, 0.07);
            const k = this._src(this.white, st, 0.05), kb = this._filter('bandpass', 2500, 2), kg = c.createGain();
            k.connect(kb); kb.connect(kg); kg.connect(o.g); this._env(kg.gain, st, 0.001, 0.15, 0.002, 0.03);
          }
          o.g.gain.value = 0.8; setTimeout(o.end, 1000);
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
        case 'click': {
          const o = this.out(null, { bus: this.uiBus });
          const s = this._osc('sine', 1200, t, 0.06), g = c.createGain();
          s.frequency.exponentialRampToValueAtTime(700, t + 0.04); s.connect(g); g.connect(o.g); this._env(g.gain, t, 0.002, 0.08, 0.005, 0.04);
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
        case 'splash': {
          if (!this._throttle('splash', 350)) return;
          const o = this.out(pos || null, { range: 50 });
          if (!o) return;
          const n = this._src(this.white, t, 0.9), bp = this._filter('bandpass', 1100, 0.7), g = c.createGain();
          bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
          n.connect(bp); bp.connect(g); g.connect(o.g); this._env(g.gain, t, 0.01, 0.6, 0.05, 0.6);
          o.g.gain.value = 1; setTimeout(o.end, 1100);
          break;
        }
        case 'alarm': {
          const o = this.out(null, { bus: this.sfxBus });
          for (let i = 0; i < 6; i++) {
            const st = t + i * 0.55, s = this._osc('sawtooth', 620, st, 0.5);
            s.frequency.setValueAtTime(620, st); s.frequency.linearRampToValueAtTime(980, st + 0.25); s.frequency.linearRampToValueAtTime(620, st + 0.5);
            const lp = this._filter('lowpass', 2200), g = c.createGain(); s.connect(lp); lp.connect(g); g.connect(o.g); this._env(g.gain, st, 0.02, 0.09, 0.35, 0.1);
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
