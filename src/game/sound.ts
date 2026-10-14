/** Короткие звуки через Web Audio API — без звуковых файлов. */
export class SoundFx {
  private context: AudioContext | null = null;

  constructor(public muted: boolean) {}

  toggle(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Щелчок колеса сдвига. */
  click(): void {
    this.tone(1400, 0.025, 'square', 0.04);
  }

  /** Удар печати. */
  stamp(): void {
    this.noise(0.12, 0.5, 600);
    this.tone(90, 0.12, 'sine', 0.35);
  }

  /** Ошибка: низкий «гудок». */
  error(): void {
    this.tone(150, 0.3, 'sawtooth', 0.08, 0.12);
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  private noise(duration: number, volume: number, cutoff: number): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
}
