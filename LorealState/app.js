(function () {
  'use strict';

  var CFG = window.LOREAL_CONFIG || {};
  var KEY = (CFG.GOOGLE_MAPS_KEY || '').trim();
  var REMOTE = CFG.DATOS_REMOTOS || '';
  var $ = function (id) { return document.getElementById(id); };
  var data = null, modo = 'comprar', sel = null, mapa = null, oscuro = false;

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* sin almacenamiento */ }
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return typeof n === 'number' && isFinite(n); }
  function fechaTxt(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : '--'; }
  var tT = null;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tT); tT = setTimeout(function () { e.classList.remove('on'); }, 2600); }

  /* ---------- datos ---------- */
  function validar(d) {
    if (!d || !Array.isArray(d.zonas) || !d.zonas.length || !d.pesos || !d.dimensiones || !Array.isArray(d.centro)) return false;
    return d.zonas.every(function (z) {
      return z && typeof z.id === 'string' && typeof z.nombre === 'string' && num(z.lat) && num(z.lng) &&
        ['vender', 'comprar'].every(function (m) {
          return z[m] && d.dimensiones[m].every(function (dim) { return num(z[m][dim.k]); });
        });
    });
  }
  function mejor(a, b) {
    if (!a) return b; if (!b) return a;
    if ((b.version || 0) !== (a.version || 0)) return (b.version || 0) > (a.version || 0) ? b : a;
    return (b.actualizado || '') > (a.actualizado || '') ? b : a;
  }
  function puntaje(z, m) {
    var p = data.pesos[m], t = 0, s = 0;
    Object.keys(p).forEach(function (k) { t += p[k]; s += p[k] * (z[m][k] || 0); });
    return t ? Math.round(s / t * 10) : 0;
  }
  function ranking() {
    return data.zonas.map(function (z) { return { z: z, p: puntaje(z, modo) }; }).sort(function (a, b) { return b.p - a.p; });
  }
  function color(p) { return p >= 75 ? '#2ecc71' : p >= 65 ? '#9ccc3a' : p >= 55 ? '#f0ad3c' : '#8a96a6'; }
  function etiqueta(p) { return p >= 75 ? 'Excelente' : p >= 65 ? 'Muy buena' : p >= 55 ? 'Buena' : 'Media'; }
  function zona(id) { return data.zonas.filter(function (z) { return z.id === id; })[0]; }

  /* ---------- área de cada barrio (OpenStreetMap) ---------- */
  var areas = {};
  function circulo(z, metros) {
    var pts = [], r = metros / 111320, k = Math.cos(z.lat * Math.PI / 180);
    for (var i = 0; i <= 48; i++) {
      var a = i / 48 * Math.PI * 2;
      pts.push([z.lng + r * Math.cos(a) / k, z.lat + r * Math.sin(a)]);
    }
    return { type: 'Polygon', coordinates: [pts], aprox: true };
  }
  function areaDe(z) {
    if (areas[z.id]) return Promise.resolve(areas[z.id]);
    var c = ls('area:' + z.id);
    if (c) { try { areas[z.id] = JSON.parse(c); return Promise.resolve(areas[z.id]); } catch (e) { /* recalcular */ } }
    var q = (z.busqueda || z.nombre.split('–')[0]).trim() + ', Córdoba, Argentina';
    var url = 'https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&polygon_threshold=0.0002&limit=3&countrycodes=ar' +
      '&viewbox=-64.40,-31.25,-64.00,-31.55&bounded=1&q=' + encodeURIComponent(q);
    return fetch(url).then(function (r) { return r.ok ? r.json() : []; }).then(function (arr) {
      var g = null;
      (arr || []).some(function (x) {
        if (x.geojson && /Polygon/.test(x.geojson.type)) { g = x.geojson; return true; }
        return false;
      });
      if (!g || !contiene(g, z)) g = circulo(z, 900);
      areas[z.id] = g;
      try { ls('area:' + z.id, JSON.stringify(g)); } catch (e) { /* lleno */ }
      return g;
    }).catch(function () { return circulo(z, 900); });
  }
  function anillos(g) { return g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(function (p) { return p[0]; }); }
  function contiene(g, z) {
    // el área debe quedar cerca del punto de la zona (evita barrios homónimos)
    var cerca = false;
    anillos(g).forEach(function (r) {
      r.forEach(function (p) { if (Math.abs(p[1] - z.lat) < 0.03 && Math.abs(p[0] - z.lng) < 0.03) cerca = true; });
    });
    return cerca;
  }

  /* ---------- mapa: Leaflet (libre) ---------- */
  function mapaLeaflet() {
    var m = L.map('map', { zoomControl: false, attributionControl: true, tap: true }).setView(data.centro, 12);
    var claro = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' });
    var noche = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' });
    var base = claro.addTo(m);
    var pins = L.layerGroup().addTo(m), area = null;
    return {
      pins: function (items) {
        pins.clearLayers();
        items.forEach(function (it, i) {
          var cls = 'pin' + (sel === it.z.id ? ' sel' : (sel ? ' apagado' : ''));
          var html = '<div class="' + cls + '" style="--c:' + color(it.p) + '"><i>' + (i + 1) + '</i>' + esc(it.z.nombre.split('–')[0].trim()) + ' <small>' + it.p + '</small></div>';
          L.marker([it.z.lat, it.z.lng], { icon: L.divIcon({ className: '', html: html, iconSize: [0, 0] }), zIndexOffset: sel === it.z.id ? 1000 : 0 })
            .addTo(pins).on('click', function () { seleccionar(it.z.id); });
        });
      },
      area: function (g, c) {
        if (area) { m.removeLayer(area); area = null; }
        if (!g) return;
        area = L.geoJSON(g, { style: { color: c, weight: 3, fillColor: c, fillOpacity: 0.18, dashArray: g.aprox ? '6 6' : null } }).addTo(m);
        m.flyToBounds(area.getBounds(), { padding: [40, 40], maxZoom: 15, duration: 0.7 });
      },
      todas: function (items) { m.flyToBounds(items.map(function (it) { return [it.z.lat, it.z.lng]; }), { padding: [50, 50], duration: 0.6 }); },
      estilo: function (osc) { m.removeLayer(base); base = (osc ? noche : claro).addTo(m); },
      resize: function () { m.invalidateSize(); }
    };
  }

  /* ---------- mapa: Google ---------- */
  var G_OSCURO = [
    { elementType: 'geometry', stylers: [{ color: '#1d2330' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9aa6b5' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#10141b' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3546' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1219' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] }
  ];
  var G_CLARO = [{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] }];

  function mapaGoogle() {
    var m = new google.maps.Map($('map'), {
      center: { lat: data.centro[0], lng: data.centro[1] }, zoom: 12, disableDefaultUI: true,
      gestureHandling: 'greedy', clickableIcons: false, styles: G_CLARO
    });
    var marcas = [], capa = null;
    return {
      pins: function (items) {
        marcas.forEach(function (k) { k.setMap(null); });
        marcas = items.map(function (it, i) {
          var s = sel === it.z.id, apag = sel && !s;
          var k = new google.maps.Marker({
            map: m, position: { lat: it.z.lat, lng: it.z.lng }, zIndex: s ? 1000 : 10 - i, opacity: apag ? 0.4 : 1,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: s ? 19 : 15, fillColor: s ? '#1d2430' : color(it.p), fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
            label: { text: String(it.p), color: '#fff', fontWeight: '700', fontSize: '12px' },
            title: it.z.nombre
          });
          k.addListener('click', function () { seleccionar(it.z.id); });
          return k;
        });
      },
      area: function (g, c) {
        if (capa) { capa.setMap(null); capa = null; }
        if (!g) return;
        capa = new google.maps.Data({ map: m });
        capa.addGeoJson({ type: 'Feature', geometry: { type: g.type, coordinates: g.coordinates }, properties: {} });
        capa.setStyle({ strokeColor: c, strokeWeight: 3, fillColor: c, fillOpacity: 0.18, clickable: false });
        var b = new google.maps.LatLngBounds();
        anillos(g).forEach(function (r) { r.forEach(function (p) { b.extend({ lat: p[1], lng: p[0] }); }); });
        m.fitBounds(b, 40);
      },
      todas: function (items) {
        var b = new google.maps.LatLngBounds();
        items.forEach(function (it) { b.extend({ lat: it.z.lat, lng: it.z.lng }); });
        m.fitBounds(b, 50);
      },
      estilo: function (osc) { m.setOptions({ styles: osc ? G_OSCURO : G_CLARO }); },
      resize: function () { google.maps.event.trigger(m, 'resize'); }
    };
  }

  function cargarGoogle() {
    return new Promise(function (res, rej) {
      window.__gmOk = res;
      window.gm_authFailure = function () {
        toast('Google Maps rechazó la clave. Uso el mapa libre.');
        $('map').innerHTML = ''; mapa = mapaLeaflet(); render(true);
      };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(KEY) + '&callback=__gmOk';
      s.async = true; s.onerror = rej;
      document.head.appendChild(s);
      setTimeout(rej, 12000);
    });
  }
  function iniciarMapa() {
    if (!KEY) { mapa = mapaLeaflet(); return Promise.resolve(); }
    return cargarGoogle().then(function () { mapa = mapaGoogle(); })
      .catch(function () { $('map').innerHTML = ''; mapa = mapaLeaflet(); });
  }

  /* ---------- interfaz ---------- */
  function render(encuadrar) {
    var items = ranking();
    $('tabComprar').classList.toggle('on', modo === 'comprar');
    $('tabVender').classList.toggle('on', modo === 'vender');
    $('intro').innerHTML = modo === 'comprar'
      ? '<b>Dónde conviene comprar</b>Precio de entrada, renta por alquiler y potencial de crecimiento.'
      : '<b>Dónde conviene vender</b>Demanda, rapidez de venta y valorización.';
    $('lista').innerHTML = items.map(function (it, i) {
      var c = color(it.p);
      return '<div class="card' + (sel === it.z.id ? ' sel' : '') + '" data-id="' + esc(it.z.id) + '" role="button" tabindex="0">' +
        '<div class="num">' + (i + 1) + '</div>' +
        '<div class="info"><b>' + esc(it.z.nombre) + '</b><small>' + esc(it.z.tipo || '') + '</small></div>' +
        '<div class="pts" style="color:' + c + '"><b>' + it.p + '</b><span>' + etiqueta(it.p) + '</span></div></div>';
    }).join('');
    $('pie').textContent = 'Datos al ' + fechaTxt(data.actualizado) + ' · Guía de referencia, no es una tasación.';
    $('estado').textContent = 'Córdoba capital · ' + data.zonas.length + ' zonas';
    if (mapa) {
      mapa.pins(items);
      if (encuadrar && !sel) mapa.todas(items);
    }
    if (sel) ficha();
  }

  function portales(z) {
    var p = z.portales || {}, out = '';
    if (p.mercadolibre) out += '<a class="portal ml" target="_blank" rel="noopener" href="https://inmuebles.mercadolibre.com.ar/venta/cordoba/cordoba/' + encodeURIComponent(p.mercadolibre) + '/">MercadoLibre</a>';
    if (p.zonaprop) out += '<a class="portal zp" target="_blank" rel="noopener" href="' + esc('https://www.zonaprop.com.ar/' + p.zonaprop) + '">Zonaprop</a>';
    if (p.argenprop) out += '<a class="portal ap" target="_blank" rel="noopener" href="' + esc('https://www.argenprop.com/' + p.argenprop) + '">Argenprop</a>';
    return out ? '<div class="h-sec">Propiedades en venta con precio</div><div class="portales">' + out + '</div>' : '';
  }

  function ficha() {
    var z = zona(sel); if (!z) return;
    var p = puntaje(z, modo), c = color(p);
    var dims = data.dimensiones[modo].map(function (d) {
      var v = z[modo][d.k];
      return '<div class="dim"><span>' + esc(d.t) + '</span><em>' + v + '/10</em><div class="b"><i style="width:' + v * 10 + '%"></i></div></div>';
    }).join('');
    var datos = (z.datos || []).length ? '<div class="h-sec">Datos</div><ul class="datos">' + z.datos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';
    $('hojaCont').innerHTML =
      '<h2 class="h-tit">' + esc(z.nombre) + '</h2><span class="h-tipo">' + esc(z.tipo || '') + '</span>' +
      '<div class="h-score"><div class="anillo" style="background:conic-gradient(' + c + ' ' + p * 3.6 + 'deg,#2a3342 0)"><div style="color:' + c + '">' + p + '</div></div>' +
      '<p><b style="color:' + c + '">' + etiqueta(p) + ' para ' + (modo === 'comprar' ? 'comprar' : 'vender') + '.</b> ' + esc(z['motivo_' + modo] || '') + '</p></div>' +
      (z.precio ? '<div class="precio"><b>Precios de referencia:</b> ' + esc(z.precio) + '</div>' : '') +
      portales(z) +
      '<div class="h-sec">Puntaje en detalle</div><div class="dims">' + dims + '</div>' + datos +
      '<div class="btns"><a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + z.lat + ',' + z.lng + '">Google Maps</a>' +
      '<a class="btn sec" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + z.lat + ',' + z.lng + '">Cómo llegar</a></div>';
    $('hoja').hidden = false;
  }

  function seleccionar(id) {
    if (sel === id) { cerrarFicha(); return; }
    sel = id;
    render(false);
    var z = zona(id), c = color(puntaje(z, modo));
    var card = document.querySelector('.card[data-id="' + id + '"]');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    areaDe(z).then(function (g) { if (sel === id && mapa) mapa.area(g, c); });
  }
  function cerrarFicha() {
    sel = null; $('hoja').hidden = true;
    if (mapa) mapa.area(null);
    render(true);
  }

  /* ---------- actualización ---------- */
  function actualizar(manual) {
    if (!REMOTE) return;
    $('btnRefresh').classList.add('giro');
    fetch(REMOTE + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        if (!validar(d)) throw 0;
        if (mejor(data, d) === d && JSON.stringify(d) !== JSON.stringify(data)) {
          data = d; ls('datos', JSON.stringify(d)); render(false); toast('Datos actualizados al ' + fechaTxt(d.actualizado));
        } else if (manual) toast('Ya tenés lo último');
      })
      .catch(function () { if (manual) toast('No pude conectar. Sigo con lo guardado.'); })
      .then(function () { $('btnRefresh').classList.remove('giro'); });
  }

  /* ---------- eventos ---------- */
  function eventos() {
    $('tabComprar').onclick = function () { modo = 'comprar'; render(!sel); if (sel) seleccionar2(); };
    $('tabVender').onclick = function () { modo = 'vender'; render(!sel); if (sel) seleccionar2(); };
    function seleccionar2() { var z = zona(sel); areaDe(z).then(function (g) { if (mapa && sel === z.id) mapa.area(g, color(puntaje(z, modo))); }); }
    $('lista').addEventListener('click', function (e) { var c = e.target.closest('.card'); if (c) seleccionar(c.getAttribute('data-id')); });
    $('lista').addEventListener('keydown', function (e) { var c = e.target.closest('.card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); seleccionar(c.getAttribute('data-id')); } });
    $('hojaX').onclick = cerrarFicha;
    $('btnTodo').onclick = function () { cerrarFicha(); };
    $('btnEstilo').onclick = function () {
      oscuro = !oscuro; document.body.classList.toggle('oscuro', oscuro);
      $('btnEstilo').textContent = oscuro ? '☾ Oscuro' : '☀ Claro';
      if (mapa) mapa.estilo(oscuro); ls('oscuro', oscuro ? '1' : null);
    };
    $('btnRefresh').onclick = function () { actualizar(true); };
    $('btnAyuda').onclick = function () { $('dlgAyuda').hidden = false; };
    $('dlgOk').onclick = function () { $('dlgAyuda').hidden = true; ls('vioAyuda', '1'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('dlgAyuda').hidden) $('dlgAyuda').hidden = true; else if (sel) cerrarFicha(); } });
    window.addEventListener('resize', function () { if (mapa) mapa.resize(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) actualizar(false); });
  }

  function arrancar() {
    eventos();
    var cache = null;
    try { cache = JSON.parse(ls('datos') || 'null'); } catch (e) { cache = null; }
    if (!validar(cache)) cache = null;
    fetch('data/zonas.json').then(function (r) { return r.json(); }).catch(function () { return null; })
      .then(function (local) {
        data = mejor(validar(local) ? local : null, cache);
        if (!data) throw 0;
        return iniciarMapa();
      })
      .then(function () {
        if (ls('oscuro')) $('btnEstilo').click();
        render(true);
        setTimeout(function () { if (mapa) mapa.resize(); }, 300);
        if (!ls('vioAyuda')) $('dlgAyuda').hidden = false;
        actualizar(false);
      })
      .catch(function () { toast('No pude cargar los datos.'); });
  }
  arrancar();
})();
