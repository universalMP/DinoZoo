/* =====================================================================
   DinoZoo — Rendu des bâtiments (vue de trois quarts).
   Chaque type et niveau est dessiné une fois dans un sprite :
   murs, toits, enseignes, terrasses. Les points lumineux (fenêtres,
   enseignes, lampes) sont exportés pour l'éclairage nocturne.
   Les clôtures d'enclos sont générées par enclos et par niveau.
   ===================================================================== */
(function () {
  const U = DZ.util, R = DZ.R, P = DZ.CONFIG.palette, TAU = U.TAU;
  const T = DZ.CONFIG.map.tile;

  /* ---------- Matériaux ---------- */
  function woodWall(g, x, y, w, h, base, vertical) {
    const r = U.rng((x * 13 + y * 7 + w) | 0);
    g.fillStyle = base; g.fillRect(x, y, w, h);
    const n = vertical ? Math.ceil(w / 5) : Math.ceil(h / 4.5);
    for (let i = 0; i < n; i++) {
      g.fillStyle = U.jitter(base, r, 0.07);
      if (vertical) g.fillRect(x + i * 5, y, 4.4, h); else g.fillRect(x, y + i * 4.5, w, 4);
      g.fillStyle = 'rgba(30,18,8,0.35)';
      if (vertical) g.fillRect(x + i * 5 + 4.4, y, 0.6, h); else g.fillRect(x, y + i * 4.5 + 4, w, 0.5);
    }
    g.strokeStyle = 'rgba(40,25,10,0.15)'; g.lineWidth = 0.4;
    for (let i = 0; i < w * h / 40; i++) { const px = x + r() * w, py = y + r() * h; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (vertical ? 0.3 : 4), py + (vertical ? 4 : 0.3)); g.stroke(); }
  }
  function stoneWall(g, x, y, w, h, base) {
    const r = U.rng((x * 31 + y * 17 + h) | 0);
    g.fillStyle = '#6a645a'; g.fillRect(x, y, w, h);
    const rh = 4;
    for (let j = 0; j * rh < h; j++) {
      let cx = x - (j % 2) * 3;
      while (cx < x + w) {
        const bw = 5 + r() * 4;
        g.fillStyle = U.jitter(base || '#a49c8c', r, 0.1);
        const x0 = Math.max(x, cx + 0.4), x1 = Math.min(x + w, cx + bw - 0.4);
        if (x1 > x0) { g.fillRect(x0, y + j * rh + 0.4, x1 - x0, Math.min(rh - 0.8, y + h - (y + j * rh + 0.4))); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, y + j * rh + 0.4, x1 - x0, 0.6); }
        cx += bw;
      }
    }
  }
  function shingles(g, x, y, w, h, base, ridge) {
    const r = U.rng((x * 7 + y * 3 + w * 11) | 0);
    // ridge : y du faîtage ; pente haute éclairée, pente basse à l'ombre
    const rows = Math.ceil(h / 3.2);
    for (let j = 0; j < rows; j++) {
      const yy = y + j * 3.2;
      const lit = yy < ridge ? 0.12 : -0.18;
      let cx = x - (j % 2) * 2.5;
      while (cx < x + w) {
        g.fillStyle = U.shade(U.css(U.rgb(base).map((c) => c + (r() - 0.5) * 18)), lit);
        g.fillRect(Math.max(x, cx), yy, Math.min(4.6, x + w - Math.max(x, cx)), 3.4);
        cx += 5;
      }
      g.fillStyle = 'rgba(20,10,5,0.25)'; g.fillRect(x, yy + 3, w, 0.4);
    }
    g.fillStyle = U.shade(base, -0.4); g.fillRect(x, ridge - 0.8, w, 1.6);
    g.fillStyle = 'rgba(255,240,210,0.2)'; g.fillRect(x, ridge - 1.2, w, 0.5);
  }
  function glass(g, x, y, w, h, lit) {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, lit ? 'rgba(255,224,160,0.95)' : 'rgba(150,190,200,0.9)');
    gr.addColorStop(1, lit ? 'rgba(220,170,90,0.95)' : 'rgba(70,100,115,0.95)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.35, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x, y + h * 0.8); g.closePath(); g.fill();
    g.strokeStyle = '#3f454a'; g.lineWidth = 0.8; g.strokeRect(x, y, w, h);
  }
  function awning(g, x, y, w, h, c1, c2) {
    const n = Math.max(4, Math.round(w / 5));
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? c1 : c2;
      g.beginPath(); g.moveTo(x + i * w / n, y); g.lineTo(x + (i + 1) * w / n, y); g.lineTo(x + (i + 1) * w / n + 0.5, y + h); g.quadraticCurveTo(x + (i + 0.5) * w / n, y + h + 2.2, x + i * w / n - 0.5, y + h); g.closePath(); g.fill();
    }
    const sh = g.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = sh; g.fillRect(x - 0.5, y, w + 1, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h + 1.5, w, 2.5);
  }
  function sign(g, x, y, w, h, text, bg, fg, font) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 0.8, y + 0.8, w, h);
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = U.shade(bg, -0.45); g.lineWidth = 0.8; g.strokeRect(x, y, w, h);
    g.fillStyle = fg; g.font = font || `700 ${Math.min(h * 0.62, 7)}px Georgia, serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 0.3);
  }
  function parasol(g, x, y, r, c1, c2) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x + 3, y + 4, r, r * 0.6, 0, 0, TAU); g.fill();
    g.fillStyle = '#5a4a3a'; g.fillRect(x - 0.4, y - 9, 0.8, 9);
    const n = 8;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? c1 : c2;
      g.beginPath(); g.moveTo(x, y - 11); g.lineTo(x + Math.cos(i / n * TAU) * r, y - 9 + Math.sin(i / n * TAU) * r * 0.55); g.lineTo(x + Math.cos((i + 1) / n * TAU) * r, y - 9 + Math.sin((i + 1) / n * TAU) * r * 0.55); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.ellipse(x - r * 0.3, y - 10.5, r * 0.4, r * 0.2, 0, 0, TAU); g.fill();
  }
  function table(g, x, y) {
    g.fillStyle = '#7a5a3a'; g.fillRect(x - 5, y - 3, 10, 4);
    g.fillStyle = '#9a7650'; g.fillRect(x - 5, y - 4, 10, 1.3);
    g.fillStyle = '#5a4028'; g.fillRect(x - 6, y + 1, 12, 1.2); g.fillRect(x - 6, y - 6, 12, 1.2);
  }
  function plant(g, x, y, s) {
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(x - 2.5 * s, y - 4 * s); g.lineTo(x + 2.5 * s, y - 4 * s); g.lineTo(x + 2 * s, y); g.lineTo(x - 2 * s, y); g.fill();
    const r = U.rng((x * 3 + y) | 0);
    for (let i = 0; i < 7; i++) R.frond(g, x, y - 4 * s, -Math.PI / 2 + (i / 6 - 0.5) * 2.4, 5 * s + r() * 2, 2, 2 * s, P.foliage[3 + (i % 2)], r, 1.4);
  }
  function chimney(g, x, y, h) { stoneWall(g, x, y - h, 6, h, '#8a8278'); g.fillStyle = '#3a3430'; g.fillRect(x - 0.5, y - h - 1, 7, 2); }

  /* ---------- Dessinateurs par type ----------
     Origine du sprite : coin haut-gauche de l'emprise au sol.
     Retourne { lights: [[x, y, r]], smoke: [[x, y]], h: hauteur au-dessus de l'emprise } */
  const drawers = {
    boutique(g, lv) {
      const out = { lights: [], smoke: [] };
      const x0 = 8, x1 = 88, roofY = lv === 3 ? -18 : -14, wallTop = 40, ground = 72;
      if (lv === 1) {
        woodWall(g, x0, wallTop, x1 - x0, ground - wallTop, P.wood[1], true);
        g.fillStyle = '#2a1e14'; g.fillRect(24, 50, 48, 18);
        for (let i = 0; i < 6; i++) { g.fillStyle = ['#b8483a', '#d9a83c', '#4f8a4b', '#3a6ea5'][i % 4]; g.beginPath(); g.arc(30 + i * 7.5, 58, 2.4, 0, TAU); g.fill(); }
        g.fillStyle = P.wood[2]; g.fillRect(22, 66, 52, 4);
        shingles(g, x0 - 4, roofY, x1 - x0 + 8, wallTop - roofY, '#7a5236', (roofY + wallTop) / 2);
        awning(g, 20, 44, 56, 7, P.canvas[0], P.canvas[1]);
        sign(g, 30, roofY + 8, 36, 10, 'SOUVENIRS', '#e9dcbc', '#4a3220');
        out.lights.push([48, 58, 18]);
      } else if (lv === 2) {
        stoneWall(g, x0, ground - 10, x1 - x0, 10, '#a89e8c');
        woodWall(g, x0, wallTop, x1 - x0, ground - 10 - wallTop, '#a57a52', true);
        g.fillStyle = '#2a1e14'; g.fillRect(18, 48, 60, 16);
        for (let i = 0; i < 9; i++) { g.fillStyle = ['#b8483a', '#d9a83c', '#4f8a4b', '#3a6ea5', '#e6e0d2'][i % 5]; g.beginPath(); g.arc(22 + i * 6.6, 56 + (i % 2) * 3, 2.3, 0, TAU); g.fill(); }
        shingles(g, x0 - 5, roofY, x1 - x0 + 10, wallTop - roofY, '#a0523a', (roofY + wallTop) / 2);
        awning(g, 14, 43, 68, 8, '#e9dfc4', '#b5523a');
        sign(g, 24, roofY + 6, 48, 12, 'SOUVENIRS', '#3f6b4a', '#f2e6c4');
        // fanions
        g.strokeStyle = '#5a4a3a'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(x0, wallTop - 2); g.quadraticCurveTo(48, wallTop + 6, x1, wallTop - 2); g.stroke();
        for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, x = U.lerp(x0, x1, t), y = wallTop - 2 + Math.sin(t * Math.PI) * 4; g.fillStyle = ['#d9a83c', '#b8483a', '#3a6ea5'][i % 3]; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 2, y); g.lineTo(x, y + 4); g.fill(); }
        plant(g, 12, 86, 1); plant(g, 84, 86, 1);
        // étal de peluches
        g.fillStyle = '#7a5a3a'; g.fillRect(36, 76, 24, 6); for (let i = 0; i < 4; i++) { g.fillStyle = ['#7d8248', '#8d6e4c', '#4f6f72', '#b8483a'][i]; g.beginPath(); g.ellipse(40 + i * 5.5, 75, 2.2, 2.6, 0, 0, TAU); g.fill(); }
        out.lights.push([48, 56, 22]);
      } else {
        g.fillStyle = '#d8d2c4'; g.fillRect(x0, wallTop, x1 - x0, ground - wallTop);
        glass(g, 14, 44, 68, 26, true);
        for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(80,60,40,0.6)'; g.fillRect(18, 52 + i * 6, 60, 1); }
        for (let i = 0; i < 12; i++) { g.fillStyle = ['#b8483a', '#d9a83c', '#4f8a4b', '#3a6ea5'][i % 4]; g.fillRect(19 + (i % 6) * 10, 47 + Math.floor(i / 6) * 6, 5, 4); }
        // toit plat moderne
        g.fillStyle = '#4a5054'; g.fillRect(x0 - 4, roofY, x1 - x0 + 8, wallTop - roofY);
        g.fillStyle = '#5c6368'; g.fillRect(x0 - 4, roofY, x1 - x0 + 8, 3);
        g.fillStyle = '#2f3438'; g.fillRect(x0 - 4, wallTop - 3, x1 - x0 + 8, 3);
        // crâne de T-Rex sur le toit
        const sk = (cx, cy) => {
          g.fillStyle = '#e8e0cc';
          g.beginPath(); g.moveTo(cx - 14, cy); g.quadraticCurveTo(cx - 12, cy - 12, cx + 2, cy - 11); g.quadraticCurveTo(cx + 16, cy - 8, cx + 18, cy - 1); g.lineTo(cx + 16, cy + 2); g.lineTo(cx - 12, cy + 4); g.closePath(); g.fill();
          g.fillStyle = '#3a3026'; g.beginPath(); g.ellipse(cx - 4, cy - 6, 3, 2.2, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(cx + 6, cy - 4, 3.5, 2, -0.2, 0, TAU); g.fill();
          g.fillStyle = '#f6f0e0'; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(cx - 6 + i * 3.4, cy + 2); g.lineTo(cx - 5 + i * 3.4, cy + 5); g.lineTo(cx - 4 + i * 3.4, cy + 2); g.fill(); }
        };
        sk(48, roofY + 4);
        sign(g, 20, wallTop - 1, 56, 8, 'DINO SHOP', '#1f2a24', '#9ef0b0', '700 6px "Trebuchet MS", sans-serif');
        plant(g, 10, 86, 1.1); plant(g, 86, 86, 1.1);
        out.lights.push([48, 56, 30], [48, wallTop + 3, 16, '#9ef0b0']);
      }
      out.h = -roofY + 22;
      return out;
    },
    restaurant(g, lv) {
      const out = { lights: [], smoke: [] };
      const x0 = 6, x1 = lv === 1 ? 82 : 138, roofY = -16, wallTop = 30, ground = 56;
      if (lv === 1) {
        woodWall(g, x0, wallTop, x1 - x0, ground - wallTop, P.wood[0], false);
        g.fillStyle = '#2a1e14'; g.fillRect(18, 36, 50, 14);
        g.fillStyle = '#d07a3a'; g.fillRect(22, 44, 8, 4); g.fillStyle = '#7a3a2a'; g.fillRect(34, 44, 10, 4);
        chimney(g, 64, wallTop - 10, 22); out.smoke.push([67, wallTop - 34]);
        shingles(g, x0 - 4, roofY, x1 - x0 + 8, wallTop - roofY, '#6a4a32', (roofY + wallTop) / 2);
        awning(g, 16, 32, 54, 6, '#e9dfc4', '#b5523a');
        sign(g, 22, roofY + 8, 40, 10, 'GRILL', '#e9dcbc', '#6a2a18');
        table(g, 108, 70); parasol(g, 108, 70, 11, '#e9dfc4', '#3f6b4a');
        table(g, 120, 88); parasol(g, 120, 88, 10, '#e9dfc4', '#b5523a');
        out.lights.push([42, 44, 18]);
      } else if (lv === 2) {
        stoneWall(g, x0, ground - 8, x1 - x0, 8);
        woodWall(g, x0, wallTop, x1 - x0, ground - 8 - wallTop, '#9a7048', false);
        for (let i = 0; i < 4; i++) { glass(g, 14 + i * 22, 34, 16, 12, true); }
        g.fillStyle = '#3a2618'; g.fillRect(104, 34, 14, 22);
        chimney(g, 122, wallTop - 8, 26); out.smoke.push([125, wallTop - 36]);
        shingles(g, x0 - 5, roofY - 2, x1 - x0 + 10, wallTop - roofY + 2, '#8a4a32', (roofY + wallTop) / 2);
        sign(g, 40, roofY + 6, 64, 12, 'RESTAURANT', '#3f6b4a', '#f2e6c4');
        const tables = [[20, 74], [46, 82], [72, 74], [98, 84], [124, 76]];
        for (const [x, y] of tables) table(g, x, y);
        // guirlande lumineuse
        g.strokeStyle = '#3a3026'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(8, 60); g.quadraticCurveTo(72, 70, 136, 60); g.stroke();
        for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12, x = U.lerp(8, 136, t), y = 60 + Math.sin(t * Math.PI) * 5; g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(x, y + 1, 0.9, 0, TAU); g.fill(); out.lights.push([x, y + 1, 7]); }
        for (const [x, y] of [[20, 74], [72, 74], [124, 76]]) parasol(g, x, y, 11, '#e9dfc4', '#b5523a');
        out.lights.push([60, 40, 26]);
      } else {
        // pavillon de verre à toit végétal
        g.fillStyle = '#d6d0c2'; g.fillRect(x0, wallTop - 2, x1 - x0, ground - wallTop + 2);
        for (let i = 0; i < 6; i++) glass(g, 10 + i * 21, 30, 18, 24, true);
        g.fillStyle = '#5a6066'; g.fillRect(x0 - 4, roofY - 4, x1 - x0 + 8, wallTop - roofY + 2);
        g.fillStyle = R.pattern(g, 'grassLush'); g.fillRect(x0, roofY - 1, x1 - x0, wallTop - roofY - 4);
        const r = U.rng(77);
        for (let i = 0; i < 40; i++) R.clump(g, x0 + r() * (x1 - x0), roofY + r() * (wallTop - roofY - 6), 5 + r() * 4, 3 + r() * 2, r, { leaf: 4, leafSize: 1.8 });
        sign(g, 40, wallTop - 3, 64, 8, 'RESTAURANT ★', '#1f2a24', '#ffd890', '700 6px Georgia, serif');
        const tables = [[18, 72], [40, 86], [62, 72], [84, 86], [106, 72], [128, 86]];
        for (const [x, y] of tables) table(g, x, y);
        for (const [x, y] of [[18, 72], [62, 72], [106, 72]]) parasol(g, x, y, 11, '#f0ead8', '#3f6b4a');
        for (let i = 0; i < 6; i++) { const x = 12 + i * 24; g.fillStyle = '#3a3026'; g.fillRect(x - 0.4, 60, 0.8, 30); g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(x, 60, 1.4, 0, TAU); g.fill(); out.lights.push([x, 60, 10]); }
        out.lights.push([72, 42, 40], [72, wallTop + 1, 18, '#ffd890']);
      }
      out.h = -roofY + 22;
      return out;
    },
    toilettes(g, lv) {
      const out = { lights: [], smoke: [] };
      const x0 = 10, x1 = 86, roofY = -18, wallTop = 10, ground = 40;
      const door = (x, col, sym) => {
        g.fillStyle = col; g.fillRect(x, 18, 14, 22);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, 18, 14, 2);
        g.fillStyle = '#f2ead8'; g.beginPath(); g.arc(x + 7, 24, 1.6, 0, TAU); g.fill();
        if (sym === 'f') { g.beginPath(); g.moveTo(x + 7, 25.5); g.lineTo(x + 4.5, 31); g.lineTo(x + 9.5, 31); g.fill(); }
        else g.fillRect(x + 5.8, 25.6, 2.4, 5.4);
        g.fillStyle = '#c9b48a'; g.fillRect(x + 11, 30, 1.2, 1.2);
      };
      if (lv === 1) {
        woodWall(g, x0, wallTop, x1 - x0, ground - wallTop, P.wood[1], true);
        door(26, '#3a6ea5', 'm'); door(56, '#ad525d', 'f');
        g.fillStyle = '#8a9196'; g.fillRect(x0 - 4, roofY, x1 - x0 + 8, wallTop - roofY);
        g.strokeStyle = 'rgba(40,45,50,0.4)'; g.lineWidth = 0.6;
        for (let x = x0 - 2; x < x1 + 4; x += 4) { g.beginPath(); g.moveTo(x, roofY); g.lineTo(x, wallTop); g.stroke(); }
        sign(g, 38, roofY + 6, 20, 10, 'WC', '#f0ead8', '#2f4858');
      } else if (lv === 2) {
        stoneWall(g, x0, wallTop, x1 - x0, ground - wallTop, '#b4aa98');
        door(24, '#2f5a85', 'm'); door(58, '#9a3a4a', 'f');
        shingles(g, x0 - 5, roofY, x1 - x0 + 10, wallTop - roofY, '#9a5a3a', (roofY + wallTop) / 2);
        sign(g, 36, roofY + 4, 24, 11, 'WC', '#3f6b4a', '#f2e6c4');
        plant(g, 8, 46, 0.9); plant(g, 88, 46, 0.9);
        out.lights.push([48, 26, 14]);
      } else {
        g.fillStyle = '#ece6da'; g.fillRect(x0, wallTop, x1 - x0, ground - wallTop);
        door(22, '#2f4858', 'm'); door(60, '#7a3a4a', 'f');
        glass(g, 40, 18, 16, 12, true);
        g.fillStyle = '#4a5054'; g.fillRect(x0 - 4, roofY, x1 - x0 + 8, wallTop - roofY);
        g.fillStyle = R.pattern(g, 'grassLush'); g.fillRect(x0, roofY + 2, 44, wallTop - roofY - 4);
        const r = U.rng(12);
        for (let i = 0; i < 14; i++) R.clump(g, x0 + 4 + r() * 40, roofY + 3 + r() * 20, 4 + r() * 3, 2.5 + r() * 2, r, { leaf: 4, leafSize: 1.6 });
        g.fillStyle = '#2a3a5a'; g.fillRect(56, roofY + 4, 30, 18);
        g.strokeStyle = '#8aa0c0'; g.lineWidth = 0.4;
        for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(56 + i * 6, roofY + 4); g.lineTo(56 + i * 6, roofY + 22); g.stroke(); }
        g.beginPath(); g.moveTo(56, roofY + 13); g.lineTo(86, roofY + 13); g.stroke();
        plant(g, 8, 46, 1); plant(g, 88, 46, 1);
        out.lights.push([48, 24, 16]);
      }
      out.h = -roofY + 6;
      return out;
    },
    entree(g) {
      const out = { lights: [], smoke: [] };
      // place pavée
      g.fillStyle = R.pattern(g, 'paving'); g.save(); g.scale(0.5, 0.5); g.fillRect(0, 40, 288, 152); g.restore();
      // guérite à billets
      woodWall(g, 92, 18, 40, 30, P.wood[0], true);
      glass(g, 98, 24, 28, 12, true);
      shingles(g, 88, -2, 48, 20, '#6a4a32', 8);
      sign(g, 98, 2, 28, 8, 'BILLETS', '#e9dcbc', '#4a3220', '700 5px Georgia, serif');
      out.lights.push([112, 30, 14]);
      // piliers
      const pillar = (x) => {
        stoneWall(g, x, -56, 16, 96, '#9c9482');
        const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(255,240,210,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
        g.fillStyle = gr; g.fillRect(x, -56, 16, 96);
        g.fillStyle = '#7a7266'; g.fillRect(x - 2, -60, 20, 6);
        // torchère
        g.fillStyle = '#3a3026'; g.fillRect(x + 6, -70, 4, 10);
        g.fillStyle = '#ffcf7a'; g.beginPath(); g.ellipse(x + 8, -72, 3.5, 4.5, 0, 0, TAU); g.fill();
        out.lights.push([x + 8, -72, 26]);
      };
      pillar(6); pillar(70);
      // arche et enseigne
      g.fillStyle = '#5a3e28'; g.fillRect(2, -52, 88, 12);
      g.fillStyle = '#6e4c30'; g.fillRect(2, -52, 88, 3);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,18,8,0.4)'; g.fillRect(4 + i * 15, -50, 0.6, 9); }
      g.fillStyle = '#e8d7a8'; g.font = '700 9px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('DINOZOO', 46, -45.5);
      // feuilles grimpantes
      const r = U.rng(5);
      for (let i = 0; i < 6; i++) R.clump(g, 4 + r() * 84, -54 + r() * 6, 4 + r() * 3, 2 + r() * 1.5, r, { leaf: 4, leafSize: 1.6 });
      // tourniquets
      for (let i = 0; i < 3; i++) { g.fillStyle = '#5c6368'; g.fillRect(28 + i * 14, 24, 3, 12); g.fillStyle = '#b8bfc3'; g.fillRect(27 + i * 14, 24, 5, 1.5); }
      out.h = 76;
      return out;
    },
    poubelle(g) {
      const out = { lights: [], smoke: [] };
      g.fillStyle = '#3d5a3a'; g.beginPath(); g.moveTo(17, 22); g.lineTo(31, 22); g.lineTo(30, 38); g.lineTo(18, 38); g.closePath(); g.fill();
      const gr = g.createLinearGradient(17, 0, 31, 0); gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(17, 22, 14, 16);
      g.fillStyle = '#2a3a28'; g.beginPath(); g.ellipse(24, 22, 8, 2.6, 0, 0, TAU); g.fill();
      g.fillStyle = '#4e6e4a'; g.beginPath(); g.ellipse(24, 21, 7, 2, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.6; g.beginPath(); g.arc(24, 30, 2.2, 0, TAU * 0.8); g.stroke();
      out.h = 4;
      return out;
    },
    banc(g) {
      const out = { lights: [], smoke: [] };
      g.fillStyle = '#3a3026'; g.fillRect(9, 26, 2, 10); g.fillRect(37, 26, 2, 10);
      woodWall(g, 7, 18, 34, 8, '#9a7048', false);
      woodWall(g, 7, 27, 34, 6, '#a87e54', false);
      out.h = 2;
      return out;
    },
    lampadaire(g) {
      const out = { lights: [], smoke: [] };
      g.fillStyle = '#2f3438'; g.fillRect(23, -14, 2.4, 50);
      g.fillStyle = '#3f454a'; g.fillRect(20, 33, 8, 3);
      g.fillStyle = '#2f3438'; g.beginPath(); g.moveTo(19, -14); g.lineTo(29, -14); g.lineTo(27, -20); g.lineTo(21, -20); g.fill();
      g.fillStyle = '#ffe6a8'; g.fillRect(21, -14, 6, 6);
      g.fillStyle = '#2f3438'; g.fillRect(20, -8, 8, 1.5);
      out.lights.push([24, -11, 34]);
      out.h = 22;
      return out;
    },
    fontaine(g) {
      const out = { lights: [], smoke: [], fountain: [48, 44] };
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(50, 56, 40, 24, 0, 0, TAU); g.fill();
      stoneRing(g, 48, 50, 38, 22, 8);
      const wg = g.createRadialGradient(44, 44, 2, 48, 48, 34);
      wg.addColorStop(0, '#7fb2b0'); wg.addColorStop(1, '#2f6a72');
      g.fillStyle = wg; g.beginPath(); g.ellipse(48, 48, 32, 17, 0, 0, TAU); g.fill();
      stoneRing(g, 48, 40, 9, 5, 14);
      g.fillStyle = '#6fa6a6'; g.beginPath(); g.ellipse(48, 27, 7, 3.5, 0, 0, TAU); g.fill();
      out.lights.push([48, 40, 20]);
      out.h = 26;
      return out;
    }
  };
  function stoneRing(g, cx, cy, rx, ry, h) {
    g.fillStyle = '#8a8478';
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, cy - h); g.ellipse(cx, cy - h, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const gr = g.createLinearGradient(cx - rx, 0, cx + rx, 0); gr.addColorStop(0, 'rgba(255,240,210,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr; g.fill();
    g.fillStyle = '#b4ae9e'; g.beginPath(); g.ellipse(cx, cy - h, rx, ry, 0, 0, TAU); g.fill();
    g.fillStyle = '#9a9484'; g.beginPath(); g.ellipse(cx, cy - h, rx - 3, ry - 2, 0, 0, TAU); g.fill();
  }

  const cache = {};
  R.buildingSprite = function (type, level) {
    const key = type + level;
    if (cache[key]) return cache[key];
    const def = DZ.CONFIG.buildings[type];
    const w = def.w * T, h = def.h * T;
    let info;
    const above = { boutique: 46, restaurant: 42, toilettes: 26, entree: 80, poubelle: 8, banc: 4, lampadaire: 24, fontaine: 30 }[type] || 30;
    const sp = R.sprite(w + 16, h + above + 8, 8, above, (g) => { info = drawers[type](g, level); });
    sp.info = info;
    cache[key] = sp;
    return sp;
  };
  R.clearBuildings = function () { for (const k in cache) delete cache[k]; for (const k in encCache) delete encCache[k]; };

  /* ------------------------------------------------------------------
     Enclos : clôtures (arrière / avant) et décor intérieur
     ------------------------------------------------------------------ */
  const encCache = {};
  R.enclosureArt = function (b) {
    const key = b.id + '_' + b.level + '_' + b.type + '_' + b.x + '_' + b.y + '_' + b.w + '_' + b.h;
    if (encCache[key]) return encCache[key];
    const def = DZ.CONFIG.buildings[b.type];
    const W = b.w * T, H = b.h * T, lv = b.level;
    const art = { decor: [], lights: [], edges: b.parts ? unionEdges(b) : null };
    const kind = def.kind;
    const fh = kind === 'air' ? 0 : lv === 1 ? 15 : lv === 2 ? 30 : 26;
    const above = kind === 'air' ? 90 : 44;
    art.back = R.sprite(W + 16, H + above + 4, 8, above, (g) => fence(g, W, H, lv, kind, 'back', art));
    // le sprite avant couvre seulement la bande du bord avant (sauf le dôme de la volière)
    const fy0 = kind === 'air' ? -above : H - 70;
    art.front = R.sprite(W + 16, H + 12 - fy0, 8, -fy0, (g) => fence(g, W, H, lv, kind, 'front', art));
    art.frontY = H; // ordre de tri : bord avant
    // décor intérieur (coordonnées en cases)
    const r = U.rng(b.seed + lv * 7);
    const area = b.w * b.h;
    const inside = () => {
      for (let k = 0; k < 20; k++) {
        const p = { x: b.x + 0.7 + r() * (b.w - 1.4), y: b.y + 1.0 + r() * (b.h - 1.4) };
        if (!b.parts || (DZ.encSDF(b, p.x, p.y) < -0.8 && !(b.id > 0 && DZ.app && DZ.app.game.gatesOf(b).some((q) => p.x > q.x0 - 0.5 && p.x < q.x1 + 0.5 && p.y > q.y0 - 0.5 && p.y < q.y1 + 0.5)))) return p;
      }
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    };
    if (kind === 'land') {
      const rocks = Math.round(area / 9) + (lv >= 2 ? 1 : 0);
      for (let i = 0; i < rocks; i++) { const p = inside(); art.decor.push({ t: 'rock', x: p.x, y: p.y, size: r() < 0.3 && area > 12 ? 'L' : r() < 0.6 ? 'M' : 'S', sd: (r() * 1000) | 0 }); }
      const trees = Math.round(area / 10) + (lv === 3 ? 2 : lv === 2 ? 1 : 0);
      const kinds = lv === 1 ? ['fougere', 'buisson', 'cycas'] : ['fougere', 'cycas', 'palmier', 'araucaria', 'ginkgo', 'buisson'];
      for (let i = 0; i < trees; i++) { const p = inside(); const k = area < 10 ? U.pick(r, ['fougere', 'buisson', 'cycas']) : U.pick(r, kinds); art.decor.push({ t: 'tree', k, x: p.x, y: p.y, sd: (r() * 1e6) | 0, sc: 0.8 + r() * 0.3 }); }
    } else if (kind === 'air') {
      for (let i = 0; i < 2 + lv; i++) { const p = inside(); art.decor.push({ t: 'tree', k: i % 2 ? 'arbremort' : 'palmier', x: p.x, y: p.y, sd: (r() * 1e6) | 0, sc: 0.9 + r() * 0.3 }); }
      for (let i = 0; i < 2; i++) { const p = inside(); art.decor.push({ t: 'rock', x: p.x, y: p.y, size: 'M', sd: (r() * 1000) | 0 }); }
    } else if (kind === 'water' && lv === 1) {
      for (let i = 0; i < 5; i++) { const side = i % 4; const p = { x: side < 2 ? b.x + 0.4 + r() * (b.w - 0.8) : (side === 2 ? b.x + 0.35 : b.x + b.w - 0.35), y: side === 0 ? b.y + 0.45 : side === 1 ? b.y + b.h - 0.3 : b.y + 0.6 + r() * (b.h - 1.2) }; art.decor.push({ t: 'rock', x: p.x, y: p.y, size: 'M', sd: (r() * 1000) | 0 }); }
    }
    encCache[key] = art;
    return art;
  };

  /* Bords extérieurs d'un enclos réuni (en pixels, relatifs à l'emprise). */
  function unionEdges(b) {
    const inside = (x, y) => DZ.encParts(b).some(([px, py, pw, ph]) => x >= px && x < px + pw && y >= py && y < py + ph);
    const hz = [], vt = [];
    for (let y = b.y; y <= b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const a = inside(x, y - 1), c = inside(x, y);
      if (a !== c) hz.push([x, y, c ? 'top' : 'bottom']);
    }
    for (let x = b.x; x <= b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) if (inside(x - 1, y) !== inside(x, y)) vt.push([x, y]);
    const back = [], front = [];
    // fusion des segments contigus
    hz.sort((p, q) => p[1] - q[1] || (p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : p[0] - q[0]));
    for (let i = 0; i < hz.length;) {
      let j = i; while (j + 1 < hz.length && hz[j + 1][1] === hz[i][1] && hz[j + 1][2] === hz[i][2] && hz[j + 1][0] === hz[j][0] + 1) j++;
      const e = [(hz[i][0] - b.x) * T, (hz[i][1] - b.y) * T, (hz[j][0] + 1 - b.x) * T, (hz[i][1] - b.y) * T];
      (hz[i][2] === 'bottom' && hz[i][1] === b.y + b.h ? front : back).push(e);
      i = j + 1;
    }
    vt.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let i = 0; i < vt.length;) {
      let j = i; while (j + 1 < vt.length && vt[j + 1][0] === vt[i][0] && vt[j + 1][1] === vt[j][1] + 1) j++;
      back.push([(vt[i][0] - b.x) * T, (vt[i][1] - b.y) * T, (vt[i][0] - b.x) * T, (vt[j][1] + 1 - b.y) * T]);
      i = j + 1;
    }
    return { back, front };
  }

  function fence(g, W, H, lv, kind, side, art) {
    if (kind === 'air') return aviaryNet(g, W, H, lv, side);
    const fh = lv === 1 ? 15 : lv === 2 ? 30 : 26;
    const back = side === 'back';
    const edges = art.edges ? (back ? art.edges.back : art.edges.front) : back ? [[0, 0, W, 0], [0, 0, 0, H], [W, 0, W, H]] : [[0, H, W, H]];
    if (kind === 'water') return lagoonRim(g, W, H, lv, side, edges);
    for (const [ax, ay, bx, by] of edges) {
      const len = Math.hypot(bx - ax, by - ay);
      const horiz = ay === by;
      if (lv === 1) {
        // poteaux et lisses en bois
        const n = Math.max(2, Math.round(len / 16));
        const posts = [];
        for (let i = 0; i <= n; i++) posts.push([U.lerp(ax, bx, i / n), U.lerp(ay, by, i / n)]);
        for (const k of [0.35, 0.8]) {
          g.strokeStyle = '#6e4c30'; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(ax, ay - fh * k); g.lineTo(bx, by - fh * k); g.stroke();
          g.strokeStyle = 'rgba(255,230,190,0.25)'; g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(ax, ay - fh * k - 0.8); g.lineTo(bx, by - fh * k - 0.8); g.stroke();
        }
        for (const [x, y] of posts) {
          const gr = g.createLinearGradient(x - 2, 0, x + 2, 0); gr.addColorStop(0, '#a07650'); gr.addColorStop(1, '#5a3e26');
          g.fillStyle = gr; g.fillRect(x - 1.8, y - fh - 2, 3.6, fh + 2);
          g.fillStyle = '#b88c62'; g.beginPath(); g.ellipse(x, y - fh - 2, 1.8, 0.9, 0, 0, TAU); g.fill();
        }
      } else if (lv === 2) {
        // clôture électrifiée : pylônes acier, câbles, panneaux
        g.fillStyle = '#9a968c'; // semelle béton
        if (horiz) g.fillRect(ax, ay - 2, bx - ax, 3); else g.fillRect(ax - 1.5, ay, 3, by - ay);
        const n = Math.max(2, Math.round(len / 24));
        for (let k = 0; k < 5; k++) {
          const yy = fh * (0.15 + k * 0.19);
          g.strokeStyle = 'rgba(40,42,44,0.85)'; g.lineWidth = 0.5;
          g.beginPath(); g.moveTo(ax, ay - yy); g.lineTo(bx, by - yy); g.stroke();
          g.strokeStyle = 'rgba(220,230,235,0.35)'; g.lineWidth = 0.25;
          g.beginPath(); g.moveTo(ax, ay - yy - 0.4); g.lineTo(bx, by - yy - 0.4); g.stroke();
        }
        for (let i = 0; i <= n; i++) {
          const x = U.lerp(ax, bx, i / n), y = U.lerp(ay, by, i / n);
          const gr = g.createLinearGradient(x - 2, 0, x + 2, 0); gr.addColorStop(0, '#9aa2a8'); gr.addColorStop(1, '#3f454a');
          g.fillStyle = gr; g.fillRect(x - 1.6, y - fh - 3, 3.2, fh + 3);
          g.fillStyle = '#2f3438'; g.fillRect(x - 2.4, y - fh - 4, 4.8, 1.6);
          for (let k = 0; k < 5; k++) { g.fillStyle = '#d8d0b8'; g.fillRect(x - 0.8, y - fh * (0.15 + k * 0.19) - 0.6, 1.6, 1.2); }
          if (i % 2 === 1 && horiz) {
            // panneau danger
            g.fillStyle = '#e0b030'; g.fillRect(x + 3, y - fh * 0.62, 8, 7);
            g.fillStyle = '#1a1a1a';
            for (let s = 0; s < 3; s++) { g.beginPath(); g.moveTo(x + 3 + s * 3, y - fh * 0.62 + 7); g.lineTo(x + 4.5 + s * 3, y - fh * 0.62 + 7); g.lineTo(x + 3 + s * 3 + 3, y - fh * 0.62); g.lineTo(x + 1.5 + s * 3 + 3, y - fh * 0.62); g.fill(); }
            g.fillStyle = '#e0b030'; g.font = '700 4px sans-serif'; g.textAlign = 'center';
          }
          if (i % 3 === 0) { g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(x, y - fh - 4.5, 1, 0, TAU); g.fill(); if (!back || horiz) art.lights.push([x, y - fh - 4.5, 10]); }
        }
      } else {
        // murs de verre sur socle béton
        if (horiz) {
          g.fillStyle = '#a8a49a'; g.fillRect(ax, ay - 7, bx - ax, 8);
          g.fillStyle = '#c6c2b8'; g.fillRect(ax, ay - 7, bx - ax, 1.4);
          const gr = g.createLinearGradient(0, ay - fh, 0, ay - 7);
          gr.addColorStop(0, 'rgba(200,232,240,0.22)'); gr.addColorStop(1, 'rgba(160,205,215,0.32)');
          g.fillStyle = gr; g.fillRect(ax, ay - fh, bx - ax, fh - 7);
          g.fillStyle = 'rgba(255,255,255,0.32)';
          for (let x = ax + 6; x < bx; x += 22) { g.beginPath(); g.moveTo(x, ay - 8); g.lineTo(x + 5, ay - fh); g.lineTo(x + 8, ay - fh); g.lineTo(x + 3, ay - 8); g.fill(); }
          g.strokeStyle = '#4a5054'; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(ax, ay - fh); g.lineTo(bx, by - fh); g.stroke();
          const n = Math.max(2, Math.round(len / 32));
          for (let i = 0; i <= n; i++) { const x = U.lerp(ax, bx, i / n); g.fillStyle = '#3f454a'; g.fillRect(x - 1.2, ay - fh - 1, 2.4, fh - 6); }
        } else {
          g.fillStyle = '#a8a49a'; g.fillRect(ax - 2, ay, 4, by - ay);
          g.fillStyle = 'rgba(190,225,235,0.4)'; g.fillRect(ax - 0.8, ay - fh, 1.6, by - ay);
          g.fillStyle = '#3f454a';
          for (let y = ay; y <= by; y += 32) g.fillRect(ax - 1.2, y - fh, 2.4, fh);
        }
      }
    }
    // passerelle d'observation (niveau 3, côté avant)
    if (!back && lv === 3) {
      const y = H;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-2, y - 32, W + 4, 6);
      for (let x = 6; x < W; x += 30) { g.fillStyle = '#3f454a'; g.fillRect(x, y - 30, 2, 30); }
      g.save(); g.beginPath(); g.rect(-4, y - 40, W + 8, 10); g.clip();
      g.fillStyle = R.pattern(g, 'planks'); g.save(); g.scale(0.5, 0.5); g.fillRect(-8, (y - 40) * 2, (W + 8) * 2, 20); g.restore();
      g.restore();
      g.fillStyle = '#6e4c30'; g.fillRect(-4, y - 31, W + 8, 1.4);
      g.strokeStyle = '#3f454a'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-4, y - 46); g.lineTo(W + 4, y - 46); g.stroke();
      for (let x = -2; x < W + 4; x += 8) { g.beginPath(); g.moveTo(x, y - 46); g.lineTo(x, y - 40); g.stroke(); }
      for (let x = 10; x < W; x += 40) art.lights.push([x, y - 44, 12]);
    }
  }

  function lagoonRim(g, W, H, lv, side, edges) {
    const back = side === 'back';
    for (const [ax, ay, bx, by] of edges) {
      const horiz = ay === by;
      if (lv === 1) continue; // rochers naturels (décor)
      if (lv === 2 || back) {
        // garde-corps métallique
        g.strokeStyle = '#3f454a'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(ax, ay - 12); g.lineTo(bx, by - 12); g.stroke();
        g.lineWidth = 0.5; g.beginPath(); g.moveTo(ax, ay - 6); g.lineTo(bx, by - 6); g.stroke();
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / 12));
        for (let i = 0; i <= n; i++) { const x = U.lerp(ax, bx, i / n), y = U.lerp(ay, by, i / n); g.fillStyle = '#5c6368'; g.fillRect(x - 0.6, y - 12, 1.2, 12); }
      } else if (horiz) {
        // mur d'aquarium vitré : coupe de l'eau visible
        const gr = g.createLinearGradient(0, ay - 26, 0, ay);
        gr.addColorStop(0, 'rgba(70,140,160,0.85)'); gr.addColorStop(1, 'rgba(18,50,70,0.95)');
        g.fillStyle = gr; g.fillRect(ax, ay - 26, bx - ax, 26);
        const r = U.rng(3);
        for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(220,245,255,0.35)'; g.beginPath(); g.arc(ax + r() * (bx - ax), ay - 3 - r() * 22, 0.4 + r() * 0.9, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,0.12)';
        for (let x = ax + 10; x < bx; x += 40) { g.beginPath(); g.moveTo(x, ay); g.lineTo(x + 14, ay - 26); g.lineTo(x + 20, ay - 26); g.lineTo(x + 6, ay); g.fill(); }
        g.strokeStyle = '#3f454a'; g.lineWidth = 1.4; g.strokeRect(ax, ay - 26, bx - ax, 26);
        for (let x = ax; x <= bx; x += 48) { g.fillStyle = '#3f454a'; g.fillRect(x - 1, ay - 27, 2, 27); }
      }
    }
  }

  /* Dôme de volière : demi-ellipsoïde projeté (méridiens et parallèles).
     Moitié arrière dans le sprite arrière, moitié avant dans le sprite avant. */
  function aviaryNet(g, W, H, lv, side) {
    const back = side === 'back';
    const cx = W / 2, cy = H / 2, rx = W / 2, ry = H / 2, dh = 58 + W * 0.06;
    const P = (th, ph) => [cx + rx * Math.cos(ph) * Math.cos(th), cy + ry * Math.cos(ph) * Math.sin(th) - dh * Math.sin(ph)];
    const th0 = back ? Math.PI : 0;
    const col = lv === 1 ? '214,196,150' : lv === 2 ? '44,50,56' : '185,222,236';
    const alpha = (back ? 0.6 : 1) * (lv === 3 ? 0.55 : 0.78);
    const curve = (fn, n) => { g.beginPath(); for (let k = 0; k <= n; k++) { const p = fn(k / n); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); };
    if (lv === 3) {
      // verre teinté et reflet
      g.fillStyle = back ? 'rgba(200,235,245,0.05)' : 'rgba(200,235,245,0.09)';
      g.beginPath();
      for (let k = 0; k <= 16; k++) { const p = P(th0 + Math.PI * k / 16, 0); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
      for (let k = 0; k <= 12; k++) { const p = P(back ? 0 : Math.PI, Math.PI / 2 * k / 12); g.lineTo(p[0], p[1]); }
      for (let k = 12; k >= 0; k--) { const p = P(back ? Math.PI : 0, Math.PI / 2 * k / 12); g.lineTo(p[0], p[1]); }
      g.fill();
      if (!back) {
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.beginPath();
        for (let k = 0; k <= 10; k++) { const p = P(Math.PI * 0.72, Math.PI / 2 * k / 10 * 0.9); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
        for (let k = 10; k >= 0; k--) { const p = P(Math.PI * 0.62, Math.PI / 2 * k / 10 * 0.9); g.lineTo(p[0], p[1]); }
        g.fill();
      }
    }
    // filet fin (niveau 1 et 2)
    if (lv < 3) {
      g.strokeStyle = `rgba(${col},${alpha * 0.4})`; g.lineWidth = 0.45;
      for (let i = 0; i <= 40; i++) { const th = th0 + Math.PI * i / 40; curve((t) => P(th, t * Math.PI / 2), 10); }
      for (let k = 1; k < 12; k++) { const ph = k / 12 * Math.PI / 2; curve((t) => P(th0 + Math.PI * t, ph), 20); }
    }
    // armature principale
    g.strokeStyle = `rgba(${col},${alpha})`;
    g.lineWidth = lv === 1 ? 1.3 : lv === 2 ? 1.6 : 1.2;
    const nM = lv === 3 ? 12 : 8;
    for (let i = 0; i <= nM; i++) { const th = th0 + Math.PI * i / nM; curve((t) => P(th, t * Math.PI / 2), 14); }
    for (let k = 0; k < 4; k++) { const ph = k / 4 * Math.PI / 2; curve((t) => P(th0 + Math.PI * t, ph), 24); }
    if (lv === 3) { // facettes triangulaires
      g.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) for (let i = 0; i < nM; i++) {
        const a = P(th0 + Math.PI * i / nM, k / 4 * Math.PI / 2), b = P(th0 + Math.PI * (i + 1) / nM, (k + 1) / 4 * Math.PI / 2);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    }
    // mâts / socles
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const p = P(th0 + Math.PI * f, 0);
      if (lv === 1) { g.fillStyle = '#6e4c30'; g.fillRect(p[0] - 1.6, p[1] - 30, 3.2, 30); g.fillStyle = '#8a6240'; g.fillRect(p[0] - 1.6, p[1] - 30, 1.2, 30); }
      else { g.fillStyle = lv === 2 ? '#4a5054' : '#9a968c'; g.fillRect(p[0] - 3, p[1] - 4, 6, 5); }
    }
  }

  /* Sprites pour les vignettes du menu. */
  R.buildingThumb = function (type, w, h) {
    const c = R.canvas(w * 2, h * 2), g = c.getContext('2d');
    g.scale(2, 2);
    const def = DZ.CONFIG.buildings[type];
    if (def.cat === 'enclos') {
      const fake = { id: -1, type, w: def.w, h: def.h, level: 1, seed: 3, x: 0, y: 0 };
      const art = R.enclosureArt(fake);
      const s = Math.min(w / (def.w * T + 16), h / (def.h * T + 60));
      g.translate(w / 2 - def.w * T * s / 2, h - def.h * T * s - 4);
      g.scale(s, s);
      g.fillStyle = def.kind === 'water' ? '#2f6a72' : R.pattern(g, 'grass');
      g.fillRect(0, 0, def.w * T, def.h * T);
      if (def.kind === 'water') { g.fillStyle = 'rgba(200,190,160,0.9)'; g.lineWidth = 6; g.strokeStyle = '#b8a888'; g.strokeRect(3, 3, def.w * T - 6, def.h * T - 6); }
      R.draw(g, art.back, 0, 0);
      R.draw(g, art.front, 0, 0);
      delete encCache[fake.id + '_1_' + type];
    } else if (['arbre', 'palmier', 'fougere'].includes(type)) {
      const kind = type === 'arbre' ? 'araucaria' : type;
      const t = R.treeSprite(kind, 1);
      const sh = t.whole ? t.whole.h : t.height + 30;
      const s = Math.min(1, h / (sh + 6));
      g.translate(w / 2, h - 3); g.scale(s, s);
      if (t.whole) R.draw(g, t.whole, 0, 0); else { R.draw(g, t.trunk, 0, 0); R.draw(g, t.crown, t.crownX, t.crownY); }
    } else {
      const sp = R.buildingSprite(type, 1);
      const s = Math.min(w / sp.w, h / sp.h);
      g.translate(w / 2 - sp.w * s / 2, h / 2 - sp.h * s / 2);
      g.scale(s, s);
      g.drawImage(sp.c, 0, 0, sp.w, sp.h);
    }
    return c;
  };
})();
