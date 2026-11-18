// FIYODIGGER VINILO (LAB): la bandeja de Vinyl GL en lugar de la tele.
// La bandeja (deck.js), los shaders y la galleta salen de Vinyl GL (https://github.com/rauchg/vinyl, commit bcc9264),
// licencia MIT, Copyright (c) 2026 Guillermo Rauch. Ver LICENSE-vinyl-gl.txt.
// Aca se arma lo propio de FIYODIGGER: la espiral con una banda por tema (la que suena con su onda real),
// la galleta del disco que se esta escuchando y el brazo: se apoya en el tema que suena y avanza con el tema.
// El brazo es solo visual (sin fisica ni lectura del surco). No suena nada aca: el audio sigue siendo
// el reproductor de siempre; esto solo mira su estado.
//
// Uso (desde index.html):  const api = FDV.mount(columna, { mb, pos, onVideo, onFail })   columna = la del video (.vcol): el panel VINYL DECK la tapa entera
//   api.show(bool)      muestra u oculta la bandeja (oculta no dibuja nada)
//   api.state(n)        estado de YouTube: 1 suena (gira), 2 pausa (frena, aguja apoyada), 3 cargando (sigue como estaba),
//                       0 / -1 / 5 terminado o detenido (frena y el brazo vuelve a su apoyo)
//   api.sync({ rec, idx, vid, peaks })   disco y tema actuales: galleta, surcos y leyenda
//   opts.pos()          avance del tema (0..1), para que la aguja camine hacia adentro
(function () {
  'use strict';
  const FDV = window.FDV = window.FDV || {};
  const LB = FDV.label, GEO = FDV.geo, TAU = GEO.TAU;
  const R_LEADIN = GEO.R_LEADIN, R_LOCK = GEO.R_LOCK;
  const W33 = 100 / 3 / 60 * TAU;               // 33 1/3 vueltas por minuto, en radianes por segundo
  const LAB_K = 0.42;                           // ganancia de la galleta: con esto las portadas salen con sus colores
  const CAM = { el: 1.3, az: 0, at: [0.0425, 0.0, -0.03] };   // camara: desde arriba, como parado enfrente (se centra sola, ver fit)
  const EASE = 0.35;                            // segundos que tarda en arrancar o frenar el plato (solo para que no salte)
  const ARM_T = 0.5;                            // segundos que tarda el brazo en ir y venir
  const LIFT = 5e-3;                            // altura de la aguja levantada (m)

  // ---------- surcos ----------
  // Una banda por tema (como un LP de verdad), separadas por surcos lisos. La banda del tema que suena
  // usa su onda (peaks, 0..1); las demas, una modulacion inventada pero fija para cada disco.
  function grooves(nTracks, cur, peaks, seed) {
    const n = Math.max(1, Math.min(8, nTracks | 0)), cols = 128;
    const R_END = 0.064, GAP_W = 0.0016, LEAD = 1.5, GAP = 1.5, OUT = 3, PER = 55;
    const bandW = (R_LEADIN - 0.0006 - R_END - (n - 1) * GAP_W) / n;
    // tramos de la espiral, de afuera hacia adentro: [radio inicial, radio final, vueltas, tipo, tema]
    const segs = []; let r = R_LEADIN;
    segs.push([r, r - 0.0006, LEAD, 'liso', -1]); r -= 0.0006;
    for (let i = 0; i < n; i++) {
      segs.push([r, r - bandW, PER, 'tema', i]); r -= bandW;
      if (i < n - 1) { segs.push([r, r - GAP_W, GAP, 'liso', -1]); r -= GAP_W; }
    }
    segs.push([r, R_LOCK, OUT, 'liso', -1]);
    let acc = 0; for (const s of segs) { s.push(acc); acc += s[2]; }
    const revEnd = acc, rLo = R_LOCK - 0.002, rHi = R_LEADIN + 0.002, lut = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const rr = rLo + (rHi - rLo) * i / 2047;
      if (rr >= R_LEADIN) { lut[i] = 0; continue; }
      if (rr <= R_LOCK) { lut[i] = revEnd; continue; }
      const s = segs.find((q) => rr <= q[0] && rr >= q[1]) || segs[segs.length - 1];
      lut[i] = s[5] + (s[0] - rr) / (s[0] - s[1]) * s[2];
    }
    const rows = Math.ceil(revEnd) + 2, vis = new Uint8Array(rows * cols);
    let a = (seed >>> 0) || 7;
    const R = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    const fake = []; for (let i = 0; i < n; i++) { const ph = R() * TAU, f = 1 + R() * 3; fake.push((t) => 0.46 + 0.16 * Math.sin(ph + t * f * TAU) + 0.06 * Math.sin(t * 37 + ph)); }
    for (let row = 0; row < rows; row++) {
      const s = segs.find((q) => row + 0.5 >= q[5] && row + 0.5 < q[5] + q[2]);
      if (!s || s[3] !== 'tema') continue;
      for (let c = 0; c < cols; c++) {
        const t = Math.min(0.9999, Math.max(0, (row - s[5] + c / cols) / s[2]));
        let v;
        if (s[4] === cur && peaks && peaks.length) v = 0.34 + 0.62 * Math.pow(Math.min(1, peaks[Math.floor(t * peaks.length)] || 0), 0.8);   // piso: los surcos se ven siempre, aunque el tema este bajo
        else v = fake[s[4]](t) + (R() - 0.5) * 0.06;
        vis[row * cols + c] = Math.max(77, Math.min(255, Math.round(v * 255)));
      }
    }
    const bands = segs.filter((q) => q[3] === 'tema').map((q) => [q[0], q[1]]);
    return { lut, rLo, rHi, revEnd, vis, cols, rows, bands };
  }

  // ---------- imagenes de la galleta ----------
  const imgMemo = new Map();                    // url -> Promise<Image | null>
  function loadImg(url) {
    if (!url) return Promise.resolve(null);
    url = String(url).replace(/^http:/, 'https:');
    if (imgMemo.has(url)) return imgMemo.get(url);
    const p = new Promise((res) => {
      const im = new Image(); let done = false;
      const end = (v) => { if (!done) { done = true; clearTimeout(t); res(v); } };
      const t = setTimeout(() => end(null), 9000);
      im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      im.onload = () => end(im.naturalWidth > 16 ? im : null); im.onerror = () => end(null);
      im.src = url;
    });
    imgMemo.set(url, p);
    if (imgMemo.size > 60) imgMemo.delete(imgMemo.keys().next().value);
    return p;                                   // si fallo, queda anotado: no se insiste en esta sesion
  }
  const square = (im) => { const s = Math.min(im.naturalWidth, im.naturalHeight); return { x: (im.naturalWidth - s) / 2, y: (im.naturalHeight - s) / 2, w: s, h: s }; };
  // miniatura de YouTube (hqdefault 4:3 con bandas negras): el cuadrado del medio
  const ytCrop = (im) => { const s = im.naturalHeight * 0.75; return { x: (im.naturalWidth - s) / 2, y: (im.naturalHeight - s) / 2, w: s, h: s }; };
  // foto del disco (Cover Art Archive, tipo Medium): si es el vinilo entero, se recorta la galleta del medio;
  // si es un primer plano de la etiqueta, va entera
  function mediumCrop(im) {
    const sq = square(im);
    try {
      const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, sq.x, sq.y, sq.w, sq.h, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n).data, ring = (r0, r1) => {
        let s = 0, k = 0;
        for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
          const r = Math.hypot(xx + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
          if (r >= r0 && r < r1) { const i = (y * n + xx) * 4; s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; k++; }
        }
        return k ? s / k : 0;
      };
      const groove = ring(0.5, 0.85), lab = ring(0.12, 0.3);
      if (groove < 70 && lab > groove + 25) { const s = sq.w * 0.335; return { x: sq.x + (sq.w - s) / 2, y: sq.y + (sq.h - s) / 2, w: s, h: s }; }
    } catch (e) { /* imagen sin permiso de lectura: va entera */ }
    return sq;
  }

  // galleta real en Cover Art Archive, buscando el disco de Discogs en MusicBrainz (una consulta, en segundo plano)
  const caaMemo = new Map();                    // id de Discogs -> Promise<url | null>
  function caaMedium(id, mb) {
    if (!id || typeof mb !== 'function') return Promise.resolve(null);
    if (caaMemo.has(id)) return caaMemo.get(id);
    const p = (async () => {
      const u = await mb('url?resource=' + encodeURIComponent('https://www.discogs.com/release/' + id) + '&inc=release-rels');
      const rel = u && (u.relations || []).find((r) => r.release && r.release.id);
      if (!rel) return null;
      const r = await fetch('https://coverartarchive.org/release/' + rel.release.id, { referrerPolicy: 'no-referrer' }).catch(() => null);
      if (!r || !r.ok) return null;
      const j = await r.json().catch(() => null), im = j && (j.images || []).find((x) => (x.types || []).includes('Medium'));
      return im ? ((im.thumbnails && (im.thumbnails['500'] || im.thumbnails.large)) || im.image || null) : null;
    })().catch(() => null);
    caaMemo.set(id, p);
    if (caaMemo.size > 200) caaMemo.delete(caaMemo.keys().next().value);
    return p;
  }

  let logo = null;
  function getLogo() {
    if (logo) return logo;
    logo = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'logo.png'; });
    return logo;
  }

  // ---------- estilos de la pantalla del vinilo ----------
  function css() {
    if (document.getElementById('vnlCss')) return;
    const s = document.createElement('style'); s.id = 'vnlCss';
    s.textContent = '.has-vnl{position:relative}.vnl-on>.vctl,.vnl-on>.crt{visibility:hidden}'
      + '.vnl{position:absolute;inset:-6px -10px 0;z-index:3;display:none;flex-direction:column;gap:2px}.vnl.on{display:flex}'
      + '.vnl .vhd{display:flex;align-items:center;gap:10px;height:40px;padding:0 10px 0 12px;font:700 19px RC,"Arial Narrow",Arial,sans-serif;letter-spacing:2px;color:var(--label,#d9d4c3);text-transform:uppercase;text-shadow:0 1px 0 #000,0 -1px 0 rgba(255,255,255,.12)}'
      + '.vnl .vhd i{width:11px;height:11px;border-radius:50%;background:#4a1a14;box-shadow:inset 0 1px 1px #000,0 1px 0 rgba(255,255,255,.15)}.vnl.spin .vhd i{background:var(--hot,#e0412f);box-shadow:0 0 8px var(--hot,#e0412f)}'
      + '.vnl .vhd em{font:16px LCD,monospace;font-style:normal;letter-spacing:1px;color:var(--lcd,#a9bd8c);text-shadow:0 0 6px rgba(169,189,140,.35)}'
      + '.vnl .vhd b{flex:1;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.vnl .vsilk{position:absolute;inset:0;pointer-events:none}.vnl .vsilk span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:700 8px/1 RC,"Arial Narrow",Arial,sans-serif;letter-spacing:1.2px;color:rgba(214,210,198,.62);text-transform:uppercase}'
      + '.vnl .vlogo{position:absolute;object-fit:contain;opacity:.92;pointer-events:none}'
      + '.vnl .vbtn{position:absolute;padding:0;border:0;border-radius:3px;background:transparent;cursor:pointer}.vnl .vbtn:hover{box-shadow:0 0 0 1px rgba(224,65,47,.55),0 0 10px rgba(224,65,47,.35)}.vnl .vbtn:active{background:rgba(0,0,0,.25)}.vnl .vbtn:focus-visible{outline:2px solid var(--hot,#e0412f);outline-offset:2px}'
      + '.vnl .vst{position:relative;flex:1;min-height:0}'
      + '.vnl canvas{display:block;width:100%;height:100%;touch-action:none;filter:drop-shadow(0 14px 14px rgba(0,0,0,.75)) drop-shadow(0 3px 3px rgba(0,0,0,.6))}'
      + '.vnl .vcap{padding:0 12px 0 33px;margin-top:-6px;font:400 14px/1.2 RC,"Arial Narrow",Arial,sans-serif;letter-spacing:.8px;color:var(--label,#d9d4c3);opacity:.75;text-transform:uppercase;text-shadow:0 1px 0 #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}'
      + '.vnl .vcap b{font-weight:700}.vnl .vcap span::before{content:" · "}.vnl .vcap span:empty::before{content:none}'
      + 'html.mob .vnl{inset:0}html.mob .vnl .vhd{height:34px;font-size:16px}html.mob .vnl .vsilk span{font-size:6px;letter-spacing:.8px}html.mob .vnl .vcap{font-size:12px}';
    document.head.append(s);
  }

  // ---------- montaje ----------
  FDV.mount = function (screen, opts = {}) {
    css();
    const box = document.createElement('div'); box.className = 'vnl';
    const hd = document.createElement('div'); hd.className = 'vhd'; hd.innerHTML = '<i></i><b>VINYL DECK</b><em></em>';
    const st = document.createElement('div'); st.className = 'vst';
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
    const cap = document.createElement('div'); cap.className = 'vcap'; cap.innerHTML = '<b></b><span></span>';
    const silk = document.createElement('div'); silk.className = 'vsilk'; silk.setAttribute('aria-hidden', 'true');
    st.append(cv, silk); box.append(hd, cap, st);
    screen.classList.add('has-vnl'); screen.append(box);
    let scene;
    try { scene = new FDV.Deck(cv); } catch (e) { box.remove(); throw e; }
    // sin placa de video de verdad (dibujo por software) se veria trabado: no se activa
    { const gl = scene.gl, ext = gl.getExtension('WEBGL_debug_renderer_info'), rn = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      if (!window.__fdvAllowSoft && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn)) { box.remove(); throw new Error('LENTO: ' + rn); } }

    const DZ = GEO.DECK_Z, call = (f, ...a) => { try { if (typeof opts[f] === 'function') opts[f](...a); } catch (e) { /* el reproductor sigue igual */ } };
    // ---- estado de la bandeja (todo visual; el sonido lo maneja el reproductor de siempre) ----
    let visible = false, target = 0, speed = 0, thp = Math.random() * TAU, last = 0, raf = 0, dead = false, dirty = true;
    let armOn = false, al = GEO.ALPHA_REST, zt = LIFT, bands = null, cur = 0;   // brazo: apoyado o no, angulo, altura de la aguja
    let hand = null, hold = null, disc = null;   // disc: vinilo agarrado con la mano                // hand: brazo agarrado con el mouse; hold: aguja recien soltada (hasta que el reproductor salte)
    let rpm = 33.3333, pitch = 0, faderDrag = null, lastRate = 1, ytState = -1;
    const press = { bStart: 0, b33: 0, b45: 0, bBackL: 0, bBackR: 0 };
    // fluidez medida mientras gira: si va lento baja la resolucion; si sigue lento se apaga (onFail 'LENTO')
    const perf = { skip: 90, dts: [], stage: 0, done: !!window.__fdvAllowSoft };
    let pxCap = 1.1e6;
    let recKey = null, trackKey = null, peaksRef = null, labelLevel = -1, labelTok = 0, labelTxt = null;
    const fail = (e) => { if (dead) return; dead = true; cancelAnimationFrame(raf); box.remove(); if (opts.onFail) opts.onFail(e); };
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('CONTEXTO PERDIDO'); });
    const rate = () => (rpm / 33.3333) * (1 + pitch);
    const sendRate = () => { const r = Math.round(rate() * 100) / 100; if (r !== lastRate) { lastRate = r; call('onRate', r); } };

    // ---- botones de la bandeja: botones de verdad (mouse, teclado, lector de pantalla) sobre los botones 3D ----
    // [pieza 3D, x0, y0, x1, y1, z arriba, texto para el lector, accion]
    const BTN = [
      ['bStart', -0.139, -0.184, -0.097, -0.158, DZ + 0.004, 'Start / Stop', () => call('onStartStop')],
      ['b33', -0.088, -0.186, -0.066, -0.174, DZ + 0.003, '33 RPM', () => { rpm = 33.3333; sendRate(); }],
      ['b45', -0.060, -0.186, -0.038, -0.174, DZ + 0.003, '45 RPM', () => { rpm = 45; sendRate(); }],
      ['bBackL', -0.125, 0.172, -0.085, 0.1885, DZ + 0.011, 'Ver el video', () => call('onVideo')],
      ['bBackR', 0.130, 0.172, 0.170, 0.1885, DZ + 0.011, 'Dig: otro disco', () => call('onDig')],
    ];
    const btnEl = BTN.map(([k, , , , , , label, act]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'vbtn'; b.title = label; b.setAttribute('aria-label', label);
      b.onclick = () => { press[k] = 1; kick(); setTimeout(() => { press[k] = 0; kick(); }, 140); act(); kick(); };
      st.append(b); return b;
    });
    const SILK = [
      ['START · STOP', -0.110, -0.151], ['33', -0.077, -0.167], ['45', -0.049, -0.167],
      ['VIDEO', -0.105, 0.164], ['DIG', 0.150, 0.164], ['PITCH', 0.244, -0.040], ['+12', 0.2575, -0.165], ['0', 0.2575, -0.110], ['-12', 0.2575, -0.055],
    ];
    silk.innerHTML = SILK.map(([t]) => '<span>' + t + '</span>').join('');
    const LOGO = [0.118, -0.189, 0.222, -0.133];   // logo FIYO RFL impreso en la bandeja (x0, y0, x1, y1), donde no lo tapa el plato
    const logo = document.createElement('img'); logo.className = 'vlogo'; logo.alt = ''; logo.src = 'vinyl/fiyo-rfl.webp'; silk.append(logo);

    // ---- camara: se centra y se agranda sola para que la bandeja entre justa en el lugar que haya ----
    const FIT = [];                               // puntos que tienen que quedar a la vista: la base, la torre y el contrapeso
    for (const x of [-0.185, 0.27]) for (const y of [-0.19, 0.19]) for (const z of [-0.062, DZ]) FIT.push([x, y, z]);
    FIT.push([GEO.PIVOT_X - 0.098 * Math.cos(GEO.ALPHA_REST), GEO.PIVOT_Y - 0.098 * Math.sin(GEO.ALPHA_REST), GEO.PIVOT_H], [GEO.PIVOT_X, GEO.PIVOT_Y, 0.048]);
    let fitKey = '', fitCam = null;
    function fit(asp) {
      const k = asp.toFixed(3); if (k === fitKey) return fitCam;
      const t = Math.tan(GEO.FOV / 2); let at = CAM.at.slice(), dist = 1;
      for (let it = 0; it < 8; it++) {
        const ce = Math.cos(CAM.el), eye = [at[0] + dist * ce * Math.sin(CAM.az), at[1] - dist * ce * Math.cos(CAM.az), at[2] + dist * Math.sin(CAM.el)];
        const v = FDV.G.lookAt(eye, at), vp = FDV.G.mul(FDV.G.perspective(GEO.FOV, asp, 0.05, 150), v.m);
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        for (const [x, y, z] of FIT) {
          const W = vp[3] * x + vp[7] * y + vp[11] * z + vp[15], X = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / W, Y = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / W;
          x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
        }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.94;
        at = [0, 1, 2].map((i) => at[i] + cx * dist * t * asp * v.right[i] + cy * dist * t * v.up[i] * 0.9);
        dist *= s;
      }
      fitKey = k; fitCam = { at, dist }; return fitCam;
    }
    function proj(x, y, z) {
      const m = scene.cam && scene.cam.vp; if (!m) return null;
      const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], W = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(X / W * 0.5 + 0.5) * cv.clientWidth, (0.5 - Y / W * 0.5) * cv.clientHeight];
    }
    function layout() {
      { const a = proj(LOGO[0], LOGO[3], DZ), b = proj(LOGO[2], LOGO[1], DZ); if (a && b) Object.assign(logo.style, { left: Math.min(a[0], b[0]) + 'px', top: Math.min(a[1], b[1]) + 'px', width: Math.abs(b[0] - a[0]) + 'px', height: Math.abs(b[1] - a[1]) + 'px' }); }
      SILK.forEach(([t, x, y], i) => { const q = proj(x, y, DZ), e = silk.children[i]; if (q) { e.style.left = q[0] + 'px'; e.style.top = q[1] + 'px'; } });
      BTN.forEach(([, x0, y0, x1, y1, z], i) => {
        const a = proj(x0, y1, z), b = proj(x1, y0, z);
        if (a && b) Object.assign(btnEl[i].style, { left: Math.min(a[0], b[0]) - 3 + 'px', top: Math.min(a[1], b[1]) - 3 + 'px', width: Math.abs(b[0] - a[0]) + 6 + 'px', height: Math.abs(b[1] - a[1]) + 6 + 'px' });
      });
    }

    // ---- brazo y fader con el mouse o el dedo (como en Vinyl GL: pick + armDistance) ----
    const armAngle = (p) => { const a = Math.atan2(p[1] - GEO.PIVOT_Y, p[0] - GEO.PIVOT_X); return a < 0 ? a + TAU : a; };
    const clampAl = (a) => Math.max(GEO.ALPHA_MIN, Math.min(GEO.ALPHA_REST, a));
    const PITCH = 0.12;                           // rango del pitch: +-12 %
    const faderY = () => -pitch / PITCH * 0.05;  // + abajo (hacia vos), como en los tocadiscos DJ
    function over(e) {
      const pa = scene.pick(e.clientX, e.clientY, 0.018), touch = e.pointerType === 'touch';
      if (pa && scene.armDistance(pa, al) < (touch ? 0.03 : 0.012)) return { type: 'arm', pa };
      const pf = scene.pick(e.clientX, e.clientY, DZ + 0.009), fy = -0.110 + faderY();
      if (pf && pf[0] > 0.229 && pf[0] < 0.259 && Math.abs(pf[1] - fy) < (touch ? 0.02 : 0.012)) return { type: 'fader', pf };
      const pd = scene.pick(e.clientX, e.clientY, 0);
      if (pd && Math.hypot(pd[0], pd[1]) < GEO.R_DISC) return { type: 'disc', pd };
      return null;
    }
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !scene.cam) return;
      const o = over(e); if (!o) return;
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* sin captura */ }
      if (o.type === 'arm') { hand = { off: al - armAngle(o.pa), al }; hold = null; }
      else if (o.type === 'fader') faderDrag = { y0: o.pf[1], f0: faderY() };
      else { disc = { ang: Math.atan2(o.pd[1], o.pd[0]), turn: 0, playing: target > 0, sent: 0 }; call('onHold', disc.playing); target = 0; speed = 0; }
      cv.style.cursor = 'grabbing'; e.preventDefault(); kick();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!scene.cam) return;
      if (hand) { const pa = scene.pick(e.clientX, e.clientY, 0.018); if (pa) { hand.al = clampAl(armAngle(pa) + hand.off); kick(); } return; }
      if (faderDrag) {
        const pf = scene.pick(e.clientX, e.clientY, DZ + 0.009); if (!pf) return;
        const f = Math.max(-0.05, Math.min(0.05, faderDrag.f0 + pf[1] - faderDrag.y0));
        pitch = Math.abs(f) < 0.0025 ? 0 : -f / 0.05 * PITCH;   // cerca del medio se engancha en 0
        kick(); return;
      }
      if (disc) {                                // el vinilo sigue a la mano (como en Vinyl GL: el angulo bajo el puntero)
        const pd = scene.pick(e.clientX, e.clientY, 0); if (!pd) return;
        const a = Math.atan2(pd[1], pd[0]); let d = a - disc.ang; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        disc.ang = a; disc.turn += d; thp -= d; kick(); return;
      }
      cv.style.cursor = over(e) ? 'grab' : '';
    });
    const release = () => {
      if (hand) {
        const r = Math.hypot(...GEO.stylusXY(hand.al)), b = bands || [];
        // sobre el vinilo cae en el tema que corresponda (o el mas cercano, si cae en un surco liso o cerca de la galleta)
        let i = b.findIndex((q) => r <= q[0] + 0.0008 && r >= q[1] - 0.0008);
        if (i < 0 && b.length && r <= R_LEADIN + 0.002) i = b.reduce((bi, q, j) => Math.min(Math.abs(q[0] - r), Math.abs(q[1] - r)) < Math.min(Math.abs(b[bi][0] - r), Math.abs(b[bi][1] - r)) ? j : bi, 0);
        if (i >= 0) {                              // aguja sobre el disco: salta a esa parte de ese tema
          const q = Math.max(0, Math.min(0.99, (b[i][0] - r) / (b[i][0] - b[i][1])));
          hold = { i, q, until: performance.now() + 6000 }; armOn = true; al = hand.al; call('onNeedle', i, q);
        } else { armOn = false; al = hand.al; call('onLift'); }   // fuera del disco: el brazo vuelve a su apoyo y pausa
        hand = null;
      }
      if (faderDrag) { faderDrag = null; sendRate(); }
      if (disc) {                                // al soltar: el tema sigue desde donde quedo el disco (una vuelta = 1,8 s a 33)
        const secs = -disc.turn / (W33 * rate()), was = disc.playing; disc = null;
        call('onScratch', secs, was);           // siempre: la pantalla tiene que saber que se solto el disco
      }
      cv.style.cursor = ''; kick();
    };
    for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, release);
    cv.addEventListener('dblclick', (e) => { const o = over(e); if (o && o.type === 'fader') { pitch = 0; sendRate(); kick(); } });   // doble click en el fader: vuelve a 0

    function frame(t) {
      raf = 0; if (dead || !visible) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
      speed += (target - speed) * (1 - Math.exp(-dt / (EASE / 3)));
      if (Math.abs(target - speed) < 0.002) speed = target;
      thp = (thp + speed * W33 * rate() * dt) % TAU;
      if (disc && disc.sent !== disc.turn) { disc.sent = disc.turn; call('onScratchMove', -disc.turn / (W33 * rate())); }   // scratch: cuantos segundos se movio el disco con la mano
      // brazo: en la mano; o sobre el tema que suena, avanzando con el tema; o en su apoyo
      let alT = GEO.ALPHA_REST, down = false;
      if (hand) alT = hand.al;
      else {
        const b = armOn && bands && bands[Math.min(hold ? hold.i : cur, bands.length - 1)];
        if (b) {
          let q = 0; try { q = Math.max(0, Math.min(1, +(opts.pos && opts.pos()) || 0)); } catch (e) { /* sin avance */ }
          if (hold) { if (performance.now() > hold.until || (hold.i === cur && Math.abs(q - hold.q) < 0.03)) hold = null; else q = hold.q; }
          alT = GEO.alphaForRadius(b[0] - 0.0004 - (b[0] - b[1] - 0.0008) * q); down = true;
        }
      }
      al += (alT - al) * (1 - Math.exp(-dt / ((hand ? 0.04 : ARM_T) / 3))); if (Math.abs(alT - al) < 6e-4) al = alT;
      const moving = Math.abs(alT - al) > 0.004, ztT = down && !moving && !hand ? 0 : LIFT;
      zt += (ztT - zt) * (1 - Math.exp(-dt / 0.08)); if (Math.abs(ztT - zt) < 2e-5) zt = ztT;
      if (!perf.done && dt > 0 && speed > 0.9 && !hand && !disc && !document.hidden) {
        if (perf.skip > 0) perf.skip--;
        else {
          perf.dts.push(dt);
          if (perf.dts.length >= 120) {
            const a = perf.dts.slice().sort((x, y) => x - y), med = a[60]; perf.dts = [];
            if (med <= 0.026) perf.done = true;                                           // fluido (38 cuadros por segundo o mas)
            else if (perf.stage === 0) { perf.stage = 1; pxCap = 0.45e6; perf.skip = 30; }   // primero: dibujar con menos pixeles
            else if (med > 0.036) { fail('LENTO ' + Math.round(1 / med) + ' cuadros por segundo'); return; }
            else perf.done = true;
          }
        }
      }
      const asp = cv.clientWidth / Math.max(1, cv.clientHeight), fc = fit(asp), o = FDV.cam || {};
      try {
        scene.draw({ thp, al, zt, zoom: 0, az: o.az ?? CAM.az, el: o.el ?? CAM.el, at: o.at || fc.at, dist: o.dist ?? fc.dist,
          motor: target > 0, rpm, bare: true, labK: LAB_K, envK: 0.1, iris: 0, plate: deckSkin.plate, body: deckSkin.body,
          press, fader: faderY(), pitch0: pitch === 0 ? 1 : 0, pxCap });
      } catch (e) { fail(e); return; }
      dirty = false;
      if (cv.width !== lw || cv.height !== lh) { lw = cv.width; lh = cv.height; layout(); }
      if (speed > 0 || target > 0 || al !== alT || zt !== ztT || hand || faderDrag || hold || disc) raf = requestAnimationFrame(frame); else last = 0;   // quieto: no dibuja nada mas
    }
    let lw = 0, lh = 0;
    // colores de la bandeja segun el skin (--deckPlate / --deckBody en el CSS: tres numeros 0..1); la pantalla avisa con 'fdskin'
    const deckSkin = { plate: [0.016, 0.016, 0.018], body: null };
    const readSkin = () => {
      const cs = getComputedStyle(document.documentElement), v = (k) => { const t = cs.getPropertyValue(k).trim(); const a = t ? t.split(',').map(Number) : null; return a && a.length === 3 && a.every((x) => x >= 0 && x <= 1) ? a : null; };
      deckSkin.plate = v('--deckPlate') || [0.016, 0.016, 0.018]; deckSkin.body = v('--deckBody');
    };
    readSkin(); document.addEventListener('fdskin', () => { readSkin(); kick(); });
    const kick = () => { dirty = true; if (visible && !raf && !dead) raf = requestAnimationFrame(frame); };
    if (window.ResizeObserver) new ResizeObserver(() => kick()).observe(box);

    function setLabel(canvas, level) { if (dead) return; try { scene.setLabel(canvas); labelLevel = level; kick(); } catch (e) { fail(e); } }

    // niveles de galleta: 0 armada con texto, 1 miniatura del video, 2 portada, 3 galleta real
    async function resolveLabel(rec, vid, idx, keepImage) {
      const tok = ++labelTok, en = window.FD_LANG === 'en';
      const info = {
        artist: rec ? rec.artist : '', title: rec ? rec.title : '', track: vid ? vid.title || '' : '', trackNo: vid ? idx + 1 : 0,
        label: rec ? rec.label : '', year: rec ? rec.year : '', country: rec ? rec.country : '',
      };
      const textLabel = async () => {
        try { await Promise.race([document.fonts.load('700 50px RC'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* sigue con la letra que haya */ }
        const lg = await getLogo();
        if (tok !== labelTok) return;
        const key = JSON.stringify(info) + en;
        if (labelLevel === 0 && labelTxt === key) return;
        labelTxt = key; setLabel(LB.fromText({ ...info, side: en }, lg), 0);
      };
      if (keepImage && labelLevel >= 2) return;            // mismo disco: la portada o la galleta real siguen valiendo
      const tryImg = async (url, crop, level) => {
        const im = await loadImg(url);
        if (!im || tok !== labelTok || level <= labelLevel) return false;
        try { setLabel(LB.fromImage(im, crop(im)), level); return true; } catch (e) { return false; }   // imagen sin permiso: sigue con la proxima
      };
      labelLevel = -1;                                     // lo que se ve queda hasta que llegue lo nuevo
      const fallback = setTimeout(() => { if (tok === labelTok && labelLevel < 0) textLabel(); }, 900);
      const jobs = [];
      if (rec && rec.img) jobs.push(tryImg(rec.img, square, 2));
      if (vid && vid.id) jobs.push(tryImg('https://i.ytimg.com/vi/' + encodeURIComponent(vid.id) + '/hqdefault.jpg', ytCrop, 1));
      if (rec && rec.id) jobs.push(caaMedium(rec.id, opts.mb).then((u) => u && tryImg(u, mediumCrop, 3)));
      await Promise.all(jobs.map((j) => j.catch(() => false)));
      clearTimeout(fallback);
      if (tok === labelTok && labelLevel < 0) textLabel();
    }

    function setCaption(rec, vid) {
      cap.children[0].textContent = rec ? rec.artist : '';
      let t = vid && vid.title ? String(vid.title).trim() : rec ? rec.title : '';
      const a = rec ? String(rec.artist || '').split(',')[0].trim().toLowerCase() : '';
      if (vid && a && t.toLowerCase().startsWith(a)) t = t.slice(a.length).replace(/^\s*[-–—:|]\s*/, '') || t;   // sin repetir el artista
      cap.children[1].textContent = t;
    }

    const api = {
      show(on) {
        on = !!on; if (on === visible || dead) return;
        visible = on; box.classList.toggle('on', on); screen.classList.toggle('vnl-on', on);
        if (on) { speed = target; kick(); } else { cancelAnimationFrame(raf); raf = 0; last = 0; }
      },
      real(on) { hd.querySelector('em').textContent = on ? 'AUDIO VINILO' : ''; },   // el sonido lo da el motor de vinilo
      state(s) {
        s = +s; if (s === 3) return;                      // cargando: queda como estaba
        target = s === 1 ? 1 : 0;
        if (s === 1 && ytState !== 1 && lastRate !== 1) call('onRate', lastRate);   // video nuevo: YouTube vuelve a 1x, se le repite la velocidad
        ytState = s;
        if (s === 1) armOn = true; else if (s !== 2) { armOn = false; hold = null; }   // pausa: la aguja queda apoyada
        box.classList.toggle('spin', target > 0);
        kick();
      },
      sync(o) {
        if (dead) return;
        const rec = o && o.rec, vid = rec && o.vid ? o.vid : null, idx = o && o.idx | 0, peaks = o && o.peaks || null;
        const rk = rec ? String(rec.id) : '', tk = rk + '|' + (vid ? vid.id : '') + '|' + idx;
        if (tk === trackKey && peaks === peaksRef) return;
        const newRec = rk !== recKey, newTrack = tk !== trackKey;
        recKey = rk; trackKey = tk; peaksRef = peaks;
        try { const g = grooves(rec ? rec.vids.length : 1, idx, peaks, rec ? +rec.id || rk.length : 1); scene.setGrooves(g); bands = g.bands; cur = Math.max(0, idx); } catch (e) { fail(e); return; }
        if (newRec || newTrack) { setCaption(rec, vid); resolveLabel(rec, vid, idx, !newRec); }
        kick();
      },
    };
    // galleta de arranque mientras no hay disco
    resolveLabel(null, null, 0, false);
    { const g = grooves(5, -1, null, 7); scene.setGrooves(g); bands = g.bands; }
    return api;
  };
})();
