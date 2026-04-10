import forge from "node-forge";

/**
 * Generate a random AES-256 key as a 32-character hex string.
 * Matches the Python implementation which uses uuid4().hex (32 hex chars = 128 bits
 * used as a string key for AES, but the AES implementation treats it as 32 bytes = 256 bits).
 */
export function generateAesKey(): string {
  const bytes = forge.random.getBytesSync(16);
  return forge.util.bytesToHex(bytes);
}

/**
 * AES-256-ECB encrypt with PKCS5 padding.
 * Returns base64-encoded ciphertext.
 *
 * The key is treated as raw bytes (32 hex chars = 32 bytes = AES-256).
 * This matches the Python pycryptodome behavior where the key string bytes are used directly.
 */
export function aesEcbEncrypt(plaintext: string, key: string): string {
  const cipher = forge.cipher.createCipher("AES-ECB", key);
  cipher.start();
  cipher.update(forge.util.createBuffer(plaintext, "utf8"));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

/**
 * AES-256-ECB decrypt with PKCS5 padding.
 * Input is base64-encoded ciphertext.
 */
export function aesEcbDecrypt(ciphertext: string, key: string): string {
  const decipher = forge.cipher.createDecipher("AES-ECB", key);
  decipher.start();
  decipher.update(forge.util.createBuffer(forge.util.decode64(ciphertext)));
  decipher.finish();
  return decipher.output.toString();
}

/**
 * AES-GCM decrypt for firmware >=1.1.8 con_notify response.
 * The data format: ciphertext + nonce(12 bytes) + tag(16 bytes).
 */
export function aesGcmDecrypt(data: Uint8Array, key: Uint8Array): string {
  // Convert Uint8Arrays to forge binary strings
  const dataStr = forge.util.binary.raw.encode(data);
  const tagStr = dataStr.slice(dataStr.length - 16);
  const nonceStr = dataStr.slice(dataStr.length - 28, dataStr.length - 16);
  const ciphertextStr = dataStr.slice(0, dataStr.length - 28);

  const decipher = forge.cipher.createDecipher(
    "AES-GCM",
    forge.util.binary.raw.encode(key),
  );
  decipher.start({
    iv: forge.util.createBuffer(nonceStr),
    tag: forge.util.createBuffer(tagStr),
  });
  decipher.update(forge.util.createBuffer(ciphertextStr));
  if (!decipher.finish()) {
    throw new Error("AES-GCM decryption failed: invalid tag");
  }
  return decipher.output.toString();
}

/**
 * RSA PKCS1-v1.5 encrypt. Handles chunking for large data.
 * Returns base64-encoded ciphertext.
 */
export function rsaEncrypt(data: string, publicKeyPem: string): string {
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const keySize = Math.ceil(publicKey.n.bitLength() / 8);
  const maxChunkSize = keySize - 11; // PKCS1-v1.5 padding overhead

  const dataBytes = forge.util.encodeUtf8(data);
  const chunks: string[] = [];

  for (let i = 0; i < dataBytes.length; i += maxChunkSize) {
    const chunk = dataBytes.slice(i, i + maxChunkSize);
    chunks.push(publicKey.encrypt(chunk, "RSAES-PKCS1-V1_5"));
  }

  return forge.util.encode64(chunks.join(""));
}

/**
 * Compute the validation response for WebRTC channel authentication.
 * Algorithm: base64(md5("UnitreeGo2_" + challengeKey))
 * where md5 returns a hex string, then that hex string is base64-encoded.
 */
export function computeValidationResponse(challengeKey: string): string {
  const md = forge.md.md5.create();
  md.update("UnitreeGo2_" + challengeKey);
  const hexDigest = md.digest().toHex();
  return forge.util.encode64(hexDigest);
}
