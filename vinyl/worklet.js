// FIYODIGGER VINILO (LAB) - modo vinilo real: el motor de audio del tocadiscos (corre en el hilo de audio).
// Toca el tema (PCM 16 bits, entrelazado) a velocidad variable: como en un disco, la velocidad y el tono van juntos.
// - motor: la velocidad del plato va hacia la del motor (33/45 + pitch) con arranque y frenada de tocadiscos DJ
// - mano: mientras se agarra el disco, la mano marca donde esta el disco y el motor lo sigue de cerca (scratch, tambien para atras)
// - lectura con interpolacion cubica (Hermite) para que el pitch y el scratch suenen limpios
// Mensajes: { load: ArrayBuffer, ch, sr, at, partial, keep } | { seek } | { motor, ramp } | { hand: segundos | null } | { gain, ramp } | { unload }
// Responde cada ~45 ms: { pos (s), rate, ended }
class FdVinyl extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pcm = null; this.ch = 2; this.n = 0; this.k = 1;
    this.pos = 0; this.rate = 0; this.motor = 0; this.ramp = 0.5; this.hand = null; this.handV = 0;
    this.gain = 0; this.gainT = 0; this.gainStep = 1; this.tick = 0; this.ended = false;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.load) {                                // keep: llega el tema completo y reemplaza al comienzo sin mover la aguja
        this.pcm = new Int16Array(m.load); this.ch = m.ch; this.n = Math.floor(this.pcm.length / m.ch); this.k = m.sr / sampleRate; this.partial = !!m.partial;
        if (!m.keep) { this.pos = (m.at || 0) * m.sr; this.ended = false; }
      }
      if (m.unload) { this.pcm = null; this.n = 0; this.rate = 0; this.motor = 0; }
      if (m.seek != null && this.pcm) { this.pos = Math.max(0, Math.min(this.n - 1, m.seek * this.k * sampleRate)); this.ended = false; }   // segundos -> muestras del audio original
      if (m.motor != null) { this.motor = m.motor; if (m.ramp != null) this.ramp = Math.max(0.001, m.ramp); if (m.now) this.rate = m.motor; }
      if ('hand' in m) { if (m.hand === null) { if (this.hand !== null) this.rate = this.handV; this.hand = null; } else { if (this.hand === null) this.handV = this.rate; this.hand = m.hand * this.k * sampleRate; } }   // segundos -> muestras
      if (m.gain != null) { this.gainT = m.gain; this.gainStep = 1 / Math.max(1, (m.ramp || 0.05) * sampleRate); }
    };
  }
  s(i, c) { i = i < 0 ? 0 : i >= this.n ? this.n - 1 : i; return this.pcm[i * this.ch + c] * (1 / 32768); }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], N = L.length;
    if (!this.pcm) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const dt = 1 / sampleRate, aHand = 1 - Math.exp(-dt / 0.012), stepM = dt / this.ramp;
    for (let j = 0; j < N; j++) {
      if (this.hand !== null) {                    // seguir a la mano: cubrir la distancia en ~25 ms (tope 8x), suavizado
        let want = (this.hand - this.pos) / (this.k * sampleRate * 0.025); want = want > 8 ? 8 : want < -8 ? -8 : want;
        this.handV += (want - this.handV) * aHand; this.rate = this.handV;
      }
      else { const d = this.motor - this.rate; this.rate += d > stepM ? stepM : d < -stepM ? -stepM : d; }   // arranque / frenada lineal, como un plato
      this.gain += this.gain < this.gainT ? Math.min(this.gainStep, this.gainT - this.gain) : -Math.min(this.gainStep, this.gain - this.gainT);
      const p = this.pos, i = Math.floor(p), f = p - i;
      let l = 0, r = 0;
      if (i >= 0 && i < this.n - 1 && this.rate !== 0) {
        for (let c = 0; c < 2; c++) {
          const cc = Math.min(c, this.ch - 1), y0 = this.s(i - 1, cc), y1 = this.s(i, cc), y2 = this.s(i + 1, cc), y3 = this.s(i + 2, cc);
          const v = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
          if (c === 0) l = v; else r = v;
        }
      }
      L[j] = l * this.gain; if (R !== L) R[j] = r * this.gain;
      this.pos += this.rate * this.k;
      if (this.pos >= this.n - 1) { this.pos = this.n - 1; if (!this.ended && this.hand === null && !this.partial) { this.ended = true; this.motor = 0; this.rate = 0; } }
      if (this.pos < 0) this.pos = 0;
    }
    if ((this.tick += N) >= 2048) { this.tick = 0; this.port.postMessage({ pos: this.pos / (this.k * sampleRate), rate: this.rate, ended: this.ended }); }
    return true;
  }
}
registerProcessor('fd-vinyl', FdVinyl);
