'use strict';
/* Suara sintetis. Tidak ada berkas audio — semua dari osilator & derau. */

const Audio3D = {
  ctx: null, master: null, noiseBuf: null, wind: null, windGain: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = (S.volume / 100) * (S.sfx ? 1 : 0);
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },
  setVolume() {
    if (!this.master) return;
    this.master.gain.value = (S.volume / 100) * (S.sfx ? 1 : 0);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  noise(dur, freq, q, gain, type = 'bandpass', slide = 0) {
    if (!this.ctx || !S.sfx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  tone(freq, dur, gain, type = 'triangle', slide = 1) {
    if (!this.ctx || !S.sfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  step(id) {
    const soft = id === 1 || id === 2 || id === 7 || id === 8 || id === 20 || id === 32;
    const wood = id === 12 || id === 14 || id === 17;
    if (soft) this.noise(0.11, 420 + Math.random() * 180, 1.1, 0.16, 'lowpass');
    else if (wood) this.noise(0.10, 900 + Math.random() * 300, 2.2, 0.14);
    else this.noise(0.09, 1500 + Math.random() * 700, 3.0, 0.12);
  },
  dig(id) {
    const B = BLOCKS[id];
    const hard = B ? clamp(B.hardness, 0.2, 4) : 1;
    this.noise(0.17, 300 + hard * 260, 1.4, 0.30, 'bandpass', 0.45);
    this.tone(140 + hard * 60, 0.14, 0.10, 'square', 0.55);
  },
  place() { this.noise(0.09, 1100, 2.0, 0.24, 'bandpass', 0.7); this.tone(360, 0.07, 0.09, 'triangle', 1.5); },
  splash() { this.noise(0.45, 900, 0.8, 0.32, 'lowpass', 0.25); },
  ui() { this.tone(620, 0.05, 0.07, 'triangle', 1.2); },
  deny() { this.tone(180, 0.16, 0.12, 'sawtooth', 0.7); },
  startWind() {
    if (!this.ctx || this.wind) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.wind = src; this.windGain = g;
  },
  setWind(v) { if (this.windGain) this.windGain.gain.value = v; }
};
