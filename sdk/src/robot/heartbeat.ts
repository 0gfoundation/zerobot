import { DataChannelType, HEARTBEAT_INTERVAL_MS } from "./constants.js";

/**
 * Manages the 2-second heartbeat that keeps the WebRTC connection alive.
 */
export class Heartbeat {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private sendFn: (msg: string) => void) {}

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private sendHeartbeat(): void {
    const now = new Date();
    const msg = JSON.stringify({
      type: DataChannelType.HEARTBEAT,
      data: {
        timeInStr: now.toISOString().replace("T", " ").slice(0, 19),
        timeInNum: Math.floor(now.getTime() / 1000),
      },
    });
    this.sendFn(msg);
  }
}
