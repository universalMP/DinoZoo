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
  class Orchestra {
    constructor(sound, out) { this.s = sound; this.c = sound.ctx; this.out = out; }
    env(p, t, a, peak, hold, rel) {
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      p.setValueAtTime(Math.max(0.0002, peak), t + a + Math.max(0, hold));
      p.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
    }
    osc(type, f, t, dur) { const o = this.c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur); return o; }
    filt(type, f, q) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
    vibrato(target, f, t, dur, depth, delay) {
      const l = this.osc('sine', rr(4.8, 5.6), t, dur), g = this.c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(f * depth, t + (delay || 0.3));
      l.connect(g); g.connect(target);
    }
    play(inst, m, t, dur, vel) {
      const f = mtof(m), fn = this[inst];
      if (fn) fn.call(this, f, t, dur, vel, m);
    }
    strings(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 1100 + vel * 2200, 0.4);
      for (const det of [-9, 0, 8]) {
        const o = this.osc('sawtooth', f, t, dur + 1.2); o.detune.value = det + rr(-2, 2);
        this.vibrato(o.frequency, f, t, dur + 1.2, 0.004, 0.4);
        o.connect(lp);
      }
      lp.connect(g); g.connect(this.out);
      const a = Math.min(0.5, dur * 0.35);
      this.env(g.gain, t, a, 0.035 * vel, dur - a, 0.9);
    }
    stacc(f, t, dur, vel) { // cordes détachées (ostinato)
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 2400, 0.6);
      for (const det of [-6, 6]) { const o = this.osc('sawtooth', f, t, 0.35); o.detune.value = det; o.connect(lp); }
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.008, 0.05 * vel, 0.04, Math.min(0.22, dur * 0.9));
    }
    horn(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 400, 1.2);
      lp.frequency.setValueAtTime(350, t);
      lp.frequency.exponentialRampToValueAtTime(800 + vel * 1500, t + 0.12);
      lp.frequency.setTargetAtTime(600 + vel * 900, t + 0.15, 0.4);
      for (const [type, det, a] of [['sawtooth', -4, 1], ['sawtooth', 5, 1], ['square', 0, 0.35]]) {
        const o = this.osc(type, f, t, dur + 0.8), og = c.createGain(); og.gain.value = a; o.detune.value = det;
        this.vibrato(o.frequency, f, t, dur + 0.8, 0.003, 0.5);
        o.connect(og); og.connect(lp);
      }
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.07, 0.05 * vel, dur - 0.07, 0.45);
    }
    stab(f, t, dur, vel) { // cuivres brefs et éclatants
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 2600, 1);
      for (const det of [-7, 7]) { const o = this.osc('sawtooth', f, t, 0.5); o.detune.value = det; o.connect(lp); }
      lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.02, 0.05 * vel, 0.08, 0.25);
    }
    bass(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 520, 0.7);
      const o = this.osc('sawtooth', f, t, dur + 0.6), s = this.osc('sine', f, t, dur + 0.6), sg = c.createGain(); sg.gain.value = 0.8;
      o.connect(lp); s.connect(sg); sg.connect(lp); lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.06, 0.06 * vel, dur - 0.06, 0.4);
    }
    timp(f, t, dur, vel) {
      const c = this.c, g = c.createGain();
      const o = this.osc('sine', f * 1.02, t, 2.2); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      const o2 = this.osc('sine', f * 1.51, t, 1.2), g2 = c.createGain(); g2.gain.value = 0.3;
      o.connect(g); o2.connect(g2); g2.connect(g);
      const n = c.createBufferSource(); n.buffer = this.s.brown; n.start(t, R() * 3, 0.15);
      const nl = this.filt('lowpass', 400), ng = c.createGain(); n.connect(nl); nl.connect(ng); ng.connect(g);
      this.env(ng.gain, t, 0.003, 0.6, 0.01, 0.1);
      g.connect(this.out);
      this.env(g.gain, t, 0.004, 0.32 * vel, 0.02, 1.6);
    }
    harp(f, t, dur, vel) {
      const c = this.c, g = c.createGain(), lp = this.filt('lowpass', 3800);
      const o = this.osc('triangle', f, t, 2.2), o2 = this.osc('sine', f * 2, t, 1.4), g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.003, 0.06 * vel, 0.01, 1.8);
    }
    celesta(f, t, dur, vel) {
      const c = this.c, g = c.createGain();
      const o = this.osc('sine', f, t, 2.4), o2 = this.osc('sine', f * 4.01, t, 1.2), o3 = this.osc('sine', f * 2, t, 1.6), g2 = c.createGain(), g3 = c.createGain();
      g2.gain.value = 0.18; g3.gain.value = 0.2;
      o.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g); g.connect(this.out);
      this.env(g.gain, t, 0.004, 0.06 * vel, 0.02, 2.1);
    }
    flute(f, t, dur, vel) {
      const c = this.c, g = c.createGain();
      const o = this.osc('sine', f, t, dur + 0.5), o2 = this.osc('triangle', f, t, dur + 0.5), g2 = c.createGain(); g2.gain.value = 0.25;
      this.vibrato(o.frequency, f, t, dur + 0.5, 0.005, 0.25);
      o.connect(g); o2.connect(g2); g2.connect(g);
      const n = c.createBufferSource(); n.buffer = this.s.white; n.loop = true; n.start(t, R() * 3); n.stop(t + dur + 0.5);
      const nb = this.filt('bandpass', f * 2, 2), ng = c.createGain(); ng.gain.value = 0.06;
      n.connect(nb); nb.connect(ng); ng.connect(g);
      g.connect(this.out);
      this.env(g.gain, t, 0.07, 0.055 * vel, dur - 0.07, 0.25);
    }
    choir(f, t, dur, vel, m, vowel) {
      const c = this.c, g = c.createGain();
      const F = vowel === 'o' ? [[450, 6, 1], [800, 8, 0.5], [2830, 12, 0.15]] : [[800, 6, 1], [1150, 8, 0.6], [2900, 12, 0.2]];
      const src = c.createGain();
      for (const det of [-10, 0, 9]) { const o = this.osc('sawtooth', f, t, dur + 1.6); o.detune.value = det + rr(-3, 3); this.vibrato(o.frequency, f, t, dur + 1.6, 0.004, 0.6); o.connect(src); }
      for (const [ff, q, a] of F) { const bp = this.filt('bandpass', ff, q), bg = c.createGain(); bg.gain.value = a; src.connect(bp); bp.connect(bg); bg.connect(g); }
      g.connect(this.out);
      const a = Math.min(0.9, dur * 0.4);
      this.env(g.gain, t, a, 0.11 * vel, dur - a, 1.3);
    }
    swell(f, t, dur, vel) { // cymbale suspendue en crescendo
      const c = this.c, n = c.createBufferSource(); n.buffer = this.s.white; n.loop = true; n.start(t, R() * 3); n.stop(t + dur + 1.5);
      const hp = this.filt('highpass', 5500), g = c.createGain();
      n.connect(hp); hp.connect(g); g.connect(this.out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * vel, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
    }
  }

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
          if (i % 4 === 3) for (let k = 0; k < 8; k++) add(b0 + 2 + k * 0.25, 'timp', place(ch.root, 41), 0.25, 0.15 + k * 0.06);
          if (sec.harp) for (let k = 0; k < 8; k++) add(b0 + k * 0.5, 'harp', place(ch.pcs[k % ch.pcs.length], 62 + (k > 3 ? 12 : 0)), 0.5, 0.6);
          if (sec.lead === 'tutti') add(b0, 'horn', place(ch.root, 50), bpb, 0.45);
        } else if (st === 'pastoral') {
          const arp = [0, 2, 1, 2, 3, 2, 1, 2];
          for (let k = 0; k < 8; k++) { const pc = ch.pcs[arp[k] % ch.pcs.length]; add(b0 + k * 0.5, 'harp', place(pc, k === 4 ? 67 : 55 + (arp[k] > 1 ? 7 : 0)), 0.5, 0.7); }
          for (const n of voices) add(b0, 'strings', n + 12, bpb, 0.3);
          add(b0, 'bass', bassN, 2, 0.5); add(b0 + 2, 'bass', bassN, 2, 0.4);
        } else if (st === 'adventure') {
          const pat = [0, 0, 7, 0, 3, 0, 7, 12];
          for (let k = 0; k < 8; k++) add(b0 + k * 0.5, 'stacc', place(ch.root, 50) + (pat[k] === 3 ? (ch.pcs[1] - ch.root + 12) % 12 : pat[k]), 0.5, k % 2 ? 0.6 : 0.9);
          for (let k = 0; k < 4; k++) add(b0 + k, 'bass', bassN, 0.5, k % 2 ? 0.55 : 0.8);
          add(b0, 'timp', place(ch.root, 41), 1, 0.75); add(b0 + 2, 'timp', place(ch.root, 41), 1, 0.55);
          add(b0 + 3.5, 'timp', place(ch.root, 41) + 7, 0.5, 0.45);
          if (i % 4 === 3) for (const n of voices) add(b0 + 3, 'stab', n + 12, 0.5, 0.7);
          for (const n of voices) add(b0, 'strings', n + 12, bpb, 0.25);
        } else if (st === 'night') {
          for (const n of voices.slice(0, 3)) add(b0, 'choir', n + 12, bpb, 0.5, 'o');
          add(b0, 'bass', bassN, bpb, 0.35);
          add(b0, 'harp', place(ch.root, 50), 1, 0.4); add(b0 + 2, 'harp', place(ch.pcs[2 % ch.pcs.length], 57), 1, 0.3);
        } else if (st === 'tension') {
          for (let k = 0; k < 8; k++) add(b0 + k * 0.5, 'stacc', place(ch.root, 43) + ([0, 0, 3, 0, 6, 0, 5, 0][k]), 0.5, k % 2 ? 0.5 : 0.95);
          add(b0 + 1.5, 'stab', place(ch.pcs[0], 60), 0.4, 0.8); add(b0 + 3, 'stab', place(ch.pcs[1], 60), 0.4, 0.8); add(b0 + 3, 'stab', place(ch.pcs[0], 60) + 1, 0.4, 0.5);
          for (let k = 0; k < 4; k++) add(b0 + k, 'timp', place(ch.root, 41), 0.5, k === 0 ? 0.8 : 0.4);
          for (const n of voices) add(b0, 'strings', n, bpb, 0.35);
          add(b0, 'bass', bassN, bpb, 0.7);
        } else if (st === 'wonder') {
          for (const n of voices) { add(b0, 'choir', n + 12, bpb, 0.65, 'a'); add(b0, 'strings', n, bpb, 0.55); }
          add(b0, 'bass', bassN, bpb, 0.6);
          if (i === 0) for (let k = 0; k < 14; k++) add(b0 + k * 0.08, 'harp', place(ch.pcs[k % ch.pcs.length], 55 + Math.floor(k / 3) * 12 / 3 * 3), 0.2, 0.6);
          if (i === 3) add(b0, 'swell', 60, bpb, 1);
          if (i === sec.chords.length - 1) for (let k = 0; k < 10; k++) add(b0 + 2 + k * 0.2, 'timp', place(ch.root, 41), 0.2, 0.2 + k * 0.05);
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
      if (sec.roll) for (let k = 0; k < 12; k++) add(start + 4 + k * 0.25, 'timp', 46, 0.25, 0.15 + k * 0.05);
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
            if (e.extra) p.orch.choir(mtof(e.m), Math.max(now, t), e.d * p.spb, e.v, e.m, e.extra);
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
  // le chœur est joué par l'instrument « choir » via extra (voyelle)
  Orchestra.prototype.play = function (inst, m, t, dur, vel, extra) {
    if (inst === 'choir') return; // planifié séparément avec sa voyelle
    const fn = this[inst];
    if (fn) fn.call(this, mtof(m), t, dur, vel, m, extra);
  };

  DZ.Music = Music;
  DZ.MUSIC_THEMES = THEMES;
})();
