import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import crypto from "node:crypto";
import forge from "node-forge";
import { Go2Signaling } from "../../src/robot/signaling.js";
import { aesEcbDecrypt, aesEcbEncrypt } from "../../src/robot/crypto.js";
import { CON_NOTIFY_AES_KEY } from "../../src/robot/constants.js";

const IP = "10.0.0.2";
const DEVICE_KEY = "00112233445566778899aabbccddeeff";
const SDP_ANSWER = "v=0 answer";

let privateKey: forge.pki.rsa.PrivateKey;
/** 10 chars padding + base64 DER public key + a suffix that maps to path ending "01234" */
let data1: string;

beforeAll(() => {
  const pair = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  privateKey = pair.privateKey;
  const der = forge.util.encode64(forge.asn1.toDer(forge.pki.publicKeyToAsn1(pair.publicKey)).getBytes());
  data1 = "ABCDEFGHIJ" + der + "AABBCCDDEE";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** AES-128-GCM laid out as ciphertext | nonce | tag, the robot's format */
function gcmEncrypt(plain: string, key: Uint8Array): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-128-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([ciphertext, nonce, cipher.getAuthTag()]).toString("base64");
}

/** Stub fetch as a robot on port 9991 whose con_notify returns `notify`. Returns the URLs fetched. */
function stubRobot(notify: { data1: string; data2?: number | string }): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url === `http://${IP}:9991/con_notify`) {
        return new Response(Buffer.from(JSON.stringify(notify)).toString("base64"));
      }
      if (url === `http://${IP}:9991/con_ing_01234`) {
        const payload = JSON.parse(init!.body as string);
        const aesKey = privateKey.decrypt(forge.util.decode64(payload.data2), "RSAES-PKCS1-V1_5");
        const offer = JSON.parse(aesEcbDecrypt(payload.data1, aesKey));
        expect(offer).toMatchObject({ type: "offer", sdp: "v=0 offer" });
        return new Response(aesEcbEncrypt(JSON.stringify({ sdp: SDP_ANSWER, type: "answer" }), aesKey));
      }
      throw new TypeError("fetch failed");
    }),
  );
  return calls;
}

describe("Go2Signaling", () => {
  describe("con_notify data2=3 (per-device key)", () => {
    it("decrypts with the device key and completes the exchange", async () => {
      stubRobot({ data1: gcmEncrypt(data1, Buffer.from(DEVICE_KEY, "hex")), data2: 3 });
      const signaling = new Go2Signaling(IP, { deviceKey: DEVICE_KEY });
      await expect(signaling.negotiate("v=0 offer")).resolves.toBe(SDP_ANSWER);
    });

    it("accepts an upper-case key with surrounding whitespace", async () => {
      stubRobot({ data1: gcmEncrypt(data1, Buffer.from(DEVICE_KEY, "hex")), data2: 3 });
      const signaling = new Go2Signaling(IP, { deviceKey: ` ${DEVICE_KEY.toUpperCase()}\n` });
      await expect(signaling.negotiate("v=0 offer")).resolves.toBe(SDP_ANSWER);
    });

    it("requires a device key and does not fall back to legacy signaling", async () => {
      const calls = stubRobot({ data1: gcmEncrypt(data1, Buffer.from(DEVICE_KEY, "hex")), data2: 3 });
      await expect(new Go2Signaling(IP).negotiate("v=0 offer")).rejects.toThrow(
        /requires its per-device key/,
      );
      expect(calls.some((url) => url.includes(":8081"))).toBe(false);
    });

    it("rejects a key that doesn't belong to the robot", async () => {
      stubRobot({ data1: gcmEncrypt(data1, Buffer.from(DEVICE_KEY, "hex")), data2: 3 });
      const signaling = new Go2Signaling(IP, { deviceKey: "ff".repeat(16) });
      await expect(signaling.negotiate("v=0 offer")).rejects.toThrow(/deviceKey was rejected/);
    });

    it("rejects a malformed key", async () => {
      stubRobot({ data1: gcmEncrypt(data1, Buffer.from(DEVICE_KEY, "hex")), data2: 3 });
      const signaling = new Go2Signaling(IP, { deviceKey: "not-a-key" });
      await expect(signaling.negotiate("v=0 offer")).rejects.toThrow(/32 hex characters/);
    });
  });

  it("decrypts data2=2 with the static key when the robot sends it as a number", async () => {
    stubRobot({ data1: gcmEncrypt(data1, CON_NOTIFY_AES_KEY), data2: 2 });
    await expect(new Go2Signaling(IP).negotiate("v=0 offer")).resolves.toBe(SDP_ANSWER);
  });

  it("uses plaintext data1 when data2 is the string \"1\"", async () => {
    stubRobot({ data1, data2: "1" });
    await expect(new Go2Signaling(IP).negotiate("v=0 offer")).resolves.toBe(SDP_ANSWER);
  });

  it("falls back to legacy signaling on port 8081 only when 9991 is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === `http://${IP}:8081/offer`) return Response.json({ sdp: SDP_ANSWER });
        throw new TypeError("fetch failed");
      }),
    );
    await expect(new Go2Signaling(IP).negotiate("v=0 offer")).resolves.toBe(SDP_ANSWER);
  });

  it("forwards deviceKey to the signaling proxy and surfaces its error", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "deviceKey was rejected" }, { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const signaling = new Go2Signaling(IP, { proxyUrl: "/api/negotiate", deviceKey: DEVICE_KEY });

    await expect(signaling.negotiate("v=0 offer")).rejects.toThrow("deviceKey was rejected");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ robotIp: IP, deviceKey: DEVICE_KEY });
  });
});
