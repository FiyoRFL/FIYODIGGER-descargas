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
  function miles(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  var presu = 0;
  function mesTxt(f) { var m = /^(\d{4})-(\d{2})/.exec(f || ''); return m ? ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m[2] - 1] + ' ' + m[1] : ''; }
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
      props: function (items, selId, onClick) {
        if (!this._capa) this._capa = L.layerGroup().addTo(m);
        var capa = this._capa; capa.clearLayers();
        items.forEach(function (a) {
          var cls = 'ppin' + (a.id === selId ? ' sel' : '') + (a.vs <= -10 ? ' buena' : '') + (a.aprox ? ' aprox' : '');
          L.marker([a.lat, a.lng], { icon: L.divIcon({ className: '', html: '<div class="' + cls + '">' + esc(precioK(a.p)) + '</div>', iconSize: [0, 0] }), zIndexOffset: a.id === selId ? 2000 : 500 })
            .addTo(capa).on('click', function () { onClick(a.id); });
        });
      },
      encuadrar: function (pts) {
        if (!pts.length) return;
        if (pts.length === 1) { m.flyTo(pts[0], 16, { duration: 0.6 }); return; }
        m.flyToBounds(pts, { padding: [40, 40], maxZoom: 16, duration: 0.6 });
      },
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
      props: function (items, selId, onClick) {
        (this._mk || []).forEach(function (k) { k.setMap(null); });
        this._mk = items.map(function (a) {
          var s = a.id === selId, c = a.vs <= -10 ? '#2ecc71' : '#d4af6a';
          var k = new google.maps.Marker({
            map: m, position: { lat: a.lat, lng: a.lng }, zIndex: s ? 2000 : 500,
            opacity: a.aprox && !s ? 0.75 : 1,
            icon: { path: 'M -24,-11 L 24,-11 L 24,9 L 5,9 L 0,15 L -5,9 L -24,9 Z', fillColor: s ? '#1d2430' : '#ffffff', fillOpacity: 1, strokeColor: c, strokeWeight: 2, scale: 1, labelOrigin: new google.maps.Point(0, -1) },
            label: { text: precioK(a.p), color: s ? '#ffffff' : '#1d2430', fontWeight: '700', fontSize: '11px' }
          });
          k.addListener('click', function () { onClick(a.id); });
          return k;
        });
      },
      encuadrar: function (pts) {
        if (!pts.length) return;
        if (pts.length === 1) { m.panTo({ lat: pts[0][0], lng: pts[0][1] }); m.setZoom(16); return; }
        var b = new google.maps.LatLngBounds();
        pts.forEach(function (p) { b.extend({ lat: p[0], lng: p[1] }); });
        m.fitBounds(b, 40);
      },
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
    if (vista !== 'zonas') return;
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
        '<div class="info"><b>' + esc(it.z.nombre) + '</b><small>' + esc(it.z.tipo || '') +
        (it.z.mercado ? ' · USD ' + miles(it.z.mercado.venta_usd_m2) + '/m²' : '') + '</small>' +
        (presu && it.z.mercado ? '<span class="alcanza">Te alcanza para ≈ ' + Math.floor(presu / it.z.mercado.venta_usd_m2) + ' m²</span>' : '') + '</div>' +
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
    if (p.zonaprop) out += '<a class="portal zp" target="_blank" rel="noopener" href="' + esc('https://www.zonaprop.com.ar/' + p.zonaprop) + '">Zonaprop</a>';
    if (p.argenprop) out += '<a class="portal ap" target="_blank" rel="noopener" href="' + esc('https://www.argenprop.com/' + p.argenprop) + '">Argenprop</a>';
    if (p.mercadolibre) out += '<a class="portal ml" target="_blank" rel="noopener" href="https://inmuebles.mercadolibre.com.ar/venta/cordoba/cordoba/' + encodeURIComponent(p.mercadolibre) + '/">MercadoLibre</a>';
    return out ? '<div class="h-sec">Propiedades en venta con precio</div><div class="portales">' + out + '</div>' : '';
  }

  function mercado(z) {
    var m = z.mercado;
    if (!m) return z.precio ? '<div class="precio"><b>Precios de referencia:</b> ' + esc(z.precio) + '</div>' : '';
    var r = m.rentabilidad != null ? String(m.rentabilidad).replace('.', ',') + '%' : '—';
    var alc = presu ? '<div class="h-alc">Con USD ' + miles(presu) + ' te alcanza para unos <b>' + Math.floor(presu / m.venta_usd_m2) + ' m²</b> de departamento acá.</div>' : '';
    return '<div class="h-sec">Datos reales del mercado · ' + esc(mesTxt(m.fecha)) + '</div>' +
      '<div class="stats">' +
      '<div class="stat"><b>USD ' + miles(m.venta_usd_m2) + '</b><span>m² en venta</span></div>' +
      '<div class="stat"><b>$ ' + miles(m.alquiler_ars_m2) + '</b><span>m² de alquiler por mes</span></div>' +
      '<div class="stat"><b>' + r + '</b><span>rentabilidad bruta anual</span></div>' +
      '</div>' + alc +
      '<p class="fuente">' + esc(m.fuente) + ' (' + m.n_venta + ' en venta, ' + m.n_alq + ' en alquiler). Hay ' + miles(m.oferta_venta || 0) + ' departamentos publicados en venta y ' + miles(m.oferta_alquiler || 0) + ' en alquiler. Dólar MEP $ ' + miles(m.mep) + '.' +
      (m.renta_fiable ? '' : ' <em>Hay pocos avisos de alquiler: tomá la rentabilidad como orientativa.</em>') + '</p>';
  }

  function ficha() {
    var z = zona(sel); if (!z) return;
    var p = puntaje(z, modo), c = color(p);
    var dims = data.dimensiones[modo].map(function (d) {
      var v = z[modo][d.k];
      var real = z.mercado && (d.k === 'entrada' || (d.k === 'renta' && z.mercado.rentabilidad != null));
      return '<div class="dim"><span>' + esc(d.t) + (real ? ' <i class="real">dato real</i>' : '') + '</span><em>' + v + '/10</em><div class="b"><i style="width:' + v * 10 + '%"></i></div></div>';
    }).join('');
    var datos = (z.datos || []).length ? '<div class="h-sec">Datos</div><ul class="datos">' + z.datos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';
    $('hojaCont').innerHTML =
      '<h2 class="h-tit">' + esc(z.nombre) + '</h2><span class="h-tipo">' + esc(z.tipo || '') + '</span>' +
      '<div class="h-score"><div class="anillo" style="background:conic-gradient(' + c + ' ' + p * 3.6 + 'deg,#2a3342 0)"><div style="color:' + c + '">' + p + '</div></div>' +
      '<p><b style="color:' + c + '">' + etiqueta(p) + ' para ' + (modo === 'comprar' ? 'comprar' : 'vender') + '.</b> ' + esc(z['motivo_' + modo] || '') + '</p></div>' +
      mercado(z) +
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


  /* ---------- avisos: oportunidades y tasación ---------- */
  var vista = 'zonas', avisos = null, selAviso = null;
  var AVISOS_REMOTO = 'https://loreal-state.netlify.app/data/avisos.json';
  function precioK(p) { return p >= 1e6 ? 'US$' + (Math.round(p / 1e5) / 10) + 'M' : 'US$' + Math.round(p / 1000) + 'k'; }
  function nombreZ(id) { var z = zona(id); return z ? z.nombre.split('–')[0].trim() : id; }
  function hashTxt(t) { var h = 0; for (var i = 0; i < t.length; i++) h = ((h << 5) - h + t.charCodeAt(i)) | 0; return Math.abs(h); }
  // posición en el mapa: exacta si se pudo ubicar la dirección; si no, aproximada dentro del barrio
  function ubicar(lista) {
    return lista.map(function (a) {
      if (a.lat) return a;
      var z = zona(a.z); if (!z) return null;
      var h = hashTxt(String(a.id)), ang = (h % 360) * Math.PI / 180, r = 0.0015 + ((h >> 9) % 100) / 100 * 0.0045;
      return Object.assign({}, a, { lat: z.lat + Math.sin(ang) * r, lng: z.lng + Math.cos(ang) * r, aprox: true });
    }).filter(Boolean);
  }
  function linkAviso(a) { return 'https://www.zonaprop.com.ar' + a.u; }
  function cargarAvisos() {
    var local = fetch('data/avisos.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var remoto = fetch(AVISOS_REMOTO + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return Promise.all([local, remoto]).then(function (r) {
      var a = r[0], b = r[1];
      var ok = function (x) { return x && Array.isArray(x.avisos) && x.avisos.length; };
      avisos = ok(b) && (!ok(a) || (b.fecha || '') >= (a.fecha || '')) ? b : (ok(a) ? a : null);
    });
  }

  function cambiarVista(v) {
    vista = v;
    [].forEach.call(document.querySelectorAll('.nv'), function (b) { b.classList.toggle('on', b.getAttribute('data-vista') === v); });
    $('vZonas').hidden = v !== 'zonas'; $('vOpor').hidden = v !== 'opor'; $('vTasar').hidden = v !== 'tasar';
    $('hoja').hidden = true; selAviso = null;
    $('leyenda').innerHTML = v === 'zonas'
      ? '<span><i class="c1"></i>Excelente</span><span><i class="c2"></i>Muy buena</span><span><i class="c3"></i>Buena</span>'
      : '<span><i class="c1"></i>Bajo su barrio</span><span><i style="background:#d4af6a"></i>Resto</span>';
    if (mapa) { mapa.area(null); mapa.props([], null, function () {}); }
    if (v === 'zonas') { sel = null; render(true); return; }
    if (mapa) mapa.pins([]);
    if (!avisos) { $('oInfo').textContent = 'Cargando avisos…'; cargarAvisos().then(function () { cambiarVista(v); }); return; }
    if (v === 'opor') renderOpor(true); else renderTasar();
  }

  /* --- oportunidades --- */
  var filtro = { max: 0, barrio: '', m2: 0, dorm: '', coch: false, pozo: false, baja: false, dudosos: false, orden: 'vs' };
  // avisos con números que no cierran (m² mal cargados, precio de anticipo, etc.)
  function dudoso(a) { return a.vs <= -40 || a.p < 30000 || (a.renta && a.renta > 14); }
  function leerFiltro() {
    filtro.max = parseInt(($('fMax').value || '').replace(/[^\d]/g, ''), 10) || 0;
    filtro.m2 = parseInt(($('fM2').value || '').replace(/[^\d]/g, ''), 10) || 0;
    filtro.barrio = $('fBarrio').value; filtro.orden = $('fOrden').value;
    filtro.coch = $('fCoch').checked; filtro.pozo = $('fPozo').checked; filtro.baja = $('fBaja').checked; filtro.dudosos = $('fDud').checked;
    try { ls('filtro', JSON.stringify(filtro)); } catch (e) { /* sin guardar */ }
  }
  function filtrar() {
    var f = filtro;
    var out = avisos.avisos.filter(function (a) {
      if (f.max && a.p > f.max) return false;
      if (f.barrio && a.z !== f.barrio) return false;
      if (f.m2 && a.m2 < f.m2) return false;
      if (f.dorm === '1' && a.dorm !== 1) return false;
      if (f.dorm === '2' && a.dorm !== 2) return false;
      if (f.dorm === '3' && !(a.dorm >= 3)) return false;
      if (f.coch && !a.coch) return false;
      if (!f.pozo && a.pozo) return false;
      if (f.baja && !a.p_ant) return false;
      if (!f.dudosos && dudoso(a)) return false;
      return true;
    });
    var baja = function (a) { return a.p_ant ? (a.p_ant - a.p) / a.p_ant : 0; };
    out.sort(function (a, b) {
      if (f.orden === 'renta') return (b.renta || 0) - (a.renta || 0);
      if (f.orden === 'baja') return baja(b) - baja(a) || a.vs - b.vs;
      if (f.orden === 'precio') return a.p - b.p;
      return a.vs - b.vs;
    });
    return out;
  }
  function tarjetaAviso(a) {
    var tags = '';
    if (a.vs <= -5) tags += '<span class="tag ok">' + a.vs + '% vs barrio</span>';
    else if (a.vs >= 10) tags += '<span class="tag caro">+' + a.vs + '% vs barrio</span>';
    else tags += '<span class="tag">' + (a.vs > 0 ? '+' : '') + a.vs + '% vs barrio</span>';
    if (a.renta) tags += '<span class="tag">Renta ' + String(a.renta).replace('.', ',') + '%</span>';
    if (a.p_ant) tags += '<span class="tag baja">Bajó ' + Math.round((a.p_ant - a.p) / a.p_ant * 100) + '%</span>';
    if (a.estrenar) tags += '<span class="tag">A estrenar</span>';
    if (a.pozo) tags += '<span class="tag caro">En pozo</span>';
    if (dudoso(a)) tags += '<span class="tag caro">Datos dudosos: revisá el aviso</span>';
    var carac = [a.m2 + ' m²', a.dorm != null ? (a.dorm === 0 ? 'Monoamb.' : a.dorm + ' dorm.') : '', a.banos ? a.banos + ' baño' + (a.banos > 1 ? 's' : '') : '', a.coch ? 'Cochera' : ''].filter(Boolean).join(' · ');
    return '<div class="aviso' + (selAviso === a.id ? ' sel' : '') + '" data-aviso="' + esc(a.id) + '">' +
      '<div class="av-top"><b>USD ' + miles(a.p) + '</b>' + (a.p_ant ? '<s>USD ' + miles(a.p_ant) + '</s>' : '') + '<span class="av-m2">USD ' + miles(a.m2p) + '/m²</span></div>' +
      '<div class="av-loc">' + esc(nombreZ(a.z)) + (a.dir ? ' · ' + esc(a.dir) : '') + '</div>' +
      '<div class="av-car">' + esc(carac) + '</div>' +
      '<div class="tags">' + tags + '</div>' +
      '<div class="av-btns"><a class="btn" target="_blank" rel="noopener" href="' + esc(linkAviso(a)) + '">Ver aviso</a>' +
      '<button class="btn sec" data-mapa="' + esc(a.id) + '">Ver en el mapa</button></div>' +
      (a.lat ? '' : '<div class="sinmapa">Ubicación aproximada: el aviso no trae la dirección exacta</div>') + '</div>';
  }
  var oCache = [];
  function renderOpor(encuadrar) {
    leerFiltro();
    oCache = filtrar();
    var top = oCache.slice(0, 120);
    $('oInfo').innerHTML = '<b>' + oCache.length + '</b> departamentos' + (oCache.length > 120 ? ' (te muestro los 120 primeros)' : '') +
      ' · avisos de Zonaprop al ' + fechaTxt(avisos.fecha);
    $('oLista').innerHTML = top.length ? top.map(tarjetaAviso).join('') +
      '<p class="nota-av">"vs barrio" compara el precio por m² con la mediana de los departamentos en venta del mismo barrio. La renta es estimada con el alquiler promedio del barrio. Son precios publicados, no de cierre: revisá siempre el aviso, el estado y la documentación.</p>'
      : '<p class="nota-av">No hay departamentos con esos filtros. Probá ampliar el presupuesto o sacar algún filtro.</p>';
    $('fResumen').textContent = '· ' + oCache.length;
    var conGeo = ubicar(top);
    if (mapa) {
      mapa.props(conGeo, selAviso, elegirAviso);
      if (encuadrar) mapa.encuadrar(conGeo.map(function (a) { return [a.lat, a.lng]; }));
    }
  }
  function elegirAviso(id) {
    selAviso = id;
    var a = avisos.avisos.filter(function (x) { return x.id === id; })[0];
    if (document.body.classList.contains('sin-lista')) $('btnLista').click();
    if (vista === 'opor') {
      renderOpor(false);
      var el = document.querySelector('.aviso[data-aviso="' + id + '"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (vista === 'tasar') {
      renderTasar(true);
    }
    var u = a ? ubicar([a])[0] : null;
    if (u && mapa) mapa.encuadrar([[u.lat, u.lng]]);
  }

  /* --- tasación --- */
  function cuantil(v, q) { var s = v.slice().sort(function (a, b) { return a - b; }); var i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); }
  function renderTasar(sinEncuadre) {
    var b = $('tBarrio').value, m2 = parseInt(($('tM2').value || '').replace(/[^\d]/g, ''), 10) || 0;
    var d = parseInt($('tDorm').value, 10), coch = $('tCoch').value === '1';
    try { ls('tasar', JSON.stringify({ b: b, m2: m2, d: d, c: coch })); } catch (e) { /* sin guardar */ }
    if (!m2) { $('tRes').innerHTML = '<p class="nota-av">Cargá los m² cubiertos para calcular.</p>'; if (mapa) mapa.props([], null, elegirAviso); return; }
    var base = avisos.avisos.filter(function (a) { return a.z === b && !a.pozo && !dudoso(a); });
    var dist = function (a) { return Math.abs(a.m2 - m2) / m2 + (a.dorm === d || (d >= 3 && a.dorm >= 3) ? 0 : 0.35) + ((!!a.coch) === coch ? 0 : 0.12); };
    var comps = base.filter(function (a) { return Math.abs(a.m2 - m2) / m2 <= 0.35; }).sort(function (x, y) { return dist(x) - dist(y); }).slice(0, 15);
    var ampliado = false;
    if (comps.length < 5) { comps = base.slice().sort(function (x, y) { return dist(x) - dist(y); }).slice(0, 15); ampliado = true; }
    if (comps.length < 3) { $('tRes').innerHTML = '<p class="nota-av">Hay muy pocos departamentos parecidos publicados en este barrio para estimar un precio. Probá con otro barrio cercano.</p>'; return; }
    var v = comps.map(function (a) { return a.m2p; });
    var p25 = cuantil(v, 0.25), p50 = cuantil(v, 0.5), p75 = cuantil(v, 0.75);
    var r = function (x) { return Math.round(x * m2 / 500) * 500; };
    var similares = base.filter(function (a) { return Math.abs(a.m2 - m2) / m2 <= 0.2 && (a.dorm === d || (d >= 3 && a.dorm >= 3)); }).length;
    var comp = similares >= 15 ? 'mucha' : similares >= 6 ? 'moderada' : 'poca';
    $('tRes').innerHTML =
      '<div class="rango">' +
      '<div><span>Para vender rápido</span><b>USD ' + miles(r(p25)) + '</b></div>' +
      '<div class="medio"><span>Precio de mercado</span><b>USD ' + miles(r(p50)) + '</b></div>' +
      '<div><span>Precio alto</span><b>USD ' + miles(r(p75)) + '</b></div></div>' +
      '<p class="t-txt">Calculado con <b>' + comps.length + ' departamentos parecidos</b> publicados en ' + esc(nombreZ(b)) + (ampliado ? ' (amplié el rango de m² porque había pocos)' : '') +
      ': entre USD ' + miles(Math.round(p25)) + ' y ' + miles(Math.round(p75)) + ' por m². Hay <b>' + comp + ' competencia</b>: ' + similares + ' avisos muy parecidos al tuyo.' +
      (comp === 'mucha' ? ' Para destacarte, publicá cerca del precio rápido.' : comp === 'poca' ? ' Tenés margen para publicar cerca del precio de mercado o algo más.' : '') + '</p>' +
      '<p class="nota-av">Son precios de publicación; las ventas suelen cerrar por debajo. Para el precio final conviene la tasación de un corredor matriculado.</p>' +
      '<div class="h-sec">Tu competencia</div>' + comps.map(tarjetaAviso).join('');
    var conGeo = ubicar(comps);
    if (mapa) {
      mapa.props(conGeo, selAviso, elegirAviso);
      if (!sinEncuadre) mapa.encuadrar(conGeo.map(function (a) { return [a.lat, a.lng]; }));
    }
  }

  function eventosAvisos() {
    [].forEach.call(document.querySelectorAll('.nv'), function (b) { b.onclick = function () { cambiarVista(b.getAttribute('data-vista')); }; });
    var opts = data.zonas.map(function (z) { return '<option value="' + esc(z.id) + '">' + esc(z.nombre) + '</option>'; }).join('');
    $('fBarrio').innerHTML = '<option value="">Todos</option>' + opts;
    $('tBarrio').innerHTML = opts;
    try {
      var f = JSON.parse(ls('filtro') || 'null');
      if (f) {
        if (f.max) $('fMax').value = miles(f.max);
        if (f.m2) $('fM2').value = f.m2;
        $('fBarrio').value = f.barrio || ''; $('fOrden').value = f.orden || 'vs';
        $('fCoch').checked = !!f.coch; $('fPozo').checked = !!f.pozo; $('fBaja').checked = !!f.baja; $('fDud').checked = !!f.dudosos;
        filtro.dorm = f.dorm || '';
      }
      var t = JSON.parse(ls('tasar') || 'null');
      if (t) { $('tBarrio').value = t.b; if (t.m2) $('tM2').value = t.m2; $('tDorm').value = String(t.d); $('tCoch').value = t.c ? '1' : '0'; }
    } catch (e) { /* sin preferencias */ }
    if (!$('fMax').value && presu) $('fMax').value = miles(presu);
    [].forEach.call(document.querySelectorAll('#fDorm button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-d') === filtro.dorm);
      b.onclick = function () {
        filtro.dorm = b.getAttribute('data-d');
        [].forEach.call(document.querySelectorAll('#fDorm button'), function (x) { x.classList.toggle('on', x === b); });
        renderOpor(true);
      };
    });
    var numerico = function (el) { var n = parseInt(el.value.replace(/[^\d]/g, ''), 10) || 0; el.value = n ? (el.id === 'fMax' ? miles(n) : String(n)) : ''; };
    var tO = null;
    ['fMax', 'fM2'].forEach(function (id) { $(id).addEventListener('input', function () { numerico(this); clearTimeout(tO); tO = setTimeout(function () { renderOpor(true); }, 350); }); });
    ['fBarrio', 'fOrden', 'fCoch', 'fPozo', 'fBaja', 'fDud'].forEach(function (id) { $(id).addEventListener('change', function () { renderOpor(true); }); });
    var tT2 = null;
    $('tM2').addEventListener('input', function () { numerico(this); clearTimeout(tT2); tT2 = setTimeout(function () { renderTasar(); }, 350); });
    ['tBarrio', 'tDorm', 'tCoch'].forEach(function (id) { $(id).addEventListener('change', function () { renderTasar(); }); });
    var clickAviso = function (e) {
      var bm = e.target.closest('[data-mapa]');
      if (bm) { elegirAviso(bm.getAttribute('data-mapa')); return; }
    };
    $('oLista').addEventListener('click', clickAviso);
    $('tRes').addEventListener('click', clickAviso);
    if (window.matchMedia && window.matchMedia('(max-width: 899px)').matches) $('filtros').open = false;
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
    $('btnTodo').onclick = function () {
      if (vista === 'zonas') { cerrarFicha(); return; }
      selAviso = null;
      if (vista === 'opor') renderOpor(true); else renderTasar();
    };
    $('btnEstilo').onclick = function () {
      oscuro = !oscuro; document.body.classList.toggle('oscuro', oscuro);
      $('btnEstilo').textContent = oscuro ? '☾ Oscuro' : '☀ Claro';
      if (mapa) mapa.estilo(oscuro); ls('oscuro', oscuro ? '1' : null);
    };
    $('btnRefresh').onclick = function () { actualizar(true); };
    var guardado = parseInt(ls('presu') || '0', 10) || 0;
    if (guardado) { presu = guardado; $('inPresu').value = miles(guardado); }
    $('inPresu').addEventListener('input', function () {
      var n = parseInt(this.value.replace(/[^\d]/g, ''), 10) || 0;
      presu = n; this.value = n ? miles(n) : '';
      ls('presu', n ? String(n) : null);
      render(false);
    });
    $('btnLista').onclick = function () {
      var oculto = document.body.classList.toggle('sin-lista');
      $('btnLista').textContent = oculto ? '☰ Ver zonas' : '⤢ Mapa completo';
      setTimeout(function () { if (mapa) mapa.resize(); }, 260);
    };
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
        eventosAvisos();
        cargarAvisos();
        setTimeout(function () { if (mapa) mapa.resize(); }, 300);
        if (!ls('vioAyuda')) $('dlgAyuda').hidden = false;
        actualizar(false);
      })
      .catch(function () { toast('No pude cargar los datos.'); });
  }
  arrancar();
})();
