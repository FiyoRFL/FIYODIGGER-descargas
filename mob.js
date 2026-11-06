// Pestanas del modo celular (Android y FIYODIGGER Lite en iPod/iPad vertical)
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const web = !!window.FD_WEB;
    const groups = web ? {
      cavar: ['#dig', '.vcol', '.right > .trio:not(#fmt)'],
      datos: ['.fkeys', '.lcdb'],
      pads: ['.right > .bezel']
    } : {
      cavar: ['#dig', '.vcol', '#fmt', '#dl1'],
      datos: ['.fkeys', '.lcdb'],
      pads: ['.right > .bezel'],
      bajadas: ['.tray', '.right > .trio:not(#fmt)']
    };
    for (const g in groups) groups[g].forEach(sel => document.querySelectorAll(sel).forEach(e => e.classList.add('tab-' + g)));
    const nav = document.createElement('nav'); nav.id = 'tabbar';
    const names = web ? { cavar: 'DIGGEAR', datos: 'DATOS', pads: 'PADS' } : { cavar: 'DIGGEAR', datos: 'DATOS', pads: 'PADS', bajadas: 'BAJADAS' };
    const btns = {};
    for (const g in names) { const b = document.createElement('button'); b.className = 'key'; b.textContent = names[g]; b.onclick = () => setTab(g); nav.appendChild(b); btns[g] = b }
    document.body.appendChild(nav);
    const toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast);
    function setTab(g) {
      document.documentElement.dataset.tab = g;
      for (const k in btns) btns[k].classList.toggle('on', k === g);
      try { localStorage.setItem('fd_tab', g) } catch {}
      window.scrollTo(0, 0);
    }
    let t0 = 0;
    setTab((() => { try { const v = localStorage.getItem('fd_tab'); return names[v] ? v : 'cavar' } catch { return 'cavar' } })());
    // tocar un pad te lleva a CAVAR para ver y escuchar el disco
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.pad')) setTimeout(() => setTab('cavar'), 0) });
    // lo que dice la pantalla verde tambien sale como aviso, para verlo desde cualquier pestana
    const st = document.getElementById('status');
    if (st) new MutationObserver(() => {
      const m = st.textContent.trim(); if (!m) return;
      toast.textContent = m; toast.classList.toggle('err', st.classList.contains('err')); toast.classList.add('show');
      clearTimeout(t0); t0 = setTimeout(() => toast.classList.remove('show'), st.classList.contains('err') ? 7000 : 2500);
    }).observe(st, { childList: true, characterData: true, subtree: true });
  });
})();
