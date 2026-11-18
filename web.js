// FIYODIGGER Lite: la misma pantalla, abierta desde Safari (iPad / iPod) como app de inicio.
// Sin onda ni descargas (iOS no deja bajar el audio desde una web); todo lo demas funciona igual.
(function () {
  window.FD_WEB = true;
  const H = document.documentElement;
  H.classList.add('web');
  // pantalla chica o iPad vertical -> pestanas como en el celu; iPad apaisado -> la maquina completa
  const vw = () => (window.visualViewport ? visualViewport.width : innerWidth), vh = () => (window.visualViewport ? visualViewport.height : innerHeight);
  const small = () => vw() < 900 || vw() < vh();
  const apply = () => { H.classList.toggle('mob', small()); if (typeof window.fit === 'function') window.fit() };
  apply();
  addEventListener('resize', apply); addEventListener('orientationchange', () => setTimeout(apply, 300));
  if (window.visualViewport) visualViewport.addEventListener('resize', apply);

  // app instalable: icono, nombre y pantalla completa al agregarla al inicio
  const add = (tag, attrs) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); document.head.appendChild(e) };
  add('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  add('link', { rel: 'apple-touch-icon', href: 'icon-180.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'FIYODIGGER' });
  const css = document.createElement('style');
  css.textContent = [
    'html.web:not(.mob) #tabbar,html.web:not(.mob) #toast{display:none}',
    'html.web :is(#fmt,#fold,#folderBtn,#folderOpen,#engine,#logBtn,#diagBtn,#diag,#resetBtn,#updBtn,#updGo,#updFull,#updTxt,#updUrl,.fd-hide){display:none!important}',
    'html.web .files .empty{white-space:normal;line-height:1.35}'
  ].join('\n');
  document.head.appendChild(css);
  if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    // carteles de la configuracion que no aplican (carpeta, actualizaciones)
    document.querySelectorAll('.lcd .l').forEach(e => { if (/^(CARPETA DE DESCARGAS|ACTUALIZACIONES)$/.test(e.textContent.trim())) e.classList.add('fd-hide') });
    // la bandeja de descargas explica donde estan las descargas
    const f = $('files');
    if (f) f.innerHTML = '<span class="empty">FIYODIGGER LITE: SIN DESCARGAS NI ONDA EN IPAD/IPOD. LA APP COMPLETA ESTA PARA COMPU Y ANDROID EN FIYORFL.NETLIFY.APP/#FIYODIGGER</span>';
    // el boton grande abre el tema en YouTube
    const b = $('dl1');
    if (b) {
      b.textContent = 'ABRIR EN YOUTUBE';
      b.onclick = () => { try { if (vidId) window.open('https://www.youtube.com/watch?v=' + vidId, '_blank') } catch (e) {} };
      b.draggable = false;
    }
    const v = $('verTxt'); if (v) v.textContent = 'FIYODIGGER LITE V' + (window.FD_VERSION || '');
    apply();
  });
})();
