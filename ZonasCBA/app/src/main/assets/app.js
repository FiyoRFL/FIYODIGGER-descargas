(function () {
  'use strict';

  var REMOTE = 'https://raw.githubusercontent.com/FiyoRFL/FIYODIGGER-descargas/main/ZonasCBA/app/src/main/assets/data/zonas.json';
  var HORAS_ENTRE_SYNC = 6;

  var $ = function (id) { return document.getElementById(id); };
  var data = null, modo = 'vender', sel = null, mapa = null, ultimoSync = 0, primerFit = true;

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function urlSegura(u) { return /^https:\/\//i.test(u) ? u : '#'; }
  function num(n) { return typeof n === 'number' && isFinite(n); }
  function fechaTxt(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '--';
  }

  var tTost = null;
  function toast(t) {
    var el = $('toast');
    el.textContent = t;
    el.classList.add('on');
    clearTimeout(tTost);
    tTost = setTimeout(function () { el.classList.remove('on'); }, 2600);
  }

  /* ---------- datos ---------- */
  function validar(d) {
    if (!d || !Array.isArray(d.zonas) || !d.zonas.length || !d.pesos || !d.dimensiones || !Array.isArray(d.centro)) return false;
    return d.zonas.every(function (z) {
      if (!z || typeof z.id !== 'string' || typeof z.nombre !== 'string' || !num(z.lat) || !num(z.lng)) return false;
      return ['vender', 'comprar'].every(function (m) {
        return z[m] && d.dimensiones[m] && d.pesos[m] && d.dimensiones[m].every(function (dim) { return num(z[m][dim.k]); });
      });
    });
  }

  function puntaje(z, m) {
    var pesos = data.pesos[m], total = 0, suma = 0;
    Object.keys(pesos).forEach(function (k) {
      total += pesos[k];
      suma += pesos[k] * (z[m][k] || 0);
    });
    return total ? Math.round((suma / total) * 10) : 0;
  }

  function ranking(m) {
    return data.zonas.map(function (z) { return { z: z, p: puntaje(z, m) }; })
      .sort(function (a, b) { return b.p - a.p; });
  }

  function color(p) {
    if (p >= 75) return '#12a150';
    if (p >= 65) return '#6aa81f';
    if (p >= 55) return '#f5a524';
    return '#8b97a3';
  }
  function etiqueta(p) {
    if (p >= 75) return 'Excelente';
    if (p >= 65) return 'Muy buena';
    if (p >= 55) return 'Buena';
    return 'Media';
  }
  function icono(z) {
    var casa = /casa|cerrado/i.test(z.tipo || '');
    return casa
      ? '<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 21V5l9-3v6l7 2v11h-6v-4h-4v4z"/></svg>';
  }

  /* ---------- mapa ---------- */
  var ESTILO_GOOGLE = [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }];

  function mapaLeaflet() {
    var cont = $('map');
    cont.innerHTML = '';
    var m = L.map('map', { zoomControl: false, attributionControl: false }).setView(data.centro, 12);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO'
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    var capa = L.layerGroup().addTo(m);
    return {
      set: function (items, selId) {
        capa.clearLayers();
        items.forEach(function (it) {
          var ic = L.divIcon({
            className: '',
            html: '<div class="pin' + (it.z.id === selId ? ' sel' : '') + '" style="--c:' + color(it.p) + '">' + it.p + '</div>',
            iconSize: [0, 0], iconAnchor: [0, 0]
          });
          L.marker([it.z.lat, it.z.lng], { icon: ic }).addTo(capa)
            .on('click', function () { seleccionar(it.z.id); });
        });
      },
      focus: function (z) { m.flyTo([z.lat, z.lng], 14, { duration: 0.6 }); },
      fit: function (items) {
        m.fitBounds(items.map(function (it) { return [it.z.lat, it.z.lng]; }), { padding: [30, 30] });
      },
      resize: function () { m.invalidateSize(); }
    };
  }

  function mapaGoogle() {
    var m = new google.maps.Map($('map'), {
      center: { lat: data.centro[0], lng: data.centro[1] }, zoom: 12,
      disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', styles: ESTILO_GOOGLE
    });
    var marcas = [];
    return {
      set: function (items, selId) {
        marcas.forEach(function (k) { k.setMap(null); });
        marcas = items.map(function (it) {
          var k = new google.maps.Marker({
            map: m, position: { lat: it.z.lat, lng: it.z.lng },
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: it.z.id === selId ? 20 : 16,
              fillColor: it.z.id === selId ? '#0f2a43' : '#ffffff', fillOpacity: 1, strokeColor: color(it.p), strokeWeight: 3
            },
            label: { text: String(it.p), color: it.z.id === selId ? '#ffffff' : color(it.p), fontWeight: '800', fontSize: '12px' }
          });
          k.addListener('click', function () { seleccionar(it.z.id); });
          return k;
        });
      },
      focus: function (z) { m.panTo({ lat: z.lat, lng: z.lng }); m.setZoom(14); },
      fit: function (items) {
        var b = new google.maps.LatLngBounds();
        items.forEach(function (it) { b.extend({ lat: it.z.lat, lng: it.z.lng }); });
        m.fitBounds(b, 30);
      },
      resize: function () { google.maps.event.trigger(m, 'resize'); }
    };
  }

  function cargarGoogle(key) {
    return new Promise(function (res, rej) {
      if (window.google && window.google.maps) return res();
      window.__gmListo = function () { res(); };
      window.gm_authFailure = function () {
        toast('Google rechazó la clave. Uso el mapa libre.');
        mapa = mapaLeaflet();
        render();
      };
      var s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&callback=__gmListo';
      s.onerror = function () { rej(new Error('gm')); };
      document.head.appendChild(s);
      setTimeout(function () { rej(new Error('timeout')); }, 12000);
    });
  }

  function iniciarMapa() {
    var key = ls('gkey');
    if (!key) { mapa = mapaLeaflet(); return Promise.resolve(); }
    return cargarGoogle(key).then(function () { mapa = mapaGoogle(); })
      .catch(function () {
        toast('No pude cargar Google Maps. Uso el mapa libre.');
        mapa = mapaLeaflet();
      });
  }

  /* ---------- interfaz ---------- */
  function linkMaps(z) { return 'https://www.google.com/maps/search/?api=1&query=' + z.lat + ',' + z.lng; }
  function gq(z, sitio) {
    return 'https://www.google.com/search?q=' +
      encodeURIComponent('propiedades en venta ' + (z.busqueda || z.nombre) + ' Córdoba site:' + sitio);
  }
  function portales(z) {
    var p = z.portales || {};
    var zp = p.zonaprop ? 'https://www.zonaprop.com.ar/' + p.zonaprop : gq(z, 'zonaprop.com.ar');
    var ap = p.argenprop ? 'https://www.argenprop.com/' + p.argenprop : gq(z, 'argenprop.com');
    var ml = p.mercadolibre ? 'https://inmuebles.mercadolibre.com.ar/venta/cordoba/cordoba/' + encodeURIComponent(p.mercadolibre) + '/' : gq(z, 'inmuebles.mercadolibre.com.ar');
    return '<div class="avisos"><span>Ver viviendas en venta con precio</span><div class="chips">' +
      '<a class="chip zp" target="_blank" href="' + esc(zp) + '">Zonaprop</a>' +
      '<a class="chip ap" target="_blank" href="' + esc(ap) + '">Argenprop</a>' +
      '<a class="chip ml" target="_blank" href="' + esc(ml) + '">MercadoLibre</a>' +
      '</div></div>';
  }

  function linkRuta(z) { return 'https://www.google.com/maps/dir/?api=1&destination=' + z.lat + ',' + z.lng; }

  function tarjeta(it, i) {
    var z = it.z, abierta = sel === z.id, c = color(it.p);
    var dims = data.dimensiones[modo].map(function (d) {
      var v = z[modo][d.k];
      return '<div class="dim"><span>' + esc(d.t) + '</span><em>' + v + '/10</em><div class="b"><i style="width:' + (v * 10) + '%"></i></div></div>';
    }).join('');
    var datos = (z.datos && z.datos.length)
      ? '<ul class="datos">' + z.datos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';
    var precio = z.precio ? '<div class="precio"><b>Precios de referencia:</b> ' + esc(z.precio) + '</div>' : '';
    return '<article class="card' + (abierta ? ' sel' : '') + '" data-id="' + esc(z.id) + '">' +
      '<div class="cab"><div class="foto" style="background:linear-gradient(135deg,' + c + ',#0f2a43)">' + icono(z) + '<em>' + (i + 1) + '</em></div>' +
      '<div class="nom"><b>' + esc(z.nombre) + '</b><small>' + esc(z.tipo || '') + '</small></div>' +
      '<div class="pts" style="color:' + c + '"><b>' + it.p + '</b><span>' + etiqueta(it.p) + '</span></div></div>' +
      precio +
      '<p class="motivo">' + esc(z['motivo_' + modo] || '') + '</p>' +
      portales(z) +
      '<div class="vermas">' + (abierta ? 'Ver menos ▲' : 'Ver detalle ▼') + '</div>' +
      '<div class="det">' + dims + datos +
      '<div class="btns"><a class="btn" target="_blank" href="' + linkMaps(z) + '">Abrir en Google Maps</a>' +
      '<a class="btn sec" target="_blank" href="' + linkRuta(z) + '">Cómo llegar</a></div></div>' +
      '</article>';
  }

  function render() {
    if (!data) return;
    var items = ranking(modo);
    $('tabVender').classList.toggle('on', modo === 'vender');
    $('tabComprar').classList.toggle('on', modo === 'comprar');
    $('leyenda').innerHTML =
      '<span><i style="background:#12a150"></i>Excelente</span><span><i style="background:#6aa81f"></i>Muy buena</span><span><i style="background:#f5a524"></i>Buena</span>';
    $('tituloLista').innerHTML = modo === 'vender'
      ? '<b>Dónde conviene vender</b>Zonas ordenadas por demanda, rapidez de venta y valorización'
      : '<b>Dónde conviene comprar</b>Zonas ordenadas por precio de entrada, renta y crecimiento';
    var fuentes = (data.fuentes || []).map(function (f) {
      return '<a target="_blank" href="' + esc(urlSegura(f.u)) + '">' + esc(f.t) + '</a>';
    }).join('');
    $('lista').innerHTML = items.map(tarjeta).join('') +
      '<div class="aviso">' + esc(data.nota || '') + '</div>' +
      (fuentes ? '<div class="fuentes"><b>Fuentes</b>' + fuentes + '</div>' : '');
    if (mapa) {
      mapa.set(items, sel);
      if (primerFit) { mapa.fit(items); primerFit = false; }
    }
    estado();
  }

  function seleccionar(id) {
    sel = (sel === id) ? null : id;
    render();
    if (sel && mapa) {
      var z = data.zonas.filter(function (x) { return x.id === sel; })[0];
      if (z) mapa.focus(z);
      var card = document.querySelector('.card[data-id="' + sel + '"]');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function estado() {
    if (!data) return;
    var corta = fechaTxt(data.actualizado).replace(/\/(\d{2})(\d{2})$/, '/$2');
    var marca = ' ✗';
    if (ultimoSync) {
      var d = new Date(ultimoSync);
      marca = ' ✓ ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    $('estado').textContent = 'Datos al ' + corta + marca;
    $('infoDatos').textContent =
      'Datos del ' + fechaTxt(data.actualizado) + '\n' +
      'Zonas: ' + data.zonas.length + '\n' +
      'Mapa: ' + (ls('gkey') ? 'Google Maps' : 'OpenStreetMap') + '\n' +
      'Ultima sync: ' + (ultimoSync ? new Date(ultimoSync).toLocaleString('es-AR') : 'todavía ninguna') + '\n' +
      'La app busca datos nuevos al abrir y cada ' + HORAS_ENTRE_SYNC + ' h.';
  }

  /* ---------- sincronización ---------- */
  function mejorDe(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((b.version || 0) !== (a.version || 0)) return (b.version || 0) > (a.version || 0) ? b : a;
    return (b.actualizado || '') > (a.actualizado || '') ? b : a;
  }

  function girar(on) { $('btnRefresh').classList.toggle('giro', !!on); }

  function pedirRemoto(manual) {
    girar(true);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    var opts = { cache: 'no-store' };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(REMOTE + '?t=' + Date.now(), opts)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) {
        clearTimeout(t);
        if (!validar(d)) throw new Error('formato');
        ultimoSync = Date.now();
        ls('ultimoSync', String(ultimoSync));
        var cambio = !data || mejorDe(data, d) === d && JSON.stringify(d) !== JSON.stringify(data);
        if (cambio) {
          data = d;
          ls('cache', JSON.stringify(d));
          render();
          toast('Datos actualizados al ' + fechaTxt(d.actualizado));
        } else {
          estado();
          if (manual) toast('Ya tenés lo último');
        }
      })
      .catch(function () {
        clearTimeout(t);
        estado();
        if (manual) toast('No pude conectar. Sigo con los datos guardados.');
      })
      .then(function () { girar(false); });
  }

  function syncSiToca() {
    if (!data) return;
    if (Date.now() - ultimoSync > HORAS_ENTRE_SYNC * 3600 * 1000) pedirRemoto(false);
  }

  /* ---------- ajustes ---------- */
  function abrirAjustes() { $('inKey').value = ls('gkey') || ''; estado(); $('dlg').hidden = false; }
  function cerrarAjustes() { $('dlg').hidden = true; }

  window.manejarAtrasDesdeAndroid = function () {
    if (!$('dlg').hidden) { cerrarAjustes(); return true; }
    if (sel) { seleccionar(sel); return true; }
    return false;
  };

  /* ---------- arranque ---------- */
  function eventos() {
    $('tabVender').addEventListener('click', function () { modo = 'vender'; sel = null; primerFit = true; render(); });
    $('tabComprar').addEventListener('click', function () { modo = 'comprar'; sel = null; primerFit = true; render(); });
    $('lista').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) return;
      var c = e.target.closest ? e.target.closest('.card') : null;
      if (c) seleccionar(c.getAttribute('data-id'));
    });
    $('btnRefresh').addEventListener('click', function () { pedirRemoto(true); });
    $('btnAjustes').addEventListener('click', abrirAjustes);
    $('btnCerrar').addEventListener('click', cerrarAjustes);
    $('btnGuardar').addEventListener('click', function () {
      var k = $('inKey').value.trim();
      if (k) ls('gkey', k); else ls('gkey', null);
      location.reload();
    });
    $('btnQuitar').addEventListener('click', function () { ls('gkey', null); location.reload(); });
    window.addEventListener('resize', function () { if (mapa) mapa.resize(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncSiToca(); });
    setInterval(syncSiToca, 10 * 60 * 1000);
  }

  function arrancar() {
    eventos();
    ultimoSync = parseInt(ls('ultimoSync') || '0', 10) || 0;
    var cache = null;
    try { cache = JSON.parse(ls('cache') || 'null'); } catch (e) { cache = null; }
    if (cache && !validar(cache)) cache = null;

    fetch('data/zonas.json')
      .then(function (r) { return r.json(); })
      .then(function (local) {
        if (!validar(local)) local = null;
        data = mejorDe(local, cache) || cache;
        if (!data) throw new Error('sin datos');
        return iniciarMapa();
      })
      .then(function () {
        render();
        setTimeout(function () { if (mapa) mapa.resize(); }, 300);
        pedirRemoto(false);
      })
      .catch(function () {
        $('estado').textContent = 'Error de datos';
        toast('No pude leer los datos de la app.');
      });
  }

  arrancar();
})();
