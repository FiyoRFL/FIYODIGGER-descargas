// FIYODIGGER: idioma. Espanol o ingles de Nueva York.
// Arranca segun el idioma del equipo; se cambia en F5 SETUP. Traduce lo que aparece en pantalla
// (incluso los mensajes que llegan despues) y NUNCA toca los datos de los discos ni tus archivos.
(function () {
  const KEY = 'dg_lang';
  let lang = 'es';
  try { const v = JSON.parse(localStorage.getItem(KEY)); lang = (v === 'es' || v === 'en') ? v : (/^es\b/i.test(navigator.language || '') ? 'es' : 'en') }
  catch (e) { lang = /^es\b/i.test(navigator.language || '') ? 'es' : 'en' }
  window.FD_LANG = lang;
  document.documentElement.lang = lang;

  // nombres de skins, roles y palabras sueltas que se combinan en otros textos
  const W = {
    GRIS: 'GRAY', NEGRA: 'BLACK', CREMA: 'CREAM', MILITAR: 'ARMY', CARBON: 'CHARCOAL', BLANCA: 'WHITE', ARENA: 'SAND', 'AZUL MARINO': 'NAVY', BORDO: 'BURGUNDY', NARANJA: 'ORANGE', PETROLEO: 'TEAL', VIOLETA: 'PURPLE',
    'METAL GASTADO': 'WORN METAL', 'METAL CEPILLADO': 'BRUSHED METAL', 'GOMA TEXTURADA': 'TEXTURED RUBBER', MADERA: 'WOOD', CARBONO: 'CARBON FIBER', ALUMINIO: 'ALUMINUM', CROMO: 'CHROME', DORADO: 'GOLD', COBRE: 'COPPER', CUERO: 'LEATHER',
    VERDE: 'GREEN', AMBAR: 'AMBER', AZUL: 'BLUE', ROJA: 'RED', CIAN: 'CYAN', 'NEGRA FOSFORO': 'BLACK PHOSPHOR', 'NEGRA AMBAR': 'BLACK AMBER',
    GRAFITO: 'GRAPHITE', NEGROS: 'BLACK', BLANCOS: 'WHITE', ROJOS: 'RED', AZULES: 'BLUE', OLIVA: 'OLIVE', NARANJAS: 'ORANGE', ROJO: 'RED', PERSONALIZADO: 'CUSTOM',
    ARTISTA: 'ARTIST', SELLO: 'LABEL', COMPOSITOR: 'COMPOSER', PRODUCTOR: 'PRODUCER', ARREGLO: 'ARRANGER', INGENIERO: 'ENGINEER', DIRECTOR: 'CONDUCTOR'
  };
  const w = x => W[x] || x;
  const EXACT = Object.assign({}, W, {
    // pantalla fija
    'ACTUALIZACIONES': 'UPDATES', 'ATAJOS: ESPACIO = DIG · 1234 QWER ASDF ZXCV = PADS · F1-F5 = PANTALLAS': 'SHORTCUTS: SPACE = DIG · 1234 QWER ASDF ZXCV = PADS · F1-F5 = SCREENS',
    'Abrir la carpeta de descargas': 'Open the downloads folder', 'AÑO': 'YEAR', 'AÑO DESDE': 'YEAR FROM', 'AÑO HASTA': 'YEAR TO', 'Borrar filtro guardado': 'Delete saved filter',
    'CARPETA': 'FOLDER', 'CARPETA DE DESCARGAS': 'DOWNLOADS FOLDER', 'CLAVE YOUTUBE (VIEWS, TAGS, TOPIC)': 'YOUTUBE KEY (VIEWS, TAGS, TOPIC)', 'DESCARGAS': 'DOWNLOADS',
    'Dejar de seguir': 'Stop following', 'Descarta ediciones licenciadas y artistas de otro pais': 'Skips licensed pressings and artists from other countries',
    'ESTILO': 'STYLE', 'INSTRUMENTOS': 'INSTRUMENTS', 'Disco anterior': 'Previous record', 'Disco siguiente': 'Next record', 'DISCO SIGUIENTE': 'NEXT RECORD', 'POR FAMILIA': 'BY FAMILY', 'Cambiar el orden de la lista de instrumentos': 'Change the order of the instrument list', 'Busca en los creditos de Discogs quien toca cada instrumento': 'Looks up who plays each instrument in the Discogs credits', 'GENERO': 'GENRE', 'GUARDADOS': 'SAVED', 'NOMBRE': 'NAME', 'NOMBRE DEL FILTRO': 'FILTER NAME', 'F2 FILTRO': 'F2 FILTER', 'F4 HISTORIAL': 'F4 HISTORY',
    'MOTOR YT-DLP: ACTUALIZANDO...': 'YT-DLP ENGINE: UPDATING...', 'O [DIG] PARA EMPEZAR': "OR [DIG] TO GET IT POPPIN'", 'PRESIONA UN PAD': 'HIT A PAD', 'ORIGEN': 'ORIGIN',
    'PEGA EL LINK DE latest.json': 'PASTE THE latest.json LINK', 'PEGALA AQUI': 'PASTE IT HERE', 'PEGALO AQUI': 'PASTE IT HERE', 'RAREZA': 'RARITY', 'REGION': 'REGION',
    'Reproductor': 'Player', 'Reproductor en espera': 'Standby player', 'SOLO TOPIC': 'TOPIC ONLY', 'SOLO VIDEO': 'VIDEO ONLY', 'SOLO VINILO': 'VINYL ONLY',
    'TOKEN DE DISCOGS': 'DISCOGS TOKEN', 'TOKEN DE DISCOGS (OPCIONAL)': 'DISCOGS TOKEN (OPTIONAL)', 'NO HACE FALTA - SOLO SI QUERES USAR EL TUYO': "NOT NEEDED - ONLY IF YOU WANNA USE YOURS", 'TONALIDAD': 'KEY', 'Tema anterior': 'Previous track', 'Tema siguiente': 'Next track',
    '[ABRIR CARPETA]': '[OPEN FOLDER]', '[VER VIDEO TUTORIAL]': '[WATCH VIDEO TUTORIAL]', '[ABRIR DESCARGA COMPLETA]': '[GET THE FULL DOWNLOAD]', '[ABRIR MANUAL]': '[OPEN MANUAL]', '[ABRIR REGISTRO]': '[OPEN LOG]',
    '[BUSCAR ACTUALIZACION]': '[CHECK FOR UPDATES]', '[DIAGNOSTICO]': '[DIAGNOSTICS]', '[EDITAR PADS]': '[EDIT PADS]', '[GUARDAR PAD]': '[SAVE PAD]', '[GUARDAR]': '[SAVE]',
    '[LIMPIAR Y REINICIAR MOTOR]': '[CLEAN UP & RESTART ENGINE]', '[LISTO]': '[DONE]', '[REINICIAR PARA ACTUALIZAR]': '[RESTART TO UPDATE]', '[RESTAURAR]': '[RESTORE]',
    // pads de fabrica
    'BRASIL': 'BRAZIL', 'INCID.': 'LIBRARY', 'Brasil': 'Brazil', 'Incid.': 'Library', 'Quitar de la lista': 'Remove from list',
    // modos de filtro y listas
    'ALGUNO': 'ANY', 'CUALQUIERA': 'ANY', 'TODOS': 'ALL', 'EXCLUIR': 'EXCLUDE', '-- ELEGIR --': '-- PICK ONE --', 'SIN COINCIDENCIAS': 'NO MATCHES', 'ESCRIBE Y ENTER': 'TYPE + ENTER',
    'BUSCAR...': 'SEARCH...', 'FAVORITOS': 'FAVORITES', 'FILTRO': 'FILTER', 'HISTORIAL': 'HISTORY', 'CARCASA': 'CASE', 'PANTALLA': 'SCREEN', 'BOTONES Y LEDS': 'BUTTONS & LEDS',
    // estado
    'LISTO': 'GOT ONE', 'CANCELADO': 'CANCELED', 'CANCELANDO...': 'CANCELING...', 'BUSCANDO...': 'SEARCHING...', 'BAJANDO...': 'DOWNLOADING...', 'ANALIZANDO...': 'ANALYZING...',
    'SIN DESCARGAS TODAVIA': 'NO DOWNLOADS YET', 'TODAVIA NO HAY NADA': 'NOTHING HERE YET', 'ABRIR EN YOUTUBE': 'OPEN ON YOUTUBE', 'ANALIZANDO ONDA...': 'LOADING WAVEFORM...',
    'ONDA EN PAUSA': 'WAVEFORM ON PAUSE', 'SIN ONDA': 'NO WAVEFORM', 'ARRASTRA AL DAW': 'DRAG IT TO YOUR DAW', 'Arrastra a tu DAW': 'Drag it to your DAW', 'COMPARTIR / ABRIR': 'SHARE / OPEN',
    'CLAVE DE YOUTUBE INVALIDA O SIN CUPO': 'YOUTUBE KEY IS BAD OR OUT OF QUOTA', 'CLAVE YOUTUBE GUARDADA': 'YOUTUBE KEY SAVED', 'DISCO ANTERIOR': 'PREVIOUS RECORD',
    'DISCOGS NO RESPONDE - REVISA TU INTERNET': "DISCOGS AIN'T ANSWERING - CHECK YOUR CONNECTION", 'DISCOGS PIDIO UNA PAUSA - ESPERANDO...': 'DISCOGS SAID HOLD UP - WAITING...',
    'DISCOGS: DEMASIADOS PEDIDOS - ESPERA UN MINUTO': 'DISCOGS: TOO MANY REQUESTS - GIVE IT A MINUTE', 'DISCOGS: ESPACIANDO PEDIDOS...': 'DISCOGS: PACING THE REQUESTS...',
    'EDITAR PAD': 'EDIT PAD', 'EDITAR PADS': 'EDIT PADS', 'ESA REGION NO EXISTE EN LA LISTA': "THAT REGION AIN'T ON THE LIST", 'ESE ESTILO NO EXISTE EN LA LISTA': "THAT STYLE AIN'T ON THE LIST",
    'ESE FILTRO NECESITA LA CLAVE DE YOUTUBE (F5)': 'THAT FILTER NEEDS A YOUTUBE KEY (F5)', 'ESPERA QUE CARGUE EL VIDEO': "HOLD UP, THE VIDEO'S LOADING",
    'FILTRO BORRADO': 'FILTER DELETED', 'FILTRO CARGADO': 'FILTER LOADED', 'FILTROS EN CERO': 'FILTERS CLEARED', 'LINK GUARDADO': 'LINK SAVED',
    'HAY UNA VERSION NUEVA PARA DESCARGAR (F5 SETUP)': 'NEW VERSION OUT - GRAB IT IN F5 SETUP', 'LISTO (SALIR DE EDICION)': 'DONE (EXIT EDIT MODE)',
    'LISTO - ARRASTRA EL BOTON AL DAW': 'GOT IT - DRAG THE BUTTON INTO YOUR DAW', 'LISTO - TOCA EL BOTON PARA COMPARTIR': 'GOT IT - TAP THE BUTTON TO SHARE',
    'MODO EDICION APAGADO': 'EDIT MODE OFF', 'MOTOR REINICIADO': 'ENGINE RESTARTED', 'NO HAY DISCO ANTERIOR': 'NO PREVIOUS RECORD',
    'PEGA TU TOKEN PARA EMPEZAR': "PASTE YOUR TOKEN TO START DIGGIN'", 'PEGA TU TOKEN PRIMERO': 'PASTE YOUR TOKEN FIRST', 'PONLE NOMBRE AL FILTRO': 'NAME YOUR FILTER',
    'SEGUIR: OFF': 'FOLLOW: OFF', 'SIN LINK': 'NO LINK', 'SIN RESULTADOS - AFLOJA LOS FILTROS': 'NOTHING FOUND - EASE UP ON THE FILTERS',
    'SIN RESULTADOS TRAS ANALIZAR 8 DISCOS': 'NOTHING AFTER CHECKING 8 RECORDS', 'SOLO DISPONIBLE EN LA APP DE ESCRITORIO': 'DESKTOP APP ONLY', 'SOLO EN LA APP DE ESCRITORIO': 'DESKTOP APP ONLY',
    'TEMPO Y TONALIDAD SOLO EN LA APP DE ESCRITORIO': 'TEMPO & KEY ONLY ON THE DESKTOP APP', 'TOCA UN PAD PARA EDITARLO': 'TAP A PAD TO EDIT IT', 'TOKEN GUARDADO': 'TOKEN SAVED',
    'TOKEN INVALIDO - REVISA SETUP': 'BAD TOKEN - CHECK SETUP', 'DISCOGS RECHAZO LA CLAVE DE LA APP - PEGA TU TOKEN EN SETUP': 'DISCOGS REJECTED THE APP KEY - PASTE YOUR TOKEN IN SETUP', 'VERSION COMPLETA NUEVA DISPONIBLE - F5 SETUP': 'NEW FULL VERSION OUT - F5 SETUP',
    'VIDEO BLOQUEADO - BUSCANDO OTRO DISCO...': 'VIDEO BLOCKED - FINDING ANOTHER RECORD...', 'VIDEO NO DISPONIBLE': 'VIDEO UNAVAILABLE',
    'VIDEO NO DISPONIBLE - PROBANDO EL SIGUIENTE': 'VIDEO UNAVAILABLE - TRYING THE NEXT ONE', 'VIDEO NO DISPONIBLE EN OTROS SITIOS': "THIS VIDEO CAN'T PLAY OUTSIDE YOUTUBE",
    // pestanas del celu
    'DIGGEAR': 'DIG', 'CAVAR': 'DIG', 'DATOS': 'INFO', 'BAJADAS': 'DOWNLOADS',
    // Android, Lite y motor
    'AUDIO MUY CORTO': 'AUDIO TOO SHORT', 'AVISO DE ACTUALIZACION ILEGIBLE': "CAN'T READ THE UPDATE NOTICE", 'EL REGISTRO NO ESTA EN LA VERSION APK': 'NO LOG ON THE APK VERSION',
    'EN EL CELU LA CARPETA ES FIJA: MUSICA/FIYODIGGER': 'ON MOBILE THE FOLDER IS FIXED: MUSIC/FIYODIGGER', 'FIRMA INVALIDA - NO SE INSTALA': 'BAD SIGNATURE - NOT INSTALLING',
    'MANIFIESTO INCOMPLETO': 'INCOMPLETE UPDATE NOTICE', 'SIN CONEXION CON LAS ACTUALIZACIONES': "CAN'T REACH THE UPDATES", 'SIN DATOS': 'NO DATA', 'SIN CONEXION': 'NO CONNECTION',
    'FIYODIGGER LITE: SIN DESCARGAS NI ONDA EN IPAD/IPOD. LA APP COMPLETA ESTA PARA COMPU Y ANDROID EN FIYORFL.NETLIFY.APP/#FIYODIGGER': 'FIYODIGGER LITE: NO DOWNLOADS OR WAVEFORM ON IPAD/IPOD. GRAB THE FULL APP FOR DESKTOP & ANDROID AT FIYORFL.NETLIFY.APP/#FIYODIGGER',
    'NO SE PUDO BAJAR EL AUDIO': "COULDN'T GRAB THE AUDIO", 'NO SE PUDO DESCARGAR': 'DOWNLOAD FAILED', 'TIEMPO AGOTADO': 'TIMED OUT', 'SIN ARCHIVO': 'NO FILE', 'SIN AUDIO': 'NO AUDIO',
    'EL PAQUETE NO COINCIDE (DANADO O CAMBIADO)': "PACKAGE DOESN'T MATCH (DAMAGED OR TAMPERED)", 'PAQUETE ILEGIBLE': "CAN'T READ THE PACKAGE", 'PAQUETE INCOMPLETO': 'INCOMPLETE PACKAGE',
    'NO SE PUDO BAJAR LA ACTUALIZACION': "COULDN'T DOWNLOAD THE UPDATE", 'LINK INVALIDO': 'BAD LINK', 'ARCHIVO DEMASIADO GRANDE': 'FILE TOO BIG', 'DATOS INVALIDOS': 'BAD DATA',
    'LA VERSION DEL PAQUETE NO COINCIDE': "PACKAGE VERSION DOESN'T MATCH", 'EL LINK DEVOLVIO UNA PAGINA - REVISA QUE SEA PUBLICO': 'THAT LINK GAVE BACK A WEB PAGE - MAKE SURE IT IS PUBLIC',
    // extension de Chrome y samples
    'BUSCANDO SAMPLE...': "DIGGIN' FOR THAT SAMPLE...", 'SAMPLE NO ENCONTRADO EN DISCOGS': "COULDN'T FIND THAT SAMPLE ON DISCOGS", 'Buscar el sample en Discogs': 'Find this sample on Discogs',
    'SUBCARPETA DENTRO DE DESCARGAS': 'SUBFOLDER INSIDE DOWNLOADS', 'ESE ARCHIVO NO SE BAJO CON ESTA EXTENSION': "THAT FILE AIN'T FROM THIS EXTENSION",
    'EL ARCHIVO YA NO ESTA EN DESCARGAS': "THAT FILE AIN'T IN DOWNLOADS NO MORE", 'VIDEO NO DISPONIBLE': 'VIDEO UNAVAILABLE', 'NO SE PUDO BAJAR EL AUDIO': "COULDN'T GRAB THE AUDIO",
    'DATOS INVALIDOS': 'BAD DATA', 'CANCELADO': 'CANCELED', 'TIEMPO AGOTADO': 'TIMED OUT', 'DESCARGA CANCELADA': 'DOWNLOAD CANCELED', 'SIN CONEXION CON GITHUB': "CAN'T REACH GITHUB",
    'SANDBOX NO RESPONDE': 'SANDBOX NOT RESPONDING',
    'EL LINK DEL PAQUETE DEVOLVIO UNA PAGINA - REVISA QUE SEA PUBLICO': 'THE PACKAGE LINK GAVE BACK A WEB PAGE - MAKE SURE IT IS PUBLIC', 'MOTOR YT-DLP: ERROR': 'YT-DLP ENGINE: ERROR',
    // idioma
    '[IDIOMA: ESPAÑOL]': '[IDIOMA: ESPAÑOL]', '[LANGUAGE: NYC ENGLISH]': '[LANGUAGE: NYC ENGLISH]'
  });
  // mensajes con datos adentro
  const RX = [
    [/^DESCARGAR (\w+)$/, (m, f) => 'DOWNLOAD ' + f],
    [/^DIGGING\.\.\. ROUND (\d+)$/, (m, n) => 'DIGGIN\'... ROUND ' + n],
    [/^ANALIZANDO AUDIO (\d+)\/(\d+)\.\.\.$/, (m, a, b) => 'CHECKING THE AUDIO ' + a + '/' + b + '...'],
    [/^DISCOGS PIDIO UNA PAUSA - REINTENTO EN (\d+) S$/, (m, n) => 'DISCOGS SAID HOLD UP - TRYING AGAIN IN ' + n + 'S'],
    [/^ERROR DE DISCOGS (\d+)$/, (m, n) => 'DISCOGS ERROR ' + n],
    [/^EDITANDO PAD (\d+)(.*)$/, (m, n, r) => 'EDITING PAD ' + n + r],
    [/^NO EXISTE EN LA LISTA: (.+)$/, (m, x) => 'NOT ON THE LIST: ' + x],
    [/^FILTRO GUARDADO: (.+)$/, (m, x) => 'FILTER SAVED: ' + x],
    [/^FAVORITOS: (\d+)$/, (m, n) => 'FAVS: ' + n],
    [/^SIGUIENDO (.+) · REVISANDO (\d+)\/(\d+)\.\.\.$/, (m, x, a, b) => 'FOLLOWING ' + x + ' · CHECKING ' + a + '/' + b + '...'],
    [/^NO HAY MAS DISCOS CON VIDEO DE (.+)$/, (m, x) => 'NO MORE RECORDS WITH VIDEO FROM ' + x],
    [/^SIN VIDEO EN ESTOS (\d+) - TOCA DIG PARA SEGUIR$/, (m, n) => 'NO VIDEO ON THESE ' + n + ' - HIT DIG TO KEEP GOING'],
    [/^SIGUIENDO (\w+): (.+)$/, (m, r, x) => 'FOLLOWING ' + w(r) + ': ' + x],
    [/^SIGUIENDO (.+)$/, (m, x) => 'FOLLOWING ' + x],
    [/^TEMA (\d+)\/(\d+)( · ▶ OTRO DISCO)?$/, (m, a, b, o) => 'TRACK ' + a + '/' + b + (o ? ' · ▶ NEXT RECORD' : '')],
    [/^Video (\d+)(.*)$/, (m, n, r) => 'Video ' + n + r],
    [/^HAVE (\d+) · WANT (\d+) · RAREZA x(.+)$/i, (m, a, b, r) => 'HAVE ' + a + ' · WANT ' + b + ' · RARITY x' + r],
    [/^(ARTISTA|SELLO|COMPOSITOR|PRODUCTOR|ARREGLO|INGENIERO|DIRECTOR): (.+)$/, (m, r, x) => w(r) + ': ' + x],
    [/^BUSCANDO (.+) · (\d+) DISCOS REVISADOS\.\.\.$/, (m, x, n) => 'LOOKING FOR ' + x + ' · ' + n + ' RECORDS CHECKED...'],
    [/^NINGUN DISCO CON (.+) EN LOS CREDITOS \((\d+) REVISADOS\) - TOCA DIG PARA SEGUIR$/, (m, x, n) => 'NO RECORD WITH ' + x + ' IN THE CREDITS (' + n + ' CHECKED) - HIT DIG TO KEEP GOING'],
    [/^Hacer digging de (.+)$/, (m, x) => 'Dig ' + x],
    [/^Quitar (.+)$/, (m, x) => 'Remove ' + x],
    [/^\[(CARCASA|MATERIAL|PANTALLA|PADS|BOTONES Y LEDS|MODELO): (.+)\]$/, (m, k, v) => '[' + ({ CARCASA: 'CASE', MATERIAL: 'MATERIAL', PANTALLA: 'SCREEN', PADS: 'PADS', 'BOTONES Y LEDS': 'BUTTONS & LEDS', MODELO: 'MODEL' })[k] + ': ' + w(v) + ']'],
    [/^(CARCASA|MATERIAL|PANTALLA|PADS|BOTONES Y LEDS|MODELO): (.+)$/, (m, k, v) => ({ CARCASA: 'CASE', MATERIAL: 'MATERIAL', PANTALLA: 'SCREEN', PADS: 'PADS', 'BOTONES Y LEDS': 'BUTTONS & LEDS', MODELO: 'MODEL' })[k] + ': ' + w(v)],
    [/^AL DIA · V(.+)$/, (m, v) => 'UP TO DATE · V' + v],
    [/^ACTUALIZACION V([\d.]+) LISTA - SE USA AL REABRIR \(O EN F5 SETUP\)$/, (m, v) => 'UPDATE V' + v + ' READY - KICKS IN NEXT LAUNCH (OR F5 SETUP)'],
    [/^ACTUALIZACION V([\d.]+) LISTA - F5 SETUP$/, (m, v) => 'UPDATE V' + v + ' READY - F5 SETUP'],
    [/^ACTUALIZACION V([\d.]+) LISTA(.*)$/, (m, v, r) => 'UPDATE V' + v + ' READY' + r],
    [/^HAY UNA VERSION COMPLETA NUEVA \(V(.+)\)$/, (m, v) => 'NEW FULL VERSION OUT (V' + v + ')'],
    [/^MEMORIA (.+)$/, (m, r) => 'MEMORY ' + r.replace(' · PROCESOS ', ' · PROCESSES ').replace(' · ONDAS ', ' · WAVES ').replace(' · ULT. ONDA ', ' · LAST WAVE ').replace(' · ULT. ERROR ', ' · LAST ERROR ').replace(' · YOUTUBE EN PAUSA ', ' · YOUTUBE ON PAUSE ')],
    [/^YOUTUBE PIDE UNA PAUSA \(ANTI-BOT\) - PROBA EN (\d+) MIN$/, (m, n) => 'YOUTUBE WANTS A BREAK (ANTI-BOT) - TRY AGAIN IN ' + n + ' MIN'],
    [/^MOTOR YOUTUBEI\.JS (.+)$/, (m, r) => 'YOUTUBEI.JS ENGINE ' + r.replace('CLIENTE', 'CLIENT')],
    [/^SAMPLEA: (.+)$/, (m, x) => 'SAMPLES: ' + x],
    [/^SAMPLEADO POR: (.+)$/, (m, x) => 'SAMPLED BY: ' + x],
    [/^SAMPLE: (.+)$/, (m, x) => 'SAMPLE: ' + x],
    [/^DESCARGA INTERRUMPIDA ?(.*)$/, (m, x) => 'DOWNLOAD CUT OFF ' + x],
    [/^MUSICBRAINZ (\d+)$/, (m, n) => 'MUSICBRAINZ ' + n],
    [/^MOTOR YT-DLP (.+)$/, (m, r) => 'YT-DLP ENGINE ' + r.replace('(AL DIA)', '(UP TO DATE)').replace('RAPIDO', 'FAST')],
    [/^CONVIRTIENDO A (.+)$/, (m, x) => 'CONVERTING TO ' + x],
    [/^NO DISPONIBLE: (.+)$/, (m, x) => 'UNAVAILABLE: ' + x],
    [/^ERROR: (.+)$/, (m, x) => 'ERROR: ' + T(x)]
  ];
  function T(t) {
    if (lang === 'es' || t == null) return t;
    const s = String(t), k = s.trim();
    if (!k) return s;
    let r = Object.prototype.hasOwnProperty.call(EXACT, k) ? EXACT[k] : undefined;
    if (r === undefined) for (const [re, f] of RX) { const m = k.match(re); if (m) { r = f(...m); break } }
    return r === undefined ? s : s.replace(k, r);
  }
  window.T = T; window.fdT = T;
  window.fdSetLang = l => { try { localStorage.setItem(KEY, JSON.stringify(l)) } catch (e) {} location.reload() };
  if (lang === 'es') return;

  // datos que nunca se traducen: discos, artistas, sellos, videos, tus archivos y nombres de filtros
  // (los nombres de filtros guardados son opciones del selector: se protegen todas menos la primera)
  const SKIP = '#lTitle,#lArtist,#lLabel,#lTags,#vids,#files .fn,#saved option:not(:first-child),.dd-list,script,style';
  const fix = n => {
    if (n.nodeType === 3) { const p = n.parentElement; if (p && p.closest(SKIP)) return; const v = T(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return }
    if (n.nodeType !== 1 || n.closest(SKIP)) return;
    for (const a of ['placeholder', 'title', 'aria-label']) if (n.hasAttribute && n.hasAttribute(a)) { const v = T(n.getAttribute(a)); if (v !== n.getAttribute(a)) n.setAttribute(a, v) }
    const tw = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let x; while ((x = tw.nextNode())) { if (x.nodeType === 1) { if (x.closest(SKIP)) continue; for (const a of ['placeholder', 'title', 'aria-label']) if (x.hasAttribute(a)) { const v = T(x.getAttribute(a)); if (v !== x.getAttribute(a)) x.setAttribute(a, v) } } else fix(x) }
  };
  const start = () => {
    fix(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else if (m.type === 'attributes') fix(m.target); else m.addedNodes.forEach(fix) } })
      .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
