(function () {
  var cuerpo = document.body ? (document.body.innerText || '') : '';
  if (/Por seguridad, complet|reCAPTCHA|no sos un robot/i.test(cuerpo) && !document.querySelector('a[href*="MLA"]')) {
    return JSON.stringify({ captcha: true, title: document.title });
  }
  var vistos = {}, out = [];
  var links = document.querySelectorAll('a[href*="MLA"]');
  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    var href = (a.href || '').split('#')[0].split('?')[0];
    if (!/MLA-?\d{6,}/.test(href) || vistos[href]) continue;
    var card = a.closest('li') || a.closest('[class*="card"]') || a.closest('[class*="result"]') || a.parentElement;
    if (!card) continue;
    var txt = card.innerText || '';
    var pm = txt.match(/(US\$|U\$S|USD|\$)\s*([\d.]{3,})/);
    if (!pm) continue;
    vistos[href] = 1;
    var lineas = txt.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
    var titulo = (a.innerText || a.getAttribute('title') || '').trim() || lineas[0] || '';
    var loc = '';
    for (var j = lineas.length - 1; j >= 0; j--) {
      if (/C[oó]rdoba/i.test(lineas[j]) && lineas[j] !== titulo && !/(US\$|U\$S|\$)\s*\d/.test(lineas[j])) { loc = lineas[j]; break; }
    }
    var attrs = lineas.filter(function (l) { return l !== titulo && /amb|dorm|m²|m2|baño/i.test(l) && l.length < 60; }).slice(0, 3).join(' · ');
    var img = card.querySelector('img');
    var src = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
    if (!/^https:\/\//.test(src)) src = '';
    var moneda = (pm[1] === '$') ? 'ARS' : 'USD';
    out.push({
      u: href, t: titulo.slice(0, 140), m: moneda,
      p: parseInt(pm[2].replace(/\./g, ''), 10),
      loc: loc.slice(0, 160), a: attrs.slice(0, 90), img: src
    });
  }
  var sig = document.querySelector('a[title="Siguiente"], li.andes-pagination__button--next a, a.andes-pagination__link[title*="Siguiente"]');
  return JSON.stringify({ items: out, next: sig ? sig.href : null, title: document.title });
})()
