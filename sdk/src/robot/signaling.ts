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
  data2: string;
}

/**
 * Handles SDP exchange with the Unitree Go2 robot via local network.
 *
 * Supports both the legacy (port 8081) and new (port 9991) signaling protocols,
 * including firmware >=1.1.8 AES-GCM encrypted responses.
 */
export class Go2Signaling {
  constructor(
    private robotIp: string,
    private proxyUrl?: string,
  ) {}

  /**
   * Exchange SDP offer for SDP answer with the robot.
   * Tries the new encrypted method first (port 9991), falls back to legacy (port 8081).
   */
  async negotiate(sdpOffer: string, token?: string): Promise<string> {
    if (this.proxyUrl) {
      return this.negotiateViaProxy(sdpOffer, token);
    }

    try {
      return await this.negotiateNewMethod(sdpOffer, token);
    } catch {
      return await this.negotiateLegacy(sdpOffer, token);
    }
  }

  /**
   * New signaling method (firmware >=1.1.x) via port 9991.
   */
  private async negotiateNewMethod(
    sdpOffer: string,
    token?: string,
  ): Promise<string> {
    // Step 1: Get robot's public key via con_notify
    const notifyResp = await fetch(
      `http://${this.robotIp}:9991/con_notify`,
      { method: "POST" },
    );
    const notifyBody = await notifyResp.text();
    const notifyJson: ConNotifyResponse = JSON.parse(
      Buffer.from(notifyBody, "base64").toString("utf-8"),
    );

    let data1 = notifyJson.data1;

    // Step 2: If firmware >=1.1.8, data1 is AES-GCM encrypted
    if (notifyJson.data2 === "2") {
      const encryptedBytes = Buffer.from(data1, "base64");
      data1 = aesGcmDecrypt(
        new Uint8Array(encryptedBytes),
        CON_NOTIFY_AES_KEY,
      );
    }

    // Step 3: Extract RSA public key (strip 10-char padding on each side)
    const publicKeyPem = data1.slice(10, -10);

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
    const encryptedKey = rsaEncrypt(aesKey, publicKeyPem);

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
      }),
    });
    const answer = (await resp.json()) as { sdp: string };
    return answer.sdp;
  }
}
