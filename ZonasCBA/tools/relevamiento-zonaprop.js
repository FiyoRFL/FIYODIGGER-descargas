// Relevamiento mensual de ZONAS CBA / Loreal State.
// Se ejecuta en una pestaña de Chrome abierta en https://www.zonaprop.com.ar/ (Zonaprop bloquea servidores, no navegadores).
// Lanza el relevamiento en segundo plano; leer el resultado después con: JSON.stringify({prog: window.__prog, mep: window.__mep, res: window.__res})
window.__prog = 'start'; window.__res = {};
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
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const num = t => parseInt(String(t).replace(/[^\d]/g, ''), 10);
  async function page(url, rx) {
    const r = await fetch(url); if (!r.ok) return { items: [], total: null };
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const total = num(((d.querySelector('h1') || {}).textContent || '').trim().split(' ')[0]) || null;
    const items = [...d.querySelectorAll('[data-qa="posting PROPERTY"]')].map(c => {
      const a = c.querySelector('a[href*="/propiedades/"]');
      const id = c.getAttribute('data-id') || (a ? a.getAttribute('href') : '');
      const loc = (c.querySelector('[data-qa="POSTING_CARD_LOCATION"]') || {}).textContent || '';
      const p = (c.querySelector('[data-qa="POSTING_CARD_PRICE"]') || {}).textContent || '';
      const f = (c.querySelector('[data-qa="POSTING_CARD_FEATURES"]') || {}).textContent || '';
      const cub = f.match(/([\d.]+)\s*m²\s*cub/), tt = f.match(/([\d.]+)\s*m²\s*tot/);
      const m2 = cub ? num(cub[1]) : (tt ? num(tt[1]) : null);
      const mon = /USD|U\$S/.test(p) ? 'USD' : (/\$/.test(p) ? 'ARS' : null);
      return { id, loc, mon, precio: num(p) || null, m2 };
    }).filter(x => x.mon && x.precio && x.m2 && x.m2 >= 20 && x.m2 <= 400 && rx.test(x.loc));
    return { items, total };
  }
  try {
    window.__mep = await fetch('https://dolarapi.com/v1/dolares/bolsa').then(r => r.json()).catch(() => null);
    for (const [id, [slug, rx]] of Object.entries(Z)) {
      window.__prog = id;
      const seen = {}, v = [], a = []; let totV = null, totA = null;
      for (const pg of ['', '-pagina-2', '-pagina-3']) {
        const r = await page('/departamentos-venta-' + slug + pg + '.html', rx); if (pg === '') totV = r.total;
        let nuevo = 0; r.items.forEach(x => { if (x.mon === 'USD' && !seen['v' + x.id]) { seen['v' + x.id] = 1; nuevo++; v.push(x.precio / x.m2); } });
        await sleep(800); if (!nuevo) break;
      }
      for (const pg of ['', '-pagina-2']) {
        const r = await page('/departamentos-alquiler-' + slug + pg + '.html', rx); if (pg === '') totA = r.total;
        let nuevo = 0; r.items.forEach(x => { if (x.mon === 'ARS' && !seen['a' + x.id]) { seen['a' + x.id] = 1; nuevo++; a.push(x.precio / x.m2); } });
        await sleep(800); if (!nuevo) break;
      }
      const vv = v.filter(x => x > 300 && x < 6000), aa = a.filter(x => x > 1000 && x < 100000);
      window.__res[id] = { venta_usd_m2: vv.length ? Math.round(med(vv)) : null, n_venta: vv.length, oferta_venta: totV,
        alquiler_ars_m2: aa.length ? Math.round(med(aa)) : null, n_alq: aa.length, oferta_alquiler: totA };
    }
    window.__prog = 'done';
  } catch (e) { window.__prog = 'error ' + e; }
})();
