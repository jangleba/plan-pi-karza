/** Only foreground active intervals contribute to a session's duration. */
export class ReactiveClock {
  private accumulatedMs = 0;
  private startedAt: number | null = null;
  constructor(private now = () => performance.now()) {}
  restore(seconds: number) {
    this.accumulatedMs = Math.max(0, seconds) * 1000;
    this.startedAt = null;
  }
  resume() {
    if (this.startedAt === null) this.startedAt = this.now();
  }
  seconds() {
    return Math.max(
      0,
      Math.floor(
        (this.accumulatedMs + (this.startedAt === null ? 0 : this.now() - this.startedAt)) / 1000,
      ),
    );
  }
  pause() {
    if (this.startedAt !== null) {
      this.accumulatedMs += Math.max(0, this.now() - this.startedAt);
      this.startedAt = null;
    }
    return this.seconds();
  }
}
