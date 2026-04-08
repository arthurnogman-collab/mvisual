/**
 * Audio engine — plays dead5.mp3 via Web Audio API
 * Exposes real-time analyser data (frequency + waveform) for visuals
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.buffer = null;
    this.startedAt = 0;
    this.playing = false;

    // Analyser data arrays (filled every frame)
    this.freqData = null;   // Uint8Array — frequency bins 0-255
    this.waveData = null;   // Uint8Array — waveform samples 0-255

    // Derived energy bands (updated via update())
    this.bass = 0;       // 20-150 Hz
    this.mid = 0;        // 150-2000 Hz
    this.high = 0;       // 2000-16000 Hz
    this.energy = 0;     // overall RMS
  }

  async load(url) {
    this.ctx = new AudioContext();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.ctx.destination);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveData = new Uint8Array(this.analyser.fftSize);

    const resp = await fetch(url);
    const arrayBuf = await resp.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuf);
  }

  play() {
    if (this.playing) return;
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.analyser);
    this.source.start(0);
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  /** Current playback position in seconds */
  get currentTime() {
    if (!this.playing) return 0;
    return this.ctx.currentTime - this.startedAt;
  }

  /** Call once per frame to refresh analyser data + energy bands */
  update() {
    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.waveData);

    const binCount = this.analyser.frequencyBinCount;
    const nyquist = this.ctx.sampleRate / 2;
    const binHz = nyquist / binCount;

    // Bass: 20-150 Hz
    const bassEnd = Math.min(Math.floor(150 / binHz), binCount);
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += this.freqData[i];
    this.bass = bassSum / (bassEnd * 255);

    // Mid: 150-2000 Hz
    const midStart = bassEnd;
    const midEnd = Math.min(Math.floor(2000 / binHz), binCount);
    let midSum = 0;
    for (let i = midStart; i < midEnd; i++) midSum += this.freqData[i];
    this.mid = midSum / ((midEnd - midStart) * 255);

    // High: 2000-16000 Hz
    const highStart = midEnd;
    const highEnd = Math.min(Math.floor(16000 / binHz), binCount);
    let highSum = 0;
    for (let i = highStart; i < highEnd; i++) highSum += this.freqData[i];
    this.high = highSum / ((highEnd - highStart) * 255);

    // Overall energy from waveform RMS
    let rms = 0;
    for (let i = 0; i < this.waveData.length; i++) {
      const v = (this.waveData[i] - 128) / 128;
      rms += v * v;
    }
    this.energy = Math.sqrt(rms / this.waveData.length);
  }
}
