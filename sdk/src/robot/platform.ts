/* eslint-disable @typescript-eslint/no-explicit-any */

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
 * - In browsers: uses native WebRTC APIs (returns synchronously after the
 *   first await tick — no Node-only code runs in this branch).
 * - In Node.js: uses `@roamhq/wrtc` (an optional peer dep), loaded via
 *   `createRequire` from `node:module`.
 *
 * `node:module` is imported *dynamically* and via a string-concatenated
 * specifier so that browser bundlers (Vite, Rollup, esbuild, webpack)
 * leave it unresolved at build time. At runtime in a browser the native
 * branch returns before the dynamic import is attempted; if it ever is,
 * the failure is caught and surfaced as a clear "install @roamhq/wrtc"
 * error.
 */
export async function getWebRTCProvider(): Promise<WebRTCProvider> {
  if (cachedProvider) return cachedProvider;

  // Browser / native WebRTC
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

  // Node.js: load `@roamhq/wrtc` via `createRequire`. Both specifiers are
  // assembled at runtime so static bundler analysis ignores them.
  try {
    const nodeModuleSpec = "node:" + "module";
    // @vite-ignore: the unanalyzable specifier is intentional — see header doc.
    const { createRequire } = await import(/* @vite-ignore */ nodeModuleSpec);
    const wrtcSpec = "@roamhq/" + "wrtc";
    const wrtc = createRequire(import.meta.url)(wrtcSpec);
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
