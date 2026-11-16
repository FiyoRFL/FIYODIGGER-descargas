// Publica Loreal State en Netlify desde el navegador (pestaña en https://app.netlify.com).
// Antes de ejecutar, definir:
//   window.__PUB = { proxy: '<proxy-path de deploy-site>', siteId: '653cbbb6-fd68-4e77-a3a6-86daf23952aa',
//                    sha: '<commit de main con los archivos al día>', datos: {fecha, mep, avisos, geoNew} | null }
// datos viene del relevamiento (ver traer-datos en relevamiento-zonaprop.js). Si es null, publica sin tocar los avisos.
// Corre en segundo plano: leer window.__pubProg hasta que empiece con 'listo' o 'error'.
window.__pubProg = 'start';
(async () => {
  const P = window.__PUB;
  const RAW = 'https://raw.githubusercontent.com/FiyoRFL/FIYODIGGER-descargas/' + P.sha + '/LorealState/';
  const SITIO = 'https://loreal-state.netlify.app/';
  const ARCHIVOS = ['index.html', 'app.js', 'styles.css', 'config.js', 'manifest.webmanifest', 'sw.js', 'netlify.toml', 'favicon.png',
    'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'data/zonas.json'];
  const enc = new TextEncoder();

  // --- zip sin compresión ---
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const partes = [], central = []; let off = 0;
    for (const [nombre, datos] of files) {
      const n = enc.encode(nombre), crc = crc32(datos), L = new DataView(new ArrayBuffer(30));
      L.setUint32(0, 0x04034b50, true); L.setUint16(4, 20, true); L.setUint16(8, 0, true); L.setUint32(14, crc, true);
      L.setUint32(18, datos.length, true); L.setUint32(22, datos.length, true); L.setUint16(26, n.length, true);
      partes.push(new Uint8Array(L.buffer), n, datos);
      const C = new DataView(new ArrayBuffer(46));
      C.setUint32(0, 0x02014b50, true); C.setUint16(4, 20, true); C.setUint16(6, 20, true); C.setUint32(16, crc, true);
      C.setUint32(20, datos.length, true); C.setUint32(24, datos.length, true); C.setUint16(28, n.length, true); C.setUint32(42, off, true);
      central.push(new Uint8Array(C.buffer), n);
      off += 30 + n.length + datos.length;
    }
    const tam = central.reduce((s, x) => s + x.length, 0), E = new DataView(new ArrayBuffer(22));
    E.setUint32(0, 0x06054b50, true); E.setUint16(8, files.length, true); E.setUint16(10, files.length, true);
    E.setUint32(12, tam, true); E.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(E.buffer)], { type: 'application/zip' });
  }

  // --- avisos: misma lógica que aplicar-avisos.py ---
  const median = v => { const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function armarAvisos(datos, zonas, previo, cache) {
    Object.assign(cache, datos.geoNew || {});
    const zs = {}; zonas.zonas.forEach(z => { zs[z.id] = z; });
    const prev = {}; ((previo && previo.avisos) || []).forEach(a => { prev[a.id] = a; });
    const porZ = {}; datos.avisos.forEach(a => { (porZ[a.z] = porZ[a.z] || []).push(a.p / a.m2); });
    const med = {}; Object.keys(porZ).forEach(k => { med[k] = median(porZ[k]); });
    const out = [], vistos = {};
    for (const a of datos.avisos) {
      if (vistos[a.id] || !med[a.z]) continue; vistos[a.id] = 1;
      const m2p = a.p / a.m2;
      const x = { id: a.id, z: a.z, u: a.u, p: a.p, m2: a.m2, amb: a.amb, dorm: a.dorm, banos: a.banos, coch: a.coch, dir: a.dir };
      x.m2p = Math.round(m2p);
      x.vs = Math.round((m2p / med[a.z] - 1) * 100);
      const alq = ((zs[a.z] || {}).mercado || {}).alquiler_ars_m2;
      x.renta = alq ? Math.round(alq * a.m2 * 12 / (a.p * datos.mep) * 1000) / 10 : null;
      if (a.pozo) x.pozo = 1;
      if (a.estrenar) x.estrenar = 1;
      const ant = prev[a.id];
      x.visto = ant ? (ant.visto || datos.fecha) : datos.fecha;
      if (ant && ant.p && a.p < ant.p) x.p_ant = ant.p;
      else if (ant && ant.p_ant && a.p < ant.p_ant) x.p_ant = ant.p_ant;
      const g = a.dir ? cache[a.dir.replace(/\s+al\s+/i, ' ') + '|' + a.z] : null;
      if (g) { x.lat = g[0]; x.lng = g[1]; }
      Object.keys(x).forEach(k => { if (x[k] === null || x[k] === '' || x[k] === undefined) delete x[k]; });
      out.push(x);
    }
    const medR = {}; Object.keys(med).forEach(k => { medR[k] = Math.round(med[k]); });
    return { fecha: datos.fecha, mep: datos.mep, fuente: 'Avisos de departamentos en venta publicados en Zonaprop', medianas: medR, avisos: out };
  }

  try {
    const files = [];
    for (const f of ARCHIVOS) {
      window.__pubProg = 'bajando ' + f;
      const r = await fetch(RAW + f, { cache: 'no-store' });
      if (!r.ok) throw new Error('no pude bajar ' + f + ' (' + r.status + ')');
      files.push([f, new Uint8Array(await r.arrayBuffer())]);
    }
    const zonas = JSON.parse(new TextDecoder().decode(files.find(f => f[0] === 'data/zonas.json')[1]));
    const previo = await fetch(SITIO + 'data/avisos.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const cache = await fetch(SITIO + 'data/geocache.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    let avisos = previo;
    if (P.datos) avisos = armarAvisos(P.datos, zonas, previo, cache);
    if (avisos) files.push(['data/avisos.json', enc.encode(JSON.stringify(avisos))]);
    files.push(['data/geocache.json', enc.encode(JSON.stringify(cache))]);
    window.__pubResumen = avisos ? { avisos: avisos.avisos.length, ubicados: avisos.avisos.filter(a => a.lat).length, bajaron: avisos.avisos.filter(a => a.p_ant).length, fecha: avisos.fecha } : null;
    window.__pubProg = 'subiendo';
    const fd = new FormData();
    fd.append('zip', new File([zip(files)], 'loreal-state.zip', { type: 'application/zip' }));
    const r = await fetch(P.proxy + '/api/v1/sites/' + P.siteId + '/builds', { method: 'POST', body: fd });
    const t = await r.text();
    window.__pubProg = (r.ok ? 'listo ' : 'error ') + r.status + ' ' + t.slice(0, 160);
  } catch (e) { window.__pubProg = 'error ' + e.message; }
})();
