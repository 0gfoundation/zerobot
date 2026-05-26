/**
 * Mock Go2 Pro WebRTC server for testing without physical hardware.
 *
 * Emulates the robot's signaling endpoints (port 9991), WebRTC peer connection,
 * data channel validation, heartbeat, and command acknowledgment.
 *
 * Usage:
 *   npx tsx mock-robot.ts                     # defaults to port 9991
 *   npx tsx mock-robot.ts --port 9991
 */
import http from "node:http";
import forge from "node-forge";
import {
  aesEcbEncrypt,
  aesEcbDecrypt,
  generateAesKey,
} from "../robot/crypto.js";
import { computeValidationResponse } from "../robot/crypto.js";
import { GO2_SPORT_SCHEMAS } from "../command/schemas/go2.js";

// Mock is a Go2 stand-in; validate against Go2 sport schemas.
const COMMAND_SCHEMA_MAP = new Map(GO2_SPORT_SCHEMAS.map((s) => [s.apiId, s]));

// ---- RSA Key Pair (generated once at startup) ----

const rsaKeyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
const publicKeyPem = forge.pki.publicKeyToPem(rsaKeyPair.publicKey);
const privateKey = rsaKeyPair.privateKey;

// ---- Signaling State ----

/** 10 random chars as prefix/suffix padding around the PEM key */
function randomPadding(len: number): string {
  const chars = "ABCDEFGHIJ";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Build the data1 string: 10 chars padding + PEM + 10 chars padding.
 * The last 10 chars encode the dynamic URL path via pairs mapping to digits.
 */
function buildData1(): string {
  const prefix = randomPadding(10);
  // The suffix must be 5 pairs of chars where the second char of each pair
  // maps to digits 0-9 via ['A'..'J']. We use a fixed suffix for simplicity.
  const suffix = "AABBCCDDEE"; // maps to path ending "01234"
  return prefix + publicKeyPem + suffix;
}

function calcExpectedPathEnding(data1: string): string {
  const tail = data1.slice(-10);
  let result = "";
  for (let i = 0; i < tail.length; i += 2) {
    const charCode = tail.charCodeAt(i + 1) - "A".charCodeAt(0);
    result += String(charCode);
  }
  return result;
}

// ---- WebRTC Mock (uses @roamhq/wrtc) ----

import { createRequire } from "node:module";

let wrtc: any;

function loadWrtc() {
  try {
    const require = createRequire(import.meta.url);
    wrtc = require("@roamhq/wrtc");
  } catch {
    console.error(
      "Mock robot requires @roamhq/wrtc. Install it: pnpm add -D @roamhq/wrtc",
    );
    process.exit(1);
  }
}

interface MockConnection {
  pc: any;
  dataChannel: any | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  validated: boolean;
}

let activeConnection: MockConnection | null = null;

function cleanupConnection() {
  if (activeConnection) {
    if (activeConnection.heartbeatInterval)
      clearInterval(activeConnection.heartbeatInterval);
    if (activeConnection.dataChannel) activeConnection.dataChannel.close();
    if (activeConnection.pc) activeConnection.pc.close();
    activeConnection = null;
    console.log("[mock] Connection cleaned up");
  }
}

async function handleSdpOffer(clientSdp: string): Promise<string> {
  cleanupConnection();

  const pc = new wrtc.RTCPeerConnection();
  const conn: MockConnection = {
    pc,
    dataChannel: null,
    heartbeatInterval: null,
    validated: false,
  };
  activeConnection = conn;

  // Handle data channel created by client
  pc.ondatachannel = (event: any) => {
    const dc = event.channel;
    conn.dataChannel = dc;
    console.log(`[mock] Data channel "${dc.label}" opened`);

    dc.onopen = () => {
      // Send validation challenge
      const challengeKey = generateAesKey();
      console.log("[mock] Sending validation challenge");
      dc.send(JSON.stringify({ type: "validation", data: challengeKey }));

      // Store expected response for verification
      (conn as any).expectedValidation =
        computeValidationResponse(challengeKey);
    };

    dc.onmessage = (event: any) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        handleDataChannelMessage(conn, dc, msg);
      } catch {}
    };

    dc.onclose = () => {
      console.log("[mock] Data channel closed");
      cleanupConnection();
    };
  };

  // Set remote description (client's offer)
  await pc.setRemoteDescription(
    new wrtc.RTCSessionDescription({ type: "offer", sdp: clientSdp }),
  );

  // Create and set answer
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Wait for ICE gathering to complete so all candidates are in the SDP
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") resolve();
      };
    });
  }

  return pc.localDescription.sdp;
}

function handleDataChannelMessage(
  conn: MockConnection,
  dc: any,
  msg: any,
): void {
  switch (msg.type) {
    case "validation": {
      const expected = (conn as any).expectedValidation;
      if (msg.data === expected) {
        conn.validated = true;
        dc.send(JSON.stringify({ type: "validation", data: "Validation Ok." }));
        console.log("[mock] Validation successful");

        // Start responding to heartbeats
        conn.heartbeatInterval = setInterval(() => {
          // Mock robot doesn't need to send heartbeats, but we keep the interval
          // to detect connection drops
        }, 2000);
      } else {
        console.log("[mock] Validation failed — bad response");
        dc.send(
          JSON.stringify({ type: "err", data: "Validation failed" }),
        );
      }
      break;
    }

    case "heartbeat":
      // Client heartbeat received — connection is alive
      break;

    case "req": {
      if (!conn.validated) {
        console.log("[mock] Command rejected — not validated");
        return;
      }
      const apiId = msg.data?.header?.identity?.api_id;
      const id = msg.data?.header?.identity?.id;
      const params = msg.data?.parameter;
      const schema = apiId ? COMMAND_SCHEMA_MAP.get(apiId) : undefined;
      const cmdName = schema?.name ?? `unknown(${apiId})`;

      console.log(
        `[mock] Command: ${cmdName}${params ? ` params=${params}` : ""}`,
      );

      // Send response acknowledging the command
      dc.send(
        JSON.stringify({
          type: "res",
          topic: msg.topic,
          data: {
            header: { identity: { id, api_id: apiId } },
            data: { ret: 0, error: "" },
          },
        }),
      );
      break;
    }

    case "subscribe":
      console.log(`[mock] Subscribe: ${msg.topic}`);
      break;

    case "unsubscribe":
      console.log(`[mock] Unsubscribe: ${msg.topic}`);
      break;

    case "vid":
      console.log(`[mock] Video: ${msg.data}`);
      break;

    case "aud":
      console.log(`[mock] Audio: ${msg.data}`);
      break;

    default:
      console.log(`[mock] Unknown message type: ${msg.type}`);
  }
}

// ---- HTTP Signaling Server ----

const data1 = buildData1();
const expectedPath = calcExpectedPathEnding(data1);

function createSignalingServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    let body = "";
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", async () => {
      try {
        if (req.url === "/con_notify") {
          // Return base64-encoded JSON with the public key embedded in data1
          const response = JSON.stringify({ data1, data2: "1" });
          const encoded = Buffer.from(response).toString("base64");
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(encoded);
          console.log("[mock] con_notify served");
          return;
        }

        if (req.url === `/con_ing_${expectedPath}`) {
          // Client sends {data1: AES-encrypted SDP, data2: RSA-encrypted AES key}
          const payload = JSON.parse(body);

          // Decrypt the AES key with our RSA private key
          const encryptedKeyBytes = forge.util.decode64(payload.data2);
          const keySize = Math.ceil(privateKey.n.bitLength() / 8);
          let aesKey = "";
          for (let i = 0; i < encryptedKeyBytes.length; i += keySize) {
            const chunk = encryptedKeyBytes.slice(i, i + keySize);
            aesKey += privateKey.decrypt(chunk, "RSAES-PKCS1-V1_5");
          }

          // Decrypt the SDP offer
          const offerJson = JSON.parse(
            aesEcbDecrypt(payload.data1, aesKey),
          );
          console.log(`[mock] SDP offer received (id: ${offerJson.id})`);

          // Create WebRTC answer
          const answerSdp = await handleSdpOffer(offerJson.sdp);

          // Encrypt the answer with the same AES key
          const answerPayload = JSON.stringify({
            sdp: answerSdp,
            type: "answer",
          });
          const encrypted = aesEcbEncrypt(answerPayload, aesKey);

          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(encrypted);
          console.log("[mock] SDP answer sent");
          return;
        }

        // Legacy endpoint (port 8081 style, but we serve it on 9991 too)
        if (req.url === "/offer") {
          const offer = JSON.parse(body);
          console.log(`[mock] Legacy SDP offer received`);
          const answerSdp = await handleSdpOffer(offer.sdp);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sdp: answerSdp, type: "answer" }));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      } catch (err: any) {
        console.error("[mock] Error:", err.message);
        res.writeHead(500);
        res.end(err.message);
      }
    });
  });

  return server;
}

// ---- Main ----

export function startMockRobot(port = 9991): http.Server {
  loadWrtc();
  const server = createSignalingServer(port);
  server.listen(port, () => {
    console.log(`[mock] Go2 Pro mock robot running on port ${port}`);
    console.log(`[mock] Signaling: http://localhost:${port}/con_notify`);
    console.log(`[mock] Path ending: ${expectedPath}`);
  });
  return server;
}

// Run directly
const isMain =
  process.argv[1]?.endsWith("server.ts") ||
  process.argv[1]?.endsWith("server.js");
if (isMain) {
  const portArg = process.argv.indexOf("--port");
  const port = portArg >= 0 ? parseInt(process.argv[portArg + 1]) : 9991;
  startMockRobot(port);
}
