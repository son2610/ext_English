export interface Clip { start: number; end: number }
export interface MediaControl { currentTime: number; playbackRate: number; pause(): void; play(): Promise<void> }
export class RewatchController {
  active = false; index = 0; repetition = 1;
  private oldRate = 1;
  constructor(private media: MediaControl, private clips: Clip[], private repeats: number, private speed: number, private change: (hidden: boolean, index: number, repetition: number) => void, private hideFirst: boolean) {}
  async start() {
    if (!this.clips.length) return;
    this.oldRate = this.media.playbackRate; this.media.playbackRate = Math.min(2, Math.max(0.5, this.speed));
    this.active = true; await this.seek();
  }
  private async seek() {
    const clip = this.clips[this.index]; if (!clip) { this.stop(); return; }
    this.change(this.hideFirst && this.repetition === 1, this.index, this.repetition);
    this.media.currentTime = clip.start;
    try { await this.media.play(); } catch { this.stop(); throw new Error('Trình duyệt chặn phát tự động. Bấm nút phát video rồi thử lại.'); }
  }
  async tick() {
    if (!this.active) return;
    const clip = this.clips[this.index]!;
    if (this.media.currentTime < clip.start - 1 || this.media.currentTime > clip.end + 3) { this.stop(); return; }
    if (this.media.currentTime < clip.end) return;
    this.media.pause();
    if (this.repetition < this.repeats) this.repetition++; else { this.index++; this.repetition = 1; }
    if (this.index >= this.clips.length) this.stop(); else await this.seek();
  }
  stop() { if (this.active) { this.active = false; this.media.pause(); this.media.playbackRate = this.oldRate; this.change(false, this.index, this.repetition); } }
}
