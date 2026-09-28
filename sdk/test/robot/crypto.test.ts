import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import forge from "node-forge";
import {
  generateAesKey,
  aesEcbEncrypt,
  aesEcbDecrypt,
  rsaEncrypt,
  computeValidationResponse,
} from "../../src/robot/crypto.js";

describe("crypto", () => {
  describe("generateAesKey", () => {
    it("should generate a 32-character hex string", () => {
      const key = generateAesKey();
      expect(key).toHaveLength(32);
      expect(key).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should generate unique keys", () => {
      const key1 = generateAesKey();
      const key2 = generateAesKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe("aesEcbEncrypt / aesEcbDecrypt", () => {
    it("should roundtrip encrypt and decrypt", () => {
      const key = "0123456789abcdef0123456789abcdef"; // 32 chars = 256-bit key
      const plaintext = "Hello, Robot!";
      const encrypted = aesEcbEncrypt(plaintext, key);
      const decrypted = aesEcbDecrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle JSON payloads", () => {
      const key = generateAesKey();
      const payload = JSON.stringify({
        id: "STA_localNetwork",
        sdp: "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n",
        type: "offer",
        token: "",
      });
      const encrypted = aesEcbEncrypt(payload, key);
      const decrypted = aesEcbDecrypt(encrypted, key);
      expect(decrypted).toBe(payload);
    });

    it("should produce base64 output", () => {
      const key = "0123456789abcdef0123456789abcdef";
      const encrypted = aesEcbEncrypt("test", key);
      // Should be valid base64
      expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    });
  });

  describe("rsaEncrypt", () => {
    const { publicKey, privateKey } = forge.pki.rsa.generateKeyPair({ bits: 1024 });
    const decrypt = (b64: string) => privateKey.decrypt(forge.util.decode64(b64), "RSAES-PKCS1-V1_5");

    it("accepts bare base64 DER, the format the robot sends", () => {
      const der = forge.util.encode64(forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey)).getBytes());
      expect(decrypt(rsaEncrypt("session-key", der))).toBe("session-key");
    });

    it("accepts PEM", () => {
      expect(decrypt(rsaEncrypt("session-key", forge.pki.publicKeyToPem(publicKey)))).toBe("session-key");
    });
  });

  describe("computeValidationResponse", () => {
    it("should base64-encode the raw md5 bytes of 'UnitreeGo2_' + key", () => {
      // Real Go2 firmware accepts this; base64 of the hex digest times out
      const expected = crypto.createHash("md5").update("UnitreeGo2_test123").digest("base64");
      expect(computeValidationResponse("test123")).toBe(expected);
    });

    it("should produce deterministic results", () => {
      const r1 = computeValidationResponse("challenge_abc");
      const r2 = computeValidationResponse("challenge_abc");
      expect(r1).toBe(r2);
    });

    it("should produce different results for different challenges", () => {
      const r1 = computeValidationResponse("key1");
      const r2 = computeValidationResponse("key2");
      expect(r1).not.toBe(r2);
    });
  });
});
