/* =====================================================================
   DinoZoo — Musique d'ambiance orchestrale générée en temps réel.
   Six thèmes originaux (aucune mélodie existante n'est reprise),
   d'esprit « grand film d'aventure » : cors majestueux, cordes
   amples, timbales, chœur, harpe, célesta, flûte.
   Un orchestre de synthèse joue des partitions écrites ici
   (mélodies + grilles d'accords) que l'arrangeur orchestre selon le
   style du thème. Le chef choisit le thème selon le moment : matin,
   journée, nuit, orage ou alerte, et joue un court thème
   « émerveillement » lors des grandes nouveautés.
   ===================================================================== */
window.DZ = window.DZ || {};
(function () {
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* « Bb4 » → 70 */
  function midi(n) {
    const m = n.match(/^([A-G])([#b]?)(-?\d)$/);
    if (!m) return null;
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  /* Mélodie : « Bb4:2 D5:1 r:1 | ... » → [{b, m, d}] */
  function melody(str) {
    const out = [];
    let b = 0;
    for (const tok of str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
      const [n, d] = tok.split(':');
      const dur = parseFloat(d || '1');
      if (n !== 'r') out.push({ b, m: midi(n), d: dur });
      b += dur;
    }
    return out;
  }
  /* Accord : « Bb », « F/A », « Gm », « Cm7 », « Fmaj7 », « Esus4 », « Dm9 » → classes de hauteurs */
  function chord(name) {
    const [main, bassName] = name.split('/');
    const m = main.match(/^([A-G])([#b]?)(.*)$/);
    const root = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    const q = m[3];
    let iv = [0, 4, 7];
    if (q.startsWith('m') && !q.startsWith('maj')) iv = [0, 3, 7];
    if (q.includes('sus4')) iv = [0, 5, 7];
    if (q.includes('dim')) iv = [0, 3, 6];
    if (q.includes('maj7')) iv = iv.concat(11);
    else if (q.includes('7')) iv = iv.concat(10);
    if (q.includes('9')) iv = iv.concat(14);
    if (q.includes('b9')) iv = iv.concat(13);
    let bass = root;
    if (bassName) { const b = bassName.match(/^([A-G])([#b]?)/); bass = (NOTE[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0) + 12) % 12; }
    return { root, pcs: iv.map((i) => (root + i) % 12), bass };
  }
  /* Place une classe de hauteur dans la tessiture [lo, hi]. */
  const place = (pc, lo) => { let n = lo + ((pc - lo) % 12 + 12) % 12; return n; };

  /* ------------------------------------------------------------------
     Partitions (compositions originales)
     ------------------------------------------------------------------ */
  const THEMES = {
    geants: {
      title: "L'Île des Géants", style: 'majestic', bpm: 76, bars: 4,
      sections: [
        { chords: ['Bb', 'Bb'], mel: 'F4:2 Bb4:2 | F5:4', lead: 'horn', soft: true, intro: true },
        { chords: ['Bb', 'F/A', 'Gm', 'Eb', 'Bb/F', 'Eb', 'Cm7', 'F'],
          mel: 'Bb4:2 D5:1 F5:1 | F5:1.5 Eb5:0.5 D5:1 C5:1 | D5:1 Bb4:1 G4:1 Bb4:1 | Eb5:3 D5:0.5 C5:0.5 | D5:2 F5:1 Bb5:1 | G5:1.5 F5:0.5 Eb5:1 D5:1 | C5:1 Eb5:1 D5:1 C5:1 | F5:3 r:1', lead: 'horn' },
        { chords: ['Gm', 'Eb', 'Bb', 'F', 'Eb', 'Bb/D', 'Cm', 'F'],
          mel: 'G5:2 F5:1 D5:1 | Eb5:2 Bb4:2 | D5:1.5 C5:0.5 Bb4:1 D5:1 | C5:3 r:1 | Eb5:1 F5:1 G5:1 Bb5:1 | F5:2 D5:1 Bb4:1 | Eb5:1 D5:1 C5:1 A4:1 | Bb4:2 C5:2', lead: 'strings', harp: true, swellIn: true },
        { chords: ['Bb', 'F/A', 'Gm', 'Eb', 'Bb/F', 'Eb', 'Cm7', 'Bb'],
          mel: 'Bb4:2 D5:1 F5:1 | F5:1.5 Eb5:0.5 D5:1 C5:1 | D5:1 Bb4:1 G4:1 Bb4:1 | Eb5:3 D5:0.5 C5:0.5 | D5:2 F5:1 Bb5:1 | G5:1.5 F5:0.5 Eb5:1 D5:1 | C5:1 Eb5:1 D5:1 C5:1 | Bb4:4', lead: 'tutti', swellIn: true },
        { chords: ['Eb', 'Bb'], mel: 'G4:2 F4:2 | Bb4:4', lead: 'horn', soft: true, roll: true }
      ]
    },
    matin: {
      title: 'Matin sur le parc', style: 'pastoral', bpm: 88, bars: 4,
      sections: [
        { chords: ['F', 'F'], mel: 'r:8', lead: 'flute', intro: true },
        { chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'],
          mel: 'C5:1 F5:1 G5:1 A5:1 | G5:2 F5:1 D5:1 | F5:1.5 E5:0.5 D5:1 Bb4:1 | C5:3 r:1 | A4:1 C5:1 F5:1 A5:1 | G5:1.5 E5:0.5 C5:2 | D5:1 F5:1 Bb5:1 A5:0.5 G5:0.5 | G5:3 r:1', lead: 'flute' },
        { chords: ['Dm', 'Bb', 'F', 'C', 'Bb', 'Gm', 'C', 'F'],
          mel: 'A5:2 G5:1 F5:1 | F5:1 D5:1 Bb4:2 | C5:1 F5:1 A5:1 C6:1 | Bb5:2 G5:2 | F5:1 G5:1 A5:1 Bb5:1 | A5:1.5 G5:0.5 F5:1 D5:1 | E5:1 F5:1 G5:1 E5:1 | F5:4', lead: 'strings' }
      ]
    },
    expedition: {
      title: 'Expédition', style: 'adventure', bpm: 116, bars: 4,
      sections: [
        { chords: ['Dm', 'Dm'], mel: 'r:8', lead: 'horn', intro: true },
        { chords: ['Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'A', 'A'],
          mel: 'D4:1.5 A4:0.5 A4:1 G4:0.5 F4:0.5 | E4:1 F4:1 D4:2 | E4:1.5 G4:0.5 G4:1 F4:0.5 E4:0.5 | C4:2 E4:1 G4:1 | F4:1.5 Bb4:0.5 Bb4:1 A4:0.5 G4:0.5 | F4:1 D4:1 F4:1 Bb4:1 | A4:2 C#5:1 E5:1 | A4:4', lead: 'horn' },
        { chords: ['Dm', 'F', 'G', 'A', 'Bb', 'C', 'A', 'A7'],
          mel: 'D5:1.5 A4:0.5 D5:1 F5:1 | E5:1 C5:1 A4:2 | B4:1 D5:1 G5:1.5 F5:0.5 | E5:2 C#5:2 | D5:1 F5:1 Bb5:1.5 A5:0.5 | G5:1 E5:1 C5:2 | E5:1.5 D5:0.5 C#5:1 E5:1 | A4:3 r:1', lead: 'tutti', swellIn: true }
      ]
    },
    nuit: {
      title: 'Nuit tropicale', style: 'night', bpm: 58, bars: 4,
      sections: [
        { chords: ['Am', 'Fmaj7', 'Dm9', 'E', 'Am', 'C/G', 'Fmaj7', 'Esus4'],
          mel: 'E5:1 A5:1 C6:1.5 B5:0.5 | A5:2 E5:2 | F5:1 A5:1 D6:1.5 C6:0.5 | B5:3 r:1 | E5:1 A5:1 E6:2 | D6:1 C6:1 G5:2 | A5:1 C6:1 B5:1 A5:1 | G#5:3 r:1', lead: 'celesta' },
        { chords: ['Am', 'Fmaj7', 'Dm9', 'E', 'Am', 'C/G', 'Fmaj7', 'Am'],
          mel: 'r:2 C6:1 B5:1 | A5:3 r:1 | r:2 D6:1 C6:1 | B5:2 G#5:2 | A5:1.5 B5:0.5 C6:1 E6:1 | D6:2 B5:2 | C6:1 A5:1 F5:1 E5:1 | A5:4', lead: 'flute' }
      ]
    },
    alerte: {
      title: 'Alerte !', style: 'tension', bpm: 132, bars: 4,
      sections: [
        { chords: ['Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'G', 'Cm', 'G7b9'],
          mel: 'C4:2 B3:1 C4:1 | Eb4:2 D4:2 | Ab3:2 G3:1 Ab3:1 | C4:4 | F4:2 Eb4:1 D4:1 | B3:2 D4:2 | C4:1 Eb4:1 G4:1 F#4:1 | G4:4', lead: 'horn' }
      ]
    },
    merveille: {
      title: 'Émerveillement', style: 'wonder', bpm: 66, bars: 4, once: true,
      sections: [
        { chords: ['Eb', 'Ab/Eb', 'Cm', 'Bbsus4', 'Ab', 'Eb'],
          mel: 'G4:2 Bb4:1 Eb5:1 | D5:2 C5:1 Bb4:1 | Ab4:1.5 Bb4:0.5 C5:2 | Bb4:4 | C5:1 Eb5:1 Ab5:1 G5:1 | G5:4', lead: 'horn' }
      ]
    }
  };

  /* ------------------------------------------------------------------
     Orchestre de synthèse
     ------------------------------------------------------------------ */
  /* Spectres d'instruments (ondes périodiques) : beaucoup plus doux et
     riches que les ondes en dents de scie ou carrées brutes. */
  function waves(c) {
    if (c.__dzWaves) return c.__dzWaves;
    const mk = (n, fn) => { const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let k = 1; k <= n; k++) im[k] = fn(k); return c.createPeriodicWave(re, im); };
    c.__dzWaves = {
      string: mk(40, (k) => (1 / k) * (k % 2 ? 1 : 0.82) * Math.exp(-k / 16)),
      cello: mk(40, (k) => (1 / Math.pow(k, 0.9)) * Math.exp(-k / 11)),
      horn: mk(24, (k) => Math.exp(-(k - 1) * 0.42) * (k === 2 ? 1.15 : 1)),
      flute: mk(8, (k) => [0, 1, 0.22, 0.07, 0.035, 0.015, 0.008, 0.004, 0.002][k]),
      choir: mk(32, (k) => 1 / Math.pow(k, 1.25)),
      reed: mk(24, (k) => (k % 2 ? 1 : 0.45) / Math.pow(k, 0.85) * Math.exp(-k / 14))
    };
    return c.__dzWaves;
  }

  /* ------------------------------------------------------------------
     Orchestre de synthèse
     Chaque note = un ensemble de voix légèrement désaccordées, réparties
     dans l'espace stéréo, chacune avec son propre vibrato.
     ------------------------------------------------------------------ */
  class Orchestra {
    constructor(sound, out) { this.s = sound; this.c = sound.ctx; this.out = out; this.w = waves(this.c); }
    env(p, t, a, peak, hold, rel) {
      p.setValueAtTime(0.0001, t);
      p.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
      p.setValueAtTime(Math.max(0.0002, peak), t + a + Math.max(0, hold));
      p.setTargetAtTime(0.0001, t + a + Math.max(0, hold), rel / 3.5);
    }
    filt(type, f, q) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
    pan(v) { if (!this.c.createStereoPanner) return null; const p = this.c.createStereoPanner(); p.pan.value = v; return p; }

    /* Ensemble de voix vers une entrée commune : les voix sont réparties
       en deux pupitres (gauche / droite), chacun avec son vibrato à lui,
       ce qui garde l'ampleur stéréo pour un coût modeste. */
    ensemble(wave, f, t, end, input, o) {
      const c = this.c, n = o.voices || 4, w = o.width || 0.6;
      const sides = [];
      for (let k = 0; k < (n > 1 ? 2 : 1); k++) {
        const g = c.createGain(); g.gain.value = 1 / Math.sqrt(n);
        const p = n > 1 ? this.pan(k ? w : -w) : null;
        if (p) { g.connect(p); p.connect(input); } else g.connect(input);
        let lg = null;
        if (o.vib) {
          const l = c.createOscillator(); l.frequency.value = rr(4.7, 5.6) + k * 0.37;
          lg = c.createGain();
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib * rr(0.8, 1.15), t + (o.vibDelay || 0.4));
          l.connect(lg); l.start(t); l.stop(end);
        }
        sides.push({ g, lg });
      }
      for (let i = 0; i < n; i++) {
        const osc = c.createOscillator();
        osc.setPeriodicWave(wave);
        osc.frequency.value = f;
        const spread = n > 1 ? i / (n - 1) * 2 - 1 : 0;
        osc.detune.value = spread * (o.detune || 10) + rr(-2.5, 2.5);
        const sd = sides[i % sides.length];
        if (sd.lg) sd.lg.connect(osc.detune);
        osc.connect(sd.g);
        osc.start(t + rr(0, o.stagger || 0.015)); osc.stop(end);
      }
    }

    play(inst, m, t, dur, vel, extra) {
      const f = mtof(m), fn = this[inst];
      if (fn) fn.call(this, f, t, dur, vel, m, extra);
    }

    /* Cordes : nappes en legato avec montée lente. */
    strings(f, t, dur, vel) {
      const c = this.c, g = c.createGain();
      const lp = this.filt('lowpass', 1500 + vel * 1700, 0.35), hp = this.filt('highpass', 90);
      const body = this.filt('peaking', 420, 1.1); body.gain.value = 3;
      this.ensemble(this.w.string, f, t, t + dur + 1.8, lp, { voices: 4, detune: 12, vib: 7, vibDelay: 0.6, width: 0.7, stagger: 0.04 });
      lp.connect(body); body.connect(hp); hp.connect(g); g.connect(this.out);
      const a = U_clamp(dur * 0.45, 0.18, 1.3);
      this.env(g.gain, t, a, 0.05 * vel, dur - a, 1.8);
    }
    /* Ostinato de cordes détaché, mais doux (pas de grésillement). */
    stacc(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 1300 + vel * 500, 0.3);
      this.ensemble(this.w.cello, f, t, t + 0.7, lp, { voices: 2, detune: 8, width: 0.4 });
      lp.connect(g); g.connect(this.out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * vel, t + 0.025);
      g.gain.setTargetAtTime(0.0001, t + 0.05, Math.min(0.12, dur * 0.35));
    }
    /* Cors : chaleureux, le filtre s'ouvre à l'attaque. */
    horn(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 500, 0.6);
      lp.frequency.setValueAtTime(420, t);
      lp.frequency.linearRampToValueAtTime(700 + vel * 1100, t + 0.22);
      lp.frequency.setTargetAtTime(560 + vel * 700, t + 0.3, 0.6);
      this.ensemble(this.w.horn, f, t, t + dur + 1.5, lp, { voices: 3, detune: 7, vib: 4, vibDelay: 0.5, width: 0.35, stagger: 0.03 });
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.12, 0.07 * vel, dur - 0.12, 0.8);
    }
    /* Accent de cuivres (sforzando adouci). */
    stab(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 1600, 0.5);
      this.ensemble(this.w.horn, f, t, t + 1.2, lp, { voices: 3, detune: 9, width: 0.5 });
      lp.connect(g); g.connect(this.out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.04);
      g.gain.setTargetAtTime(0.0001, t + 0.12, 0.18);
    }
    bass(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 420, 0.4);
      this.ensemble(this.w.cello, f, t, t + dur + 2, lp, { voices: 2, detune: 6, vib: 3, width: 0.2 });
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, U_clamp(dur * 0.2, 0.08, 0.35), 0.075 * vel, dur - 0.1, 1.0);
    }
    /* Timbales : partiels inharmoniques d'une membrane + maillet. */
    timp(f, t, dur, vel) {
      const c = this.c, out = c.createGain(); out.gain.value = 0.32 * vel;
      [[1, 1, 1.9], [1.5, 0.45, 1.0], [1.99, 0.28, 0.7], [2.44, 0.16, 0.5], [2.9, 0.08, 0.35]].forEach(([r, a, d]) => {
        const o = c.createOscillator(); o.frequency.setValueAtTime(f * r * 1.015, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.15);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, d / 4);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.5);
      });
      const n = c.createBufferSource(); n.buffer = this.s.brown; n.start(t, R() * 3, 0.12);
      const nl = this.filt('lowpass', 700), ng = c.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.025);
      n.connect(nl); nl.connect(ng); ng.connect(out);
      out.connect(this.out);
    }
    /* Corde pincée (harpe) : partiels légèrement inharmoniques, chacun avec sa décroissance. */
    harp(f, t, dur, vel) {
      const c = this.c, out = c.createGain(), lp = this.filt('lowpass', 4200, 0.3);
      const p = this.pan(rr(-0.4, 0.4));
      for (let k = 1; k <= 5; k++) {
        const o = c.createOscillator(); o.frequency.value = f * k * (1 + 0.0006 * k * k);
        const g = c.createGain(), d = 2.4 / Math.pow(k, 0.9);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1 / Math.pow(k, 1.45), t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.005, d / 4);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + 0.3);
      }
      out.gain.value = 0.05 * vel;
      lp.connect(out);
      if (p) { out.connect(p); p.connect(this.out); } else out.connect(this.out);
    }
    /* Célesta / piano feutré : partiels de cloche douce. */
    celesta(f, t, dur, vel) {
      const c = this.c, out = c.createGain(), p = this.pan(rr(-0.3, 0.3));
      [[1, 1, 2.6], [2, 0.32, 1.6], [3.01, 0.12, 1.1], [4.03, 0.1, 0.7], [6.98, 0.03, 0.4]].forEach(([r, a, d]) => {
        const o = c.createOscillator(); o.frequency.value = f * r;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.006, d / 4);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.3);
      });
      out.gain.value = 0.045 * vel;
      if (p) { out.connect(p); p.connect(this.out); } else out.connect(this.out);
    }
    flute(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 5000, 0.3);
      this.ensemble(this.w.flute, f, t, t + dur + 1, lp, { voices: 2, detune: 4, vib: 9, vibDelay: 0.35, width: 0.25 });
      const n = c.createBufferSource(); n.buffer = this.s.white; n.loop = true; n.start(t, R() * 3); n.stop(t + dur + 1);
      const nb = this.filt('bandpass', f * 2.2, 1.5), ng = c.createGain(); ng.gain.value = 0.035;
      n.connect(nb); nb.connect(ng); ng.connect(lp);
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.1, 0.06 * vel, dur - 0.1, 0.5);
    }
    choir(f, t, dur, vel, m, vowel) {
      const c = this.c, g = c.createGain(), src = c.createGain();
      const F = vowel === 'o' ? [[450, 3, 1], [800, 4, 0.55], [2830, 6, 0.12]] : [[780, 3, 1], [1150, 4, 0.6], [2900, 6, 0.15]];
      this.ensemble(this.w.choir, f, t, t + dur + 2.2, src, { voices: 4, detune: 14, vib: 6, vibDelay: 0.8, width: 0.8, stagger: 0.08 });
      for (const [ff, q, a] of F) { const bp = this.filt('bandpass', ff, q), bg = c.createGain(); bg.gain.value = a; src.connect(bp); bp.connect(bg); bg.connect(g); }
      g.connect(this.out);
      const a = U_clamp(dur * 0.45, 0.5, 1.6);
      this.env(g.gain, t, a, 0.12 * vel, dur - a, 2.2);
    }
    swell(f, t, dur, vel) { // cymbale suspendue frottée
      const c = this.c, n = c.createBufferSource(); n.buffer = this.s.white; n.loop = true; n.start(t, R() * 3); n.stop(t + dur + 3);
      const hp = this.filt('highpass', 6000), pk = this.filt('peaking', 9000, 1); pk.gain.value = 4;
      const g = c.createGain();
      n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 * vel, t + dur); g.gain.setTargetAtTime(0.0001, t + dur, 0.8);
    }
  }
  const U_clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ------------------------------------------------------------------
     Arrangeur : orchestre une partition selon le style
     ------------------------------------------------------------------ */
  function arrange(theme) {
    const ev = [];
    const bpb = theme.bars;
    let bar = 0;
    const add = (b, inst, m, d, v, extra) => { if (m != null) ev.push({ b, inst, m, d, v, extra }); };
    for (const sec of theme.sections) {
      const mel = melody(sec.mel);
      const start = bar * bpb;
      const soft = sec.soft ? 0.6 : 1;
      sec.chords.forEach((name, i) => {
        const ch = chord(name), b0 = start + i * bpb;
        const voices = ch.pcs.slice(0, 4).map((pc, k) => place(pc, k === 0 ? 55 : 58 + k * 2)).sort((a, b) => a - b);
        const bassN = place(ch.bass, 36);
        const st = theme.style;
        if (st === 'majestic') {
          for (const n of voices) add(b0, 'strings', n, bpb, (sec.lead === 'tutti' ? 0.75 : 0.55) * soft);
          add(b0, 'bass', bassN, bpb / 2, 0.8 * soft); add(b0 + bpb / 2, 'bass', bassN + (i % 2 ? 7 : 0), bpb / 2, 0.7 * soft);
          if (i % 4 === 0 || sec.lead === 'tutti') add(b0, 'timp', place(ch.root, 41), 1, 0.7 * soft);
          if (i % 4 === 3) add(b0, 'swell', 60, bpb, 0.5 * soft);
          if (sec.harp) for (let k = 0; k < 6; k++) add(b0 + k * 0.66, 'harp', place(ch.pcs[k % ch.pcs.length], 62 + (k > 2 ? 12 : 0)), 0.7, 0.45);
          if (sec.lead === 'tutti') add(b0, 'horn', place(ch.root, 50), bpb, 0.45);
        } else if (st === 'pastoral') {
          const arp = [0, 2, 1, 2, 3, 2, 1, 2];
          for (let k = 0; k < 8; k++) { const pc = ch.pcs[arp[k] % ch.pcs.length]; add(b0 + k * 0.5, 'harp', place(pc, k === 4 ? 67 : 55 + (arp[k] > 1 ? 7 : 0)), 0.5, k % 2 ? 0.35 : 0.55); }
          for (const n of voices) add(b0, 'strings', n + 12, bpb, 0.3);
          add(b0, 'bass', bassN, 2, 0.5); add(b0 + 2, 'bass', bassN, 2, 0.4);
        } else if (st === 'adventure') {
          const pat = [0, 0, 7, 0, 3, 0, 7, 12];
          for (let k = 0; k < 8; k++) add(b0 + k * 0.5, 'stacc', place(ch.root, 50) + (pat[k] === 3 ? (ch.pcs[1] - ch.root + 12) % 12 : pat[k]), 0.5, k % 2 ? 0.35 : 0.6);
          add(b0, 'bass', bassN, 2, 0.75); add(b0 + 2, 'bass', bassN, 2, 0.6);
          if (i % 2 === 0) add(b0, 'timp', place(ch.root, 41), 1, 0.6);
          if (i % 4 === 3) { for (const n of voices.slice(1)) add(b0 + 2, 'stab', n + 12, 1, 0.45); add(b0, 'swell', 60, bpb, 0.45); }
          for (const n of voices) add(b0, 'strings', n + 12, bpb, 0.4);
        } else if (st === 'night') {
          for (const n of voices.slice(0, 3)) add(b0, 'choir', n + 12, bpb, 0.5, 'o');
          add(b0, 'bass', bassN, bpb, 0.35);
          add(b0, 'harp', place(ch.root, 50), 1, 0.4); add(b0 + 2, 'harp', place(ch.pcs[2 % ch.pcs.length], 57), 1, 0.3);
        } else if (st === 'tension') {
          for (let k = 0; k < 8; k++) add(b0 + k * 0.5, 'stacc', place(ch.root, 43) + ([0, 0, 3, 0, 6, 0, 5, 0][k]), 0.5, k % 2 ? 0.4 : 0.75);
          add(b0 + 3, 'stab', place(ch.pcs[1], 60), 1, 0.55); add(b0 + 3, 'stab', place(ch.pcs[0], 60) + 1, 1, 0.35);
          add(b0, 'timp', place(ch.root, 41), 1, 0.7); add(b0 + 2.5, 'timp', place(ch.root, 41), 0.5, 0.35);
          for (const n of voices) add(b0, 'strings', n, bpb, 0.35);
          add(b0, 'bass', bassN, bpb, 0.7);
        } else if (st === 'wonder') {
          for (const n of voices) { add(b0, 'choir', n + 12, bpb, 0.65, 'a'); add(b0, 'strings', n, bpb, 0.55); }
          add(b0, 'bass', bassN, bpb, 0.6);
          if (i === 0) for (let k = 0; k < 14; k++) add(b0 + k * 0.08, 'harp', place(ch.pcs[k % ch.pcs.length], 55 + Math.floor(k / 3) * 12 / 3 * 3), 0.2, 0.6);
          if (i === 3) add(b0, 'swell', 60, bpb, 1);
          if (i === sec.chords.length - 1) add(b0, 'timp', place(ch.root, 41), 1, 0.5);
        }
      });
      if (sec.swellIn && bar > 0) add(start - bpb, 'swell', 60, bpb, 0.8);
      // mélodie
      const lead = sec.lead;
      for (const n of mel) {
        if (lead === 'horn') add(start + n.b, 'horn', n.m, n.d, 0.85 * soft);
        else if (lead === 'strings') { add(start + n.b, 'strings', n.m, n.d, 0.85); add(start + n.b, 'strings', n.m + 12, n.d, 0.45); }
        else if (lead === 'tutti') { add(start + n.b, 'horn', n.m, n.d, 0.9); add(start + n.b, 'strings', n.m + 12, n.d, 0.7); }
        else if (lead === 'flute') add(start + n.b, 'flute', n.m, n.d, 0.9);
        else if (lead === 'celesta') { add(start + n.b, 'celesta', n.m, n.d, 0.8); }
      }
      if (sec.roll) { add(start + 2, 'swell', 60, 4, 0.7); add(start + 6, 'timp', 46, 1, 0.6); }
      bar += sec.chords.length;
    }
    ev.sort((a, b) => a.b - b.b);
    return { events: ev, beats: bar * bpb };
  }

  /* ------------------------------------------------------------------
     Chef d'orchestre : choisit, enchaîne et fond les thèmes
     ------------------------------------------------------------------ */
  class Music {
    constructor(sound) {
      this.s = sound;
      this.c = sound.ctx;
      this.players = [];
      this.context = { hour: 12, storm: 0, alert: 0 };
      this.on = false;
      this.cache = {};
      this.lastDay = null;
      this.pauseUntil = 0;
      this.count = {};
    }
    get current() { const p = this.players.find((x) => !x.fading && !x.theme.once); return p ? p.key : null; }
    get title() { const p = this.players.find((x) => !x.fading); return p ? p.theme.title : ''; }
    start() { this.on = true; if (!this.players.length) this.pauseUntil = 0; }
    setContext(cx) { Object.assign(this.context, cx); }
    alert() { this.context.alert = this.c.currentTime + 45; this.switchTo('alerte', 1.5); }
    wonder() {
      if (!this.s.musicOn) return;
      if (this.players.some((p) => p.key === 'merveille')) return;
      for (const p of this.players) p.gain.gain.setTargetAtTime(0.25, this.c.currentTime, 0.8);
      this.play('merveille', 0.5);
    }
    next() { const k = this.choose(true); this.switchTo(k, 2.5); }

    choose(different) {
      const cx = this.context, h = cx.hour;
      if (cx.alert > this.c.currentTime || cx.storm > 0.55) return 'alerte';
      if (h >= 20 || h < 6.4) return 'nuit';
      if (h < 9.5) return 'matin';
      const pool = ['geants', 'expedition', 'matin', 'geants'];
      let k = pool[Math.floor(R() * pool.length)];
      if (different && k === this.current) k = k === 'geants' ? 'expedition' : 'geants';
      return k;
    }

    score(key) { return this.cache[key] || (this.cache[key] = arrange(THEMES[key])); }

    play(key, fadeIn) {
      const c = this.c, theme = THEMES[key];
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(1, c.currentTime + (fadeIn || 0.5));
      gain.connect(this.s.musicBus);
      const orch = new Orchestra(this.s, gain);
      const sc = this.score(key);
      const spb = 60 / theme.bpm;
      const p = { key, theme, gain, orch, sc, spb, start: c.currentTime + 0.2, idx: 0, loops: 0, maxLoops: theme.once ? 1 : 1 + Math.floor(R() * 2), fading: false };
      this.players.push(p);
      this.count[key] = (this.count[key] || 0) + 1;
      if (this.onTheme && !theme.once) this.onTheme(theme.title);
      return p;
    }
    fade(p, sec) {
      if (p.fading) return;
      p.fading = true;
      const t = this.c.currentTime;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), t);
      p.gain.gain.exponentialRampToValueAtTime(0.0001, t + sec);
      p.killAt = t + sec + 2.5;
    }
    switchTo(key, fadeSec) {
      if (!this.on || !this.s.musicOn) return;
      if (this.current === key) return;
      for (const p of this.players) if (!p.theme.once) this.fade(p, fadeSec || 3);
      this.play(key, fadeSec || 3);
    }

    /* Appelé toutes les 100 ms : planifie les notes à venir. */
    tick() {
      const c = this.c, now = c.currentTime;
      if (!this.on || !this.s.musicOn) { for (const p of this.players) this.fade(p, 1.5); }
      this.players = this.players.filter((p) => !(p.killAt && now > p.killAt) && !(p.done && now > p.done));
      if (!this.on || !this.s.musicOn) return;
      const main = this.players.find((p) => !p.fading && !p.theme.once);
      if (!main && now > this.pauseUntil) this.play(this.choose(false), 4);
      // changement de contexte : nuit, orage, alerte
      if (main) {
        const want = this.choose(false);
        if ((want === 'alerte' || want === 'nuit' || main.key === 'alerte' || main.key === 'nuit') && want !== main.key) this.switchTo(want, 4);
      }
      const ahead = now + 1.2;
      for (const p of this.players) {
        if (p.done) continue;
        const ev = p.sc.events;
        while (p.idx < ev.length) {
          const e = ev[p.idx];
          const t = p.start + e.b * p.spb;
          if (t > ahead) break;
          if (t > now - 0.05 && !p.fading) {
            const hum = rr(-0.012, 0.012);
            p.orch.play(e.inst, e.m, Math.max(now, t + hum), e.d * p.spb, e.v * rr(0.9, 1.05), e.extra);
          }
          p.idx++;
        }
        if (p.idx >= ev.length) {
          const end = p.start + p.sc.beats * p.spb;
          if (now > end - 0.2) {
            p.loops++;
            if (p.loops < p.maxLoops && !p.fading) { p.start = end; p.idx = 0; }
            else {
              p.done = end + 3;
              if (p.theme.once) { for (const q of this.players) if (q !== p && !q.fading) q.gain.gain.setTargetAtTime(1, now, 1.5); }
              else if (!p.fading) { this.fade(p, 2); this.pauseUntil = now + rr(12, 30); }
            }
          }
        }
      }
    }
  }
  DZ.Music = Music;
  DZ.MUSIC_THEMES = THEMES;
  DZ._music = { Orchestra, arrange };
})();
