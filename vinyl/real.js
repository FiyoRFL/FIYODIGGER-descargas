// FIYODIGGER VINILO (LAB) - modo vinilo real (solo app de escritorio: necesita fd.vinylPcm).
// El tema arranca al instante por YouTube, como siempre. Mientras suena, se trae su audio (el mismo camino directo que
// usa la onda) y, cuando esta listo, el motor de vinilo (worklet.js) toma el sonido en el mismo punto: YouTube queda
// mudo, sincronizado, solo para el video. Desde ahi el pitch cambia el tono, START · STOP frena y arranca como un plato
// y el scratch suena. Se trae de antemano el tema siguiente (para que no haya espera). Si algo falla, el sonido vuelve a YouTube.
//
// const r = FDV.real({ fetch, yt, now, onPos, onEnded, onActive, onFail })
//   fetch(id) -> { pcm, ch, sr }      yt(func, args) -> comando al reproductor de YouTube
//   now() -> { t, playing, rate }      donde va YouTube ahora (para tomar el sonido en el mismo punto)
(function () {
  'use strict';
  const FDV = window.FDV = window.FDV || {};
  FDV.real = function (o) {
    if (!window.AudioWorkletNode || typeof o.fetch !== 'function') return null;
    let ctx = null, node = null, booting = null, failed = false;
    const memo = new Map();                       // id -> Promise<audio | null> (el actual y el siguiente, nada mas)
    let id = null, active = false, pos = 0, rate = 1, playing = false, tok = 0, ended = false, handBase = 0;
    const tell = (f, ...a) => { try { if (typeof o[f] === 'function') o[f](...a); } catch (e) { /* sin efecto en el resto */ } };

    function boot() {
      if (booting) return booting;
      booting = (async () => {
        ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 });
        await ctx.audioWorklet.addModule('vinyl/worklet.js');
        node = new AudioWorkletNode(ctx, 'fd-vinyl', { numberOfOutputs: 1, outputChannelCount: [2] });
        node.connect(ctx.destination);
        node.port.onmessage = (e) => {
          pos = e.data.pos;
          if (!active) return;
          tell('onPos', pos);
          if (e.data.ended && !ended) { ended = true; tell('onEnded'); }
        };
      })();
      booting.catch((e) => { failed = true; tell('onFail', e); });
      return booting;
    }

    function prep(r) {
      if (!r || !r.pcm || !r.pcm.byteLength) return null;
      const b = r.pcm, ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), i16 = new Int16Array(ab);
      let s = 0, c = 0;                             // volumen parecido al de YouTube (que nivela los temas fuertes)
      for (let i = 0; i < i16.length; i += 97) { const v = i16[i] / 32768; s += v * v; c++; }
      const rms = Math.sqrt(s / Math.max(1, c));
      return { ab, ch: r.ch || 2, sr: r.sr || 44100, gain: Math.min(1, 0.18 / Math.max(rms, 1e-4)), partial: !!r.partial };
    }
    // el primero que traiga audio (o null si ninguno)
    const firstOf = (ps) => new Promise((res) => { let left = ps.length; ps.forEach((p) => p.then((v) => { if (v) res(v); else if (--left === 0) res(null); }, () => { if (--left === 0) res(null); })); });
    function load(vid) {
      if (!vid || failed) return Promise.resolve(null);
      if (memo.has(vid)) return memo.get(vid);
      const p = Promise.resolve(o.fetch(vid)).then(prep).catch(() => null);
      memo.set(vid, p);
      while (memo.size > 2) memo.delete(memo.keys().next().value);
      return p;
    }

    function release() {
      tok++;
      if (!active) return;
      active = false;
      if (node) { node.port.postMessage({ gain: 0, ramp: 0.04, hand: null }); setTimeout(() => { if (!active && node) node.port.postMessage({ unload: true }); }, 90); }
      o.yt('unMute'); tell('onActive', false);
    }

    async function track(vid) {
      if (vid === id && active) return;
      release(); id = vid; ended = false;
      const my = ++tok;
      if (!vid || failed) return;
      // el tema completo (si ya se trajo de antemano, esta al instante) y, en paralelo, solo su comienzo, que llega antes
      const fullP = load(vid);
      const partP = typeof o.fetchPart === 'function' ? Promise.resolve(o.fetchPart(vid)).then(prep).catch(() => null) : Promise.resolve(null);
      const d = await firstOf([fullP, partP]);
      if (my !== tok || !d) return;               // cambio de tema mientras tanto, o no se pudo: sigue YouTube
      if (!d.partial) memo.delete(vid);           // el audio pasa al motor (no se copia)
      else fullP.then((f) => {                    // llego el completo: reemplaza al comienzo sin cortes
        if (my !== tok || !active || !node) return;
        if (!f) { release(); return; }             // el completo no llego: el sonido vuelve a YouTube (sigue sincronizado)
        memo.delete(vid);
        node.port.postMessage({ load: f.ab, ch: f.ch, sr: f.sr, keep: true, partial: false }, [f.ab]);
        tell('onFull');
      });
      try { await boot(); } catch (e) { return; }
      if (my !== tok || !node) return;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { return; } }
      const s = o.now();
      rate = s.rate || 1; playing = !!s.playing;
      node.port.postMessage({ load: d.ab, ch: d.ch, sr: d.sr, partial: d.partial, at: Math.max(0, s.t || 0) + (playing ? 0.04 : 0) }, [d.ab]);
      node.port.postMessage({ motor: playing ? rate : 0, now: true, ramp: 0.45, hand: null });
      node.port.postMessage({ gain: d.gain, ramp: 0.05 });
      active = true; o.yt('mute'); tell('onActive', true);
    }

    return {
      get active() { return active; },
      get pos() { return pos; },
      get playing() { return playing; },
      track,
      release,
      prefetch(vid) { if (vid && vid !== id) load(vid); },
      play() { if (!active) return; playing = true; node.port.postMessage({ motor: rate, ramp: 0.45 }); },         // arranque del plato
      pause(brake) { if (!active) return; playing = false; node.port.postMessage({ motor: 0, ramp: brake ? 0.7 : 0.001 }); },   // frenada (o la aguja que se levanta)
      seek(t) { if (!active) return; ended = false; node.port.postMessage({ seek: Math.max(0, t) }); pos = t; },
      setRate(r) { rate = r; if (active && playing) node.port.postMessage({ motor: r, ramp: 0.25 }); },
      grab() { if (!active) return; handBase = pos; node.port.postMessage({ hand: pos }); },                          // mano sobre el disco: queda quieto donde esta
      hand(off) { if (active) node.port.postMessage({ hand: Math.max(0, handBase + off) }); },                          // scratch: el disco esta off segundos de donde se agarro
      drop(resume) { if (!active) return; playing = !!resume; node.port.postMessage({ hand: null, motor: resume ? rate : 0, ramp: 0.15 }); },   // se suelta el disco
      destroy() { release(); try { if (ctx) ctx.close(); } catch (e) { /* nada */ } ctx = null; node = null; booting = null; },
    };
  };
})();
