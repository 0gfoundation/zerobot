import { describe, it, expect } from "vitest";
import {
  generateAesKey,
  aesEcbEncrypt,
  aesEcbDecrypt,
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

  describe("computeValidationResponse", () => {
    it("should compute base64(md5('UnitreeGo2_' + key))", () => {
      // Test with a known challenge key
      // md5("UnitreeGo2_test123") should produce a deterministic result
      const response = computeValidationResponse("test123");
      expect(response).toBeTruthy();
      // Verify it's valid base64
      expect(() => Buffer.from(response, "base64")).not.toThrow();
      // The base64-decoded value should be a 32-char hex MD5 digest
      const decoded = Buffer.from(response, "base64").toString("utf-8");
      expect(decoded).toMatch(/^[0-9a-f]{32}$/);
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
