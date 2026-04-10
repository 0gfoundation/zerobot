/**
 * Minimal WebRTC type declarations for Node.js environments.
 * In browsers, these are provided by the DOM lib.
 * In Node.js, they come from @roamhq/wrtc at runtime.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare class RTCPeerConnection {
  constructor(config?: any);
  createDataChannel(label: string, options?: any): RTCDataChannel;
  addTransceiver(
    trackOrKind: string,
    init?: { direction: string },
  ): any;
  createOffer(options?: any): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(desc: any): Promise<void>;
  close(): void;
  readonly localDescription: RTCSessionDescriptionInit | null;
}

declare class RTCSessionDescription {
  constructor(init: RTCSessionDescriptionInit);
  readonly sdp: string;
  readonly type: string;
}

interface RTCSessionDescriptionInit {
  type: string;
  sdp?: string;
}

interface RTCDataChannel {
  readonly readyState: string;
  readonly label: string;
  send(data: string | ArrayBuffer): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface RTCConfiguration {
  iceServers?: any[];
  sdpSemantics?: string;
}

interface MessageEvent {
  readonly data: any;
}

interface Event {}
