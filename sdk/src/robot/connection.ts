import { EventEmitter } from "eventemitter3";
import type { RobotConfig, ConnectionStatus } from "../types/robot.js";
import type { SportCommand } from "../types/commands.js";
import { Go2Signaling } from "./signaling.js";
import { handleValidationMessage } from "./validation.js";
import { Heartbeat } from "./heartbeat.js";
import {
  buildSportCommandMessage,
  buildVuiCommandMessage,
  buildMotionSwitcherMessage,
  buildSubscribeMessage,
  buildUnsubscribeMessage,
  buildVideoToggleMessage,
  buildAudioToggleMessage,
} from "./commands.js";
import { getWebRTCProvider } from "./platform.js";
import { DataChannelType } from "./constants.js";

export interface Go2ConnectionEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  message: (msg: Record<string, unknown>) => void;
  status: (status: ConnectionStatus) => void;
}

/**
 * Manages the WebRTC connection to a Unitree Go2 Pro robot.
 *
 * Usage:
 * ```ts
 * const conn = new Go2Connection({ ip: "192.168.123.18" });
 * await conn.connect();
 * await conn.sportCommand(SportCommand.Hello);
 * await conn.disconnect();
 * ```
 */
export class Go2Connection extends EventEmitter<Go2ConnectionEvents> {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private heartbeat: Heartbeat | null = null;
  private signaling: Go2Signaling;
  private _status: ConnectionStatus = "disconnected";
  private validationPromise: {
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;
  private channelOpenPromise: {
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;

  constructor(private config: RobotConfig) {
    super();
    this.signaling = new Go2Signaling(config.ip, config.signalingProxyUrl);
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.emit("status", status);
  }

  /**
   * Establish WebRTC connection to the robot.
   */
  async connect(): Promise<void> {
    if (this._status === "connected") return;
    this.setStatus("connecting");

    try {
      const { RTCPeerConnection, RTCSessionDescription } =
        getWebRTCProvider();

      // Create peer connection
      const pc = new RTCPeerConnection({
        sdpSemantics: "unified-plan",
      });
      this.pc = pc;

      // Create data channel
      const dc = pc.createDataChannel("data", { ordered: true });
      this.dataChannel = dc;
      this.setupDataChannelHandlers();

      // Add media transceivers
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "sendrecv" });

      // Create and exchange SDP
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answerSdp = await this.signaling.negotiate(
        offer.sdp!,
        this.config.token,
      );
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: answerSdp }),
      );

      // Wait for data channel to open
      await this.waitForChannelOpen(10000);

      // Wait for validation handshake
      this.setStatus("validating");
      await this.waitForValidation(10000);

      // Start heartbeat
      this.heartbeat = new Heartbeat((msg) => this.sendRaw(msg));
      this.heartbeat.start();

      this.setStatus("connected");
      this.emit("connected");
    } catch (err) {
      this.setStatus("error");
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Send a sport command to the robot.
   */
  sportCommand(
    apiId: SportCommand,
    parameters?: Record<string, unknown>,
  ): void {
    this.sendRaw(buildSportCommandMessage(apiId, parameters));
  }

  /**
   * Send a VUI command (LED, volume, brightness).
   */
  vuiCommand(apiId: number, parameters?: Record<string, unknown>): void {
    this.sendRaw(buildVuiCommandMessage(apiId, parameters));
  }

  /**
   * Send a motion switcher command.
   */
  motionSwitcherCommand(
    apiId: number,
    parameters?: Record<string, unknown>,
  ): void {
    this.sendRaw(buildMotionSwitcherMessage(apiId, parameters));
  }

  /**
   * Subscribe to a robot topic (e.g., sport mode state, low state).
   */
  subscribe(topic: string): void {
    this.sendRaw(buildSubscribeMessage(topic));
  }

  /**
   * Unsubscribe from a robot topic.
   */
  unsubscribe(topic: string): void {
    this.sendRaw(buildUnsubscribeMessage(topic));
  }

  /**
   * Toggle video stream.
   */
  setVideo(on: boolean): void {
    this.sendRaw(buildVideoToggleMessage(on));
  }

  /**
   * Toggle audio stream.
   */
  setAudio(on: boolean): void {
    this.sendRaw(buildAudioToggleMessage(on));
  }

  /**
   * Disconnect from the robot and clean up.
   */
  async disconnect(): Promise<void> {
    this.heartbeat?.stop();
    this.heartbeat = null;

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.setStatus("disconnected");
    this.emit("disconnected");
  }

  /**
   * Send a raw string message on the data channel.
   */
  private sendRaw(msg: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }
    this.dataChannel.send(msg);
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      this.channelOpenPromise?.resolve();
    };

    this.dataChannel.onclose = () => {
      this.heartbeat?.stop();
      this.setStatus("disconnected");
      this.emit("disconnected");
    };

    this.dataChannel.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return; // Skip binary for now

      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Non-JSON message, ignore
      }
    };

    this.dataChannel.onerror = (event: Event) => {
      const err = new Error("Data channel error");
      this.emit("error", err);
    };
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    if (type === DataChannelType.VALIDATION) {
      const result = handleValidationMessage(
        msg as { type: string; data: string },
        (response) => this.sendRaw(response),
      );
      if (result.success) {
        this.validationPromise?.resolve();
      }
      return;
    }

    // Forward all other messages to listeners
    this.emit("message", msg);
  }

  private waitForChannelOpen(timeoutMs: number): Promise<void> {
    if (this.dataChannel?.readyState === "open") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.channelOpenPromise = { resolve, reject };
      setTimeout(() => {
        reject(new Error("Data channel open timeout"));
        this.channelOpenPromise = null;
      }, timeoutMs);
    });
  }

  private waitForValidation(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.validationPromise = { resolve, reject };
      setTimeout(() => {
        reject(new Error("Validation timeout"));
        this.validationPromise = null;
      }, timeoutMs);
    });
  }
}
