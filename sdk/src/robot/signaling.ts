import {
  aesEcbEncrypt,
  aesEcbDecrypt,
  aesGcmDecrypt,
  rsaEncrypt,
  generateAesKey,
} from "./crypto.js";
import { CON_NOTIFY_AES_KEY } from "./constants.js";

/**
 * Compute the dynamic URL path ending from the con_notify data1 response.
 *
 * Takes the last 10 characters, pairs them, and maps each pair's second character
 * from the letter range [A..J] to digits [0..9].
 */
function calcLocalPathEnding(data: string): string {
  const tail = data.slice(-10);
  let result = "";
  for (let i = 0; i < tail.length; i += 2) {
    const charCode = tail.charCodeAt(i + 1) - "A".charCodeAt(0);
    result += String(charCode);
  }
  return result;
}

interface ConNotifyResponse {
  data1: string;
  /** How `data1` is protected. The robot sends a number, the mock a string. */
  data2?: number | string;
}

/** `con_notify` `data2` values */
const ConNotifyScheme = {
  /** `data1` is plaintext */
  PLAINTEXT: 1,
  /** AES-GCM under the static key shared by all robots (Go2 1.1.8–1.1.14, G1 < 1.5.1) */
  STATIC_KEY: 2,
  /** AES-GCM under a per-device key (Go2 >= 1.1.15, G1 >= 1.5.1) */
  DEVICE_KEY: 3,
} as const;

function parseDeviceKey(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(clean)) {
    throw new Error("deviceKey must be 32 hex characters (a 16-byte AES-128 key)");
  }
  return new Uint8Array(Buffer.from(clean, "hex"));
}

export interface Go2SignalingOptions {
  /** Proxy URL for browser SDP exchange */
  proxyUrl?: string;
  /** Per-device AES-128 key, 32 hex chars. See `RobotConfig.deviceKey`. */
  deviceKey?: string;
}

/**
 * Handles SDP exchange with the Unitree Go2 robot via local network.
 *
 * Supports both the legacy (port 8081) and new (port 9991) signaling protocols,
 * including every `con_notify` encryption scheme up to the per-device key
 * introduced in Go2 firmware 1.1.15.
 */
export class Go2Signaling {
  private proxyUrl?: string;
  private deviceKey?: string;

  constructor(
    private robotIp: string,
    options: Go2SignalingOptions = {},
  ) {
    this.proxyUrl = options.proxyUrl;
    this.deviceKey = options.deviceKey;
  }

  /**
   * Exchange SDP offer for SDP answer with the robot.
   *
   * Uses the port 9991 method, and falls back to the legacy port 8081 method
   * only when 9991 is unreachable (firmware 1.0.x). Once 9991 answers, its
   * errors are thrown as they are.
   *
   * @throws If the firmware needs `deviceKey` and none was given, or the key
   *   doesn't belong to this robot.
   * @throws If the robot rejects the connection because another client
   *   (such as the Unitree app) is connected.
   */
  async negotiate(sdpOffer: string, token?: string): Promise<string> {
    if (this.proxyUrl) {
      return this.negotiateViaProxy(sdpOffer, token);
    }

    let notifyBody: string;
    try {
      const notifyResp = await fetch(
        `http://${this.robotIp}:9991/con_notify`,
        { method: "POST" },
      );
      notifyBody = await notifyResp.text();
    } catch {
      return this.negotiateLegacy(sdpOffer, token);
    }
    return this.negotiateNewMethod(notifyBody, sdpOffer, token);
  }

  /** Decrypt `con_notify`'s `data1` according to its `data2` scheme. */
  private decryptData1({ data1, data2 }: ConNotifyResponse): string {
    const scheme = data2 === undefined ? ConNotifyScheme.PLAINTEXT : Number(data2);
    const encrypted = () => new Uint8Array(Buffer.from(data1, "base64"));

    switch (scheme) {
      case ConNotifyScheme.PLAINTEXT:
        return data1;
      case ConNotifyScheme.STATIC_KEY:
        return aesGcmDecrypt(encrypted(), CON_NOTIFY_AES_KEY);
      case ConNotifyScheme.DEVICE_KEY: {
        if (!this.deviceKey) {
          throw new Error(
            "This robot's firmware (Go2 >= 1.1.15, G1 >= 1.5.1) requires its per-device key. " +
              "Pass deviceKey in the robot config. Unitree serves it from the account the robot is bound to.",
          );
        }
        const key = parseDeviceKey(this.deviceKey);
        try {
          return aesGcmDecrypt(encrypted(), key);
        } catch {
          throw new Error(
            "deviceKey was rejected: it doesn't decrypt this robot's signaling. Check it belongs to this robot.",
          );
        }
      }
      default:
        throw new Error(`Unsupported con_notify scheme data2=${String(data2)}`);
    }
  }

  /**
   * New signaling method (firmware >=1.1.x) via port 9991.
   */
  private async negotiateNewMethod(
    notifyBody: string,
    sdpOffer: string,
    token?: string,
  ): Promise<string> {
    // Steps 1–2: Decode con_notify and decrypt data1, which holds the robot's public key
    const notifyJson: ConNotifyResponse = JSON.parse(
      Buffer.from(notifyBody, "base64").toString("utf-8"),
    );
    const data1 = this.decryptData1(notifyJson);

    // Step 3: Extract RSA public key (strip 10-char padding on each side).
    // The robot sends bare base64 DER, not PEM.
    const publicKey = data1.slice(10, -10);

    // Step 4: Compute dynamic URL path ending
    const pathEnding = calcLocalPathEnding(data1);

    // Step 5: Generate AES session key and encrypt the SDP offer
    const aesKey = generateAesKey();
    const offerPayload = JSON.stringify({
      id: "STA_localNetwork",
      sdp: sdpOffer,
      type: "offer",
      token: token || "",
    });
    const encryptedSdp = aesEcbEncrypt(offerPayload, aesKey);
    const encryptedKey = rsaEncrypt(aesKey, publicKey);

    // Step 6: Send encrypted offer
    const connectResp = await fetch(
      `http://${this.robotIp}:9991/con_ing_${pathEnding}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data1: encryptedSdp, data2: encryptedKey }),
      },
    );
    const connectBody = await connectResp.text();

    // Step 7: Decrypt response to get SDP answer
    const answerJson = JSON.parse(aesEcbDecrypt(connectBody, aesKey));
    if (answerJson.sdp === "reject") {
      throw new Error(
        "Robot rejected connection — another client may be connected",
      );
    }

    return answerJson.sdp;
  }

  /**
   * Legacy signaling method (firmware 1.0.x) via port 8081.
   */
  private async negotiateLegacy(
    sdpOffer: string,
    token?: string,
  ): Promise<string> {
    const resp = await fetch(`http://${this.robotIp}:8081/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: sdpOffer,
        id: "STA_localNetwork",
        type: "offer",
        token: token || "",
      }),
    });
    const answer = (await resp.json()) as { sdp: string };
    if (answer.sdp === "reject") {
      throw new Error(
        "Robot rejected connection — another client may be connected",
      );
    }
    return answer.sdp;
  }

  /**
   * SDP exchange through a proxy server (for browser use).
   */
  private async negotiateViaProxy(
    sdpOffer: string,
    token?: string,
  ): Promise<string> {
    const resp = await fetch(this.proxyUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        robotIp: this.robotIp,
        sdpOffer,
        token: token || "",
        deviceKey: this.deviceKey,
      }),
    });
    const answer = (await resp.json()) as { sdp?: string; error?: string };
    if (!resp.ok || !answer.sdp) {
      throw new Error(answer.error ?? `Signaling proxy failed with HTTP ${resp.status}`);
    }
    return answer.sdp;
  }
}
