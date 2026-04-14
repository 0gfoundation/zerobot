/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";

/**
 * Minimal interface for the WebRTC types we need.
 * Uses `any` constructors to avoid coupling to a specific WebRTC type source.
 */
export interface WebRTCProvider {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
}

let cachedProvider: WebRTCProvider | null = null;

/**
 * Get the appropriate WebRTC implementation for the current runtime.
 *
 * - In browsers: uses native WebRTC APIs
 * - In Node.js: uses @roamhq/wrtc (must be installed as a peer dependency)
 */
export function getWebRTCProvider(): WebRTCProvider {
  if (cachedProvider) return cachedProvider;

  // Check for browser/native WebRTC
  const g = globalThis as any;
  if (
    typeof g.RTCPeerConnection !== "undefined" &&
    typeof g.RTCSessionDescription !== "undefined"
  ) {
    cachedProvider = {
      RTCPeerConnection: g.RTCPeerConnection,
      RTCSessionDescription: g.RTCSessionDescription,
    };
    return cachedProvider;
  }

  // Node.js: try to load @roamhq/wrtc via createRequire (works in ESM)
  try {
    const require = createRequire(import.meta.url);
    const wrtc = require("@roamhq/wrtc");
    cachedProvider = {
      RTCPeerConnection: wrtc.RTCPeerConnection,
      RTCSessionDescription: wrtc.RTCSessionDescription,
    };
    return cachedProvider;
  } catch {
    throw new Error(
      "No WebRTC implementation found. In Node.js, install @roamhq/wrtc: npm install @roamhq/wrtc",
    );
  }
}
