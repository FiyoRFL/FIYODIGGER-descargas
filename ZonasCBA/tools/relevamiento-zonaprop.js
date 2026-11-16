// Relevamiento semanal de ZONAS CBA / Loreal State (v2).
// Se ejecuta en una pestaña de Chrome abierta en https://www.zonaprop.com.ar/ (Zonaprop bloquea servidores, no navegadores).
// Corre en segundo plano. Leer el avance con: window.__prog
// Al terminar (window.__prog === 'done') leer en partes:
//   JSON.stringify({mep: window.__mep, res: window.__res})
//   window.__avisosJSON.slice(0, 40000), window.__avisosJSON.slice(40000, 80000), ...  (hasta cubrir window.__avisosJSON.length)
//   JSON.stringify(window.__geoNew)
window.__prog = 'start'; window.__res = {}; window.__avisos = []; window.__geoNew = {};
(async () => {
  const Z = {
    'nueva-cordoba': ['nueva-cordoba', /nueva c[oó]rdoba/i],
    'cerro-de-las-rosas': ['cerro-de-las-rosas', /cerro de las rosas/i],
    'villa-belgrano': ['villa-belgrano-cordoba', /villa belgrano/i],
    'valle-escondido': ['valle-escondido', /valle escondido/i],
    'urca': ['urca', /urca/i],
    'arguello-la-calera': ['arguello', /arg[uü]ello/i],
    'general-paz': ['general-paz-cordoba', /general paz/i],
    'cofico': ['cofico', /cofico/i],
    'alberdi': ['alberdi-cordoba', /(^|[^o] )alberdi/i],
    'alta-cordoba': ['alta-cordoba', /alta c[oó]rdoba/i]
  };
  const PAG_VENTA = ['', '-pagina-2', '-pagina-3', '-pagina-4', '-pagina-5'];
  const PAG_ALQ = ['', '-pagina-2'];
  const MAX_GEO = 150;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const num = t => parseInt(String(t).replace(/[^\d]/g, ''), 10);
  const n1 = (f, rx) => { const m = f.match(rx); return m ? num(m[1]) : null; };
  const pareceDireccion = s => /^[A-Za-zÁÉÍÓÚÑáéíóúñ°º.\s]{3,40}\s(al\s)?\d{2,5}\b/.test(s.trim()) && s.length < 60;

  async function page(url, rx) {
    const r = await fetch(url); if (!r.ok) return { items: [], total: null };
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const total = num(((d.querySelector('h1') || {}).textContent || '').trim().split(' ')[0]) || null;
    const items = [...d.querySelectorAll('[data-qa="posting PROPERTY"]')].map(c => {
      const a = c.querySelector('a[href*="/propiedades/"]');
      const id = c.getAttribute('data-id') || (a ? a.getAttribute('href') : '');
      const locEl = c.querySelector('[data-qa="POSTING_CARD_LOCATION"]');
      const loc = (locEl || {}).textContent || '';
      const dirTxt = ((locEl && locEl.previousElementSibling) || {}).textContent || '';
      const p = (c.querySelector('[data-qa="POSTING_CARD_PRICE"]') || {}).textContent || '';
      const f = (c.querySelector('[data-qa="POSTING_CARD_FEATURES"]') || {}).textContent || '';
      const desc = ((c.querySelector('[data-qa="POSTING_CARD_DESCRIPTION"]') || {}).textContent || '').toLowerCase();
      const cub = f.match(/([\d.]+)\s*m²\s*cub/), tt = f.match(/([\d.]+)\s*m²\s*tot/);
      const m2 = cub ? num(cub[1]) : (tt ? num(tt[1]) : null);
      const mon = /USD|U\$S/.test(p) ? 'USD' : (/\$/.test(p) ? 'ARS' : null);
      return {
        id: String(id), loc, mon, precio: num(p) || null, m2,
        amb: n1(f, /(\d+)\s*amb/), dorm: n1(f, /(\d+)\s*dorm/), banos: n1(f, /(\d+)\s*baño/), coch: n1(f, /(\d+)\s*coch/) || 0,
        dir: pareceDireccion(dirTxt) ? dirTxt.trim() : '',
        u: a ? a.getAttribute('href').split('?')[0] : '',
        pozo: /\bpozo\b|en construcci|preventa|entrega (en|prevista)|financiaci[oó]n en cuotas/.test(desc),
        estrenar: /a estrenar/.test(desc)
      };
    }).filter(x => x.mon && x.precio && x.m2 && x.m2 >= 20 && x.m2 <= 400 && rx.test(x.loc));
    return { items, total };
  }

  try {
    window.__mep = await fetch('https://dolarapi.com/v1/dolares/bolsa').then(r => r.json()).catch(() => null);
    for (const [zid, [slug, rx]] of Object.entries(Z)) {
      window.__prog = 'avisos ' + zid;
      const seen = {}, v = [], a = []; let totV = null, totA = null;
      for (const pg of PAG_VENTA) {
        const r = await page('/departamentos-venta-' + slug + pg + '.html', rx); if (pg === '') totV = r.total;
        let nuevo = 0;
        r.items.forEach(x => {
          if (x.mon !== 'USD' || seen['v' + x.id]) return;
          const m2p = x.precio / x.m2; if (m2p < 300 || m2p > 6000) return;
          seen['v' + x.id] = 1; nuevo++; v.push(m2p);
          window.__avisos.push({ id: x.id, z: zid, u: x.u, p: x.precio, m2: x.m2, amb: x.amb, dorm: x.dorm, banos: x.banos, coch: x.coch, dir: x.dir, pozo: x.pozo, estrenar: x.estrenar });
        });
        await sleep(800); if (!nuevo) break;
      }
      for (const pg of PAG_ALQ) {
        const r = await page('/departamentos-alquiler-' + slug + pg + '.html', rx); if (pg === '') totA = r.total;
        let nuevo = 0; r.items.forEach(x => { if (x.mon === 'ARS' && !seen['a' + x.id]) { seen['a' + x.id] = 1; nuevo++; a.push(x.precio / x.m2); } });
        await sleep(800); if (!nuevo) break;
      }
      const aa = a.filter(x => x > 1000 && x < 100000);
      window.__res[zid] = { venta_usd_m2: v.length ? Math.round(med(v)) : null, n_venta: v.length, oferta_venta: totV,
        alquiler_ars_m2: aa.length ? Math.round(med(aa)) : null, n_alq: aa.length, oferta_alquiler: totA };
    }
    window.__avisosJSON = JSON.stringify(window.__avisos);

    // Ubicar en el mapa las direcciones nuevas (con caché del repo)
    let cache = {};
    try { cache = await fetch('https://raw.githubusercontent.com/FiyoRFL/FIYODIGGER-descargas/main/ZonasCBA/tools/geocache.json?t=' + Date.now()).then(r => r.ok ? r.json() : {}); } catch (e) { cache = {}; }
    const NOMBRES = { 'nueva-cordoba': 'Nueva Córdoba', 'cerro-de-las-rosas': 'Cerro de las Rosas', 'villa-belgrano': 'Villa Belgrano', 'valle-escondido': 'Valle Escondido', 'urca': 'Urca', 'arguello-la-calera': 'Argüello', 'general-paz': 'General Paz', 'cofico': 'Cofico', 'alberdi': 'Alberdi', 'alta-cordoba': 'Alta Córdoba' };
    const pend = [...new Set(window.__avisos.filter(x => x.dir).map(x => x.dir.replace(/\s+al\s+/i, ' ') + '|' + x.z))].filter(k => !(k in cache));
    let i = 0;
    for (const k of pend.slice(0, MAX_GEO)) {
      window.__prog = 'mapa ' + (++i) + '/' + Math.min(pend.length, MAX_GEO);
      const [dir, zid] = k.split('|');
      const q = dir + ', ' + NOMBRES[zid] + ', Córdoba, Argentina';
      try {
        const j = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&viewbox=-64.40,-31.25,-64.00,-31.55&bounded=1&q=' + encodeURIComponent(q)).then(r => r.json());
        const x = j && j[0];
        window.__geoNew[k] = (x && /house|building|residential|apartments|road|street/.test((x.addresstype || '') + ' ' + (x.type || '') + ' ' + (x.class || '')))
          ? [Math.round(parseFloat(x.lat) * 1e5) / 1e5, Math.round(parseFloat(x.lon) * 1e5) / 1e5] : null;
      } catch (e) { /* queda sin ubicar */ }
      await sleep(1100);
    }
    window.__prog = 'done';
  } catch (e) { window.__prog = 'error ' + e; }
})();
