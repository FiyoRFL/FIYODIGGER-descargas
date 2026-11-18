// FIYODIGGER VINILO (LAB) - la galleta (etiqueta central), dibujada en un canvas que despues es textura.
// Basado en Vinyl GL (https://github.com/rauchg/vinyl, src/label.js, commit bcc9264), licencia MIT,
// Copyright (c) 2026 Guillermo Rauch. Ver LICENSE-vinyl-gl.txt.
// Se conserva la tecnica del papel (manchas en tres escalas, fibras, grano, prensado alrededor del eje).
// Cambios para FIYODIGGER: dos galletas
//  - fromImage: la imagen del disco (galleta real, portada o miniatura) recortada en circulo, con el grano del papel encima
//  - fromText: galleta propia, papel rojo FIYODIGGER con tinta crema: logo, artista, disco, tema, sello y año
// Sin desgaste, rayones ni polvo (quedan para mas adelante).
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const S = 1024, C = S / 2;                    // la galleta mide 100 mm: unos 10 px por mm
  const RC = 'RC, "Arial Narrow", Arial, sans-serif';
  const RED = '#a8321f', INK = '#ece4cf';       // papel rojo DIG y tinta crema (los colores de la carcasa)

  function rng(seed) {                          // de Vinyl GL (src/dsp.js)
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sheet = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  function noise(n, R) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d'), d = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = 28 + R() * 200; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
    return c;
  }
  const stretch = (x, tex) => { const m = S / tex.width; x.drawImage(tex, -m, -m, S + 2 * m, S + 2 * m); };

  // papel: el de Vinyl GL, en el color que se pida. Se hace una vez por color.
  const papers = {};
  function paper(base) {
    if (papers[base]) return papers[base];
    const c = sheet(), x = c.getContext('2d'), R = rng(41);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.globalCompositeOperation = 'overlay';     // manchas suaves en tres escalas
    for (const [n, a] of [[5, 0.22], [19, 0.16], [77, 0.12]]) { x.globalAlpha = a; stretch(x, noise(n, R)); }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 1500; i++) {            // fibras
      const px = R() * S, py = R() * S, len = 5 + R() * 30, a = R() * TAU, b = a + (R() - 0.5) * 1.2;
      x.globalAlpha = 1; x.lineWidth = 0.5 + R() * 0.9;
      x.strokeStyle = R() < 0.65 ? `rgba(255,250,240,${0.03 + R() * 0.06})` : `rgba(0,0,0,${0.05 + R() * 0.09})`;
      x.beginPath(); x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(b) * len * 0.5, py + Math.sin(b) * len * 0.5, px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
    }
    const img = x.getImageData(0, 0, S, S), p = img.data;
    for (let i = 0; i < p.length; i += 4) { const g = (R() + R() - 1) * 12; p[i] += g; p[i + 1] += g; p[i + 2] += g * 0.92; }   // grano
    x.putImageData(img, 0, 0);
    const g = x.createRadialGradient(C, C, C * 0.4, C, C, C);   // un poco mas oscuro hacia el borde
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,.08)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return (papers[base] = c);
  }

  // terminacion comun: anillo de prensado alrededor del eje y el agujero
  function finish(x) {
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.lineWidth = 3.5; x.strokeStyle = 'rgba(0,0,0,.30)'; x.beginPath(); x.arc(C, C, 158, 0, TAU); x.stroke();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.arc(C, C, 162, 0, TAU); x.stroke();
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.arc(C, C, 508, 0, TAU); x.stroke();   // donde la galleta toca el vinilo
    x.fillStyle = '#050505'; x.beginPath(); x.arc(C, C, 38, 0, TAU); x.fill();
  }

  // texto a lo largo del borde de abajo, centrado
  function arcText(k, text, r, gap) {
    const chars = [...text], adv = chars.map((ch) => k.measureText(ch).width + gap);
    let th = Math.PI / 2 + adv.reduce((a, b) => a + b, 0) / r / 2;
    chars.forEach((ch, i) => {
      th -= adv[i] / r / 2;
      k.save(); k.translate(C + r * Math.cos(th), C + r * Math.sin(th)); k.rotate(th - Math.PI / 2); k.fillText(ch, 0, 0); k.restore();
      th -= adv[i] / r / 2;
    });
  }
  // ancho disponible a una altura dy del centro, dentro de un circulo de radio rad
  const chord = (dy, rad) => 2 * Math.sqrt(Math.max(0, rad * rad - dy * dy));

  // img: imagen cargada; crop: {x, y, w, h} cuadrado de la imagen que va al circulo
  function fromImage(img, crop) {
    const c = sheet(), x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, S, S);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, S, S);
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.35; x.drawImage(paper('#808080'), 0, 0);   // el grano del papel, sin cambiar el color
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    const g = x.createRadialGradient(C, C, C * 0.55, C, C, C);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.22)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    finish(x);
    return c;
  }

  // info: { artist, title, track, trackNo, label, year, country }; logo: el logo de FIYODIGGER (opcional)
  function fromText(info, logo) {
    const c = sheet(), x = c.getContext('2d');
    x.drawImage(paper(RED), 0, 0);
    const layer = sheet(), k = layer.getContext('2d');
    k.fillStyle = k.strokeStyle = INK; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.lineWidth = 3; k.beginPath(); k.arc(C, C, 489, 0, TAU); k.stroke();
    k.lineWidth = 1.2; k.beginPath(); k.arc(C, C, 446, 0, TAU); k.stroke();
    const up = (s) => String(s || '').toUpperCase().trim();

    if (logo && logo.naturalWidth) {
      const w = 470, h = w * logo.naturalHeight / logo.naturalWidth;
      k.drawImage(logo, C - w / 2, C - 282 - h / 2, w, h);
    } else { k.font = `700 64px ${RC}`; k.fillText('FIYODIGGER', C, C - 282, 470); }
    k.font = `700 22px ${RC}`; k.letterSpacing = '6px';
    k.fillText('DIGGING CENTER · RFL', C, C - 214, 400);
    k.font = `700 26px ${RC}`; k.letterSpacing = '5px';
    k.fillText('STEREO', C - 300, C - 18); k.fillText(info.side ? 'SIDE A' : 'LADO A', C - 300, C + 18);
    k.fillText('33⅓', C + 300, C - 18); k.fillText('RPM', C + 300, C + 18);
    k.letterSpacing = '0px';

    const lines = [
      [up(info.artist), `700 50px ${RC}`, 214],
      [up(info.title), `400 38px ${RC}`, 266],
      [info.track ? (info.trackNo ? 'A' + info.trackNo + '. ' : '') + up(info.track) : '', `400 30px ${RC}`, 316],
    ];
    for (const [t, font, dy] of lines) {
      if (!t) continue;
      k.font = font; k.fillText(t.length > 60 ? t.slice(0, 58) + '…' : t, C, C + dy, chord(dy + 20, 430) - 40);
    }
    const foot = [up(info.label), info.year, up(info.country)].filter(Boolean).join('  ·  ');
    if (foot) { k.font = `700 19px ${RC}`; arcText(k, foot.length > 70 ? foot.slice(0, 68) + '…' : foot, 467, 3); }
    x.globalAlpha = 0.94; x.drawImage(layer, 0, 0);
    finish(x);
    return c;
  }

  const FDV = window.FDV = window.FDV || {};
  FDV.label = { fromImage, fromText, SIZE: S };
})();
