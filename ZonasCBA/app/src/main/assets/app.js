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
  var ESTILO_GOOGLE = [
    { elementType: 'geometry', stylers: [{ color: '#142233' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8fa1b3' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1420' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243447' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1420' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] }
  ];

  function mapaLeaflet() {
    var cont = $('map');
    cont.innerHTML = '';
    var m = L.map('map', { zoomControl: false, attributionControl: false }).setView(data.centro, 12);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO'
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    var capa = L.layerGroup().addTo(m);
    var capaProps = L.layerGroup().addTo(m);
    return {
      setProps: function (items) {
        capaProps.clearLayers();
        items.forEach(function (it) {
          var ic = L.divIcon({
            className: '',
            html: '<div class="ppin' + (it.aprox ? ' aprox' : '') + '">' + esc(precioCorto(it)) + '</div>',
            iconSize: [0, 0], iconAnchor: [0, 0]
          });
          L.marker([it.lat, it.lng], { icon: ic, zIndexOffset: 1000 }).addTo(capaProps)
            .on('click', function () { fichaProp(it); });
        });
      },
      clearProps: function () { capaProps.clearLayers(); },
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
    var marcas = [], mprops = [];
    return {
      setProps: function (items) {
        mprops.forEach(function (k) { k.setMap(null); });
        mprops = items.map(function (it) {
          var k = new google.maps.Marker({
            map: m, position: { lat: it.lat, lng: it.lng }, zIndex: 1000,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            label: { text: precioCorto(it), color: '#ffffff', fontWeight: '700', fontSize: '11px', className: 'gpin' + (it.aprox ? ' aprox' : '') }
          });
          k.addListener('click', function () { fichaProp(it); });
          return k;
        });
      },
      clearProps: function () { mprops.forEach(function (k) { k.setMap(null); }); mprops = []; },
      set: function (items, selId) {
        marcas.forEach(function (k) { k.setMap(null); });
        marcas = items.map(function (it) {
          var k = new google.maps.Marker({
            map: m, position: { lat: it.z.lat, lng: it.z.lng },
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: it.z.id === selId ? 20 : 16,
              fillColor: it.z.id === selId ? '#ffffff' : '#0f1b29', fillOpacity: 1, strokeColor: color(it.p), strokeWeight: 3
            },
            label: { text: String(it.p), color: it.z.id === selId ? '#0b1420' : color(it.p), fontWeight: '800', fontSize: '12px' }
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
  function portales(z) {
    var p = z.portales || {}, out = '';
    if (p.zonaprop) out += '<a class="chip zp" target="_blank" href="' + esc('https://www.zonaprop.com.ar/' + p.zonaprop) + '">Zonaprop</a>';
    if (p.argenprop) out += '<a class="chip ap" target="_blank" href="' + esc('https://www.argenprop.com/' + p.argenprop) + '">Argenprop</a>';
    if (p.mercadolibre) out += '<a class="chip ml" target="_blank" href="' + esc('https://inmuebles.mercadolibre.com.ar/venta/cordoba/cordoba/' + encodeURIComponent(p.mercadolibre) + '/') + '">MercadoLibre</a>';
    if (!out) return '';
    return '<div class="avisos"><span>Ver viviendas en venta con precio</span><div class="chips">' + out + '</div></div>';
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
      '<button class="btn-props" data-props="' + esc(z.id) + '">🏠 Ver propiedades en venta en el mapa</button>' +
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
      if (props.zona) mapa.setProps(props.items);
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


  /* ---------- propiedades en el mapa (avisos de MercadoLibre) ---------- */
  var MAX_PAG = 3;
  var props = { zona: null, items: [], cola: [], vistos: {}, paginas: 0, ubicados: 0 };

  function zonaPorId(id) { return data.zonas.filter(function (x) { return x.id === id; })[0]; }
  function hayScraper() { return !!(window.AndroidScraper && window.AndroidScraper.cargar); }
  function mlUrl(z) {
    var s = (z.portales && z.portales.mercadolibre) || z.slug || z.id;
    return 'https://inmuebles.mercadolibre.com.ar/venta/cordoba/cordoba/' + encodeURIComponent(s) + '/';
  }
  function precioCorto(it) {
    var p = it.p, t;
    if (p >= 1e6) t = (Math.round(p / 1e5) / 10) + 'M';
    else if (p >= 1e3) t = Math.round(p / 1e3) + 'k';
    else t = String(p);
    return (it.m === 'USD' ? 'US$' : '$') + t;
  }
  function precioLargo(it) {
    return (it.m === 'USD' ? 'US$ ' : '$ ') + String(it.p).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }
  function claveGeo(it) { return 'geo:' + (it.loc || '').toLowerCase(); }

  function verPropiedades(id) {
    var z = zonaPorId(id);
    if (!z) return;
    if (!hayScraper()) { toast('Esto funciona dentro de la app Android.'); return; }
    props = { zona: id, items: [], cola: [], vistos: {}, paginas: 0, ubicados: 0, cargando: true, msg: '' };
    var P = props;
    if (mapa) { mapa.clearProps(); mapa.focus(z); }
    barraProps();
    window.AndroidScraper.cargar(mlUrl(z));
    setTimeout(function () {
      if (P === props && P.cargando && !P.items.length && !P.captcha) {
        P.cargando = false; P.msg = 'MercadoLibre no respondió. Tocá la zona y probá de nuevo.'; barraProps();
      }
    }, 30000);
  }

  function cerrarProps() {
    props = { zona: null, items: [], cola: [], vistos: {}, paginas: 0, ubicados: 0 };
    if (mapa) mapa.clearProps();
    $('ficha').hidden = true;
    barraProps();
  }

  window.onScraperCerrado = function () {
    if (props.zona && props.captcha) { props.msg = 'Falta la verificación de MercadoLibre.'; barraProps(); }
  };

  window.onAvisos = function (raw) {
    var P = props;
    if (!P.zona) return;
    var r = null;
    try { r = JSON.parse(raw); } catch (e) { r = null; }
    if (!r) { P.cargando = false; P.msg = 'No pude leer los avisos.'; barraProps(); return; }
    if (r.captcha) { P.captcha = true; barraProps(); return; }
    if (P.captcha) { P.captcha = false; window.AndroidScraper.ocultar(); }
    var z = zonaPorId(P.zona);
    (r.items || []).forEach(function (it) {
      if (!it || !it.u || P.vistos[it.u] || !(it.p > 0)) return;
      P.vistos[it.u] = 1;
      P.items.push(it);
      ubicar(it, z, P);
    });
    P.paginas++;
    if (r.next && P.paginas < MAX_PAG && /^https:\/\/[^\/]*mercadolibre\.com\.ar\//.test(r.next) && (r.items || []).length) {
      setTimeout(function () { if (P === props) window.AndroidScraper.cargar(r.next); }, 1200);
    } else {
      P.cargando = false;
      if (!P.items.length) P.msg = 'No encontré avisos con precio en esta zona.';
    }
    dibujarProps();
    barraProps();
    procesarCola(P);
  };

  function ubicar(it, z, P) {
    var c = it.loc ? ls(claveGeo(it)) : null;
    if (c) {
      try {
        var g = JSON.parse(c);
        if (g && num(g[0]) && num(g[1])) { it.lat = g[0]; it.lng = g[1]; it.aprox = !!g[2]; P.ubicados++; return; }
      } catch (e) { /* sin caché */ }
    }
    var h = hash(it.u);
    it.lat = z.lat + ((h % 1000) / 1000 - 0.5) * 0.012;
    it.lng = z.lng + ((Math.floor(h / 1000) % 1000) / 1000 - 0.5) * 0.012;
    it.aprox = true;
    if (it.loc) P.cola.push(it); else P.ubicados++;
  }

  function procesarCola(P) {
    if (P !== props || P.geoActivo) return;
    var it = P.cola.shift();
    if (!it) { barraProps(); return; }
    P.geoActivo = true;
    var q = it.loc.replace(/\s+/g, ' ') + ', Córdoba, Argentina';
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&viewbox=-64.40,-31.25,-64.00,-31.55&bounded=1&q=' + encodeURIComponent(q))
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (a) {
        var x = (a && a[0]) ? a[0] : null;
        if (x && x.lat && x.lon) {
          var gruesa = /suburb|neighbourhood|city|quarter|administrative/.test((x.addresstype || '') + ' ' + (x.type || ''));
          var g = [parseFloat(x.lat), parseFloat(x.lon), gruesa ? 1 : 0];
          if (gruesa) { g[0] = it.lat; g[1] = it.lng; }
          ls(claveGeo(it), JSON.stringify(g));
          it.lat = g[0]; it.lng = g[1]; it.aprox = !!g[2];
        } else {
          ls(claveGeo(it), JSON.stringify([it.lat, it.lng, 1]));
        }
      })
      .catch(function () { /* queda aproximada */ })
      .then(function () {
        P.geoActivo = false;
        if (P !== props) return;
        P.ubicados++;
        dibujarPropsLuego();
        barraProps();
        setTimeout(function () { procesarCola(P); }, 1100);
      });
  }

  function dibujarProps() { if (mapa && props.zona) mapa.setProps(props.items); }
  var tDib = null;
  function dibujarPropsLuego() { clearTimeout(tDib); tDib = setTimeout(dibujarProps, 500); }

  function barraProps() {
    var el = $('barraProps');
    if (!props.zona) { el.hidden = true; return; }
    var z = zonaPorId(props.zona);
    var html = '<div class="bp-txt"><b>' + esc(z ? z.nombre : '') + '</b> · ';
    if (props.captcha) {
      html += 'MercadoLibre pide verificar que sos una persona.</div><button class="bp-btn" id="bpVerificar">Verificar</button>';
    } else if (props.msg && !props.items.length) {
      html += esc(props.msg) + '</div>';
    } else {
      html += props.items.length + ' avisos';
      if (props.cargando) html += ' · buscando más…';
      else if (props.cola.length || props.geoActivo) html += ' · ubicando ' + props.ubicados + '/' + props.items.length;
      html += '</div>';
    }
    html += '<button class="bp-x" id="bpCerrar" aria-label="Cerrar">✕</button>';
    el.innerHTML = html;
    el.hidden = false;
    $('bpCerrar').onclick = cerrarProps;
    var v = $('bpVerificar');
    if (v) v.onclick = function () { window.AndroidScraper.mostrar(); };
  }

  function fichaProp(it) {
    var f = $('ficha');
    f.innerHTML =
      '<div class="fi-card">' +
      (it.img ? '<img class="fi-img" src="' + esc(it.img) + '" alt="" onerror="this.remove()">' : '') +
      '<div class="fi-body"><div class="fi-precio">' + esc(precioLargo(it)) + '</div>' +
      '<div class="fi-tit">' + esc(it.t) + '</div>' +
      (it.a ? '<div class="fi-attr">' + esc(it.a) + '</div>' : '') +
      (it.loc ? '<div class="fi-loc">📍 ' + esc(it.loc) + (it.aprox ? ' <em>(ubicación aproximada)</em>' : '') + '</div>' : '') +
      '<div class="btns"><a class="btn" target="_blank" href="' + esc(it.u) + '">Ver aviso</a>' +
      '<button class="btn sec" id="fiCerrar">Cerrar</button></div></div></div>';
    f.hidden = false;
    $('fiCerrar').onclick = function () { f.hidden = true; };
  }

  /* ---------- ajustes ---------- */
  function abrirAjustes() { $('inKey').value = ls('gkey') || ''; estado(); $('dlg').hidden = false; }
  function cerrarAjustes() { $('dlg').hidden = true; }

  window.manejarAtrasDesdeAndroid = function () {
    if (!$('ficha').hidden) { $('ficha').hidden = true; return true; }
    if (props.zona) { cerrarProps(); return true; }
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
      var bp = e.target.closest ? e.target.closest('[data-props]') : null;
      if (bp) { verPropiedades(bp.getAttribute('data-props')); return; }
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
