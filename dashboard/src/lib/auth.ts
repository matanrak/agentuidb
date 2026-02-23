const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Constant-time string comparison using HMAC.
 * Computes HMAC of both strings and compares digests.
 */
export async function safeCompare(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("compare"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);
  if (viewA.length !== viewB.length) return false;
  let result = 0;
  for (let i = 0; i < viewA.length; i++) result |= viewA[i]! ^ viewB[i]!;
  return result === 0;
}

/**
 * Create an HMAC-signed session token.
 * Format: `nonce.expiry.signature`
 */
export async function createSessionToken(secret: string): Promise<string> {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const nonceHex = toHex(nonce.buffer);
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${nonceHex}.${expiry}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toHex(sig)}`;
}

/**
 * Verify an HMAC-signed session token. Returns true if valid and not expired.
 * Uses crypto.subtle.verify which is inherently timing-safe.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [nonce, expiryStr, sig] = parts;
  const payload = `${nonce}.${expiryStr}`;
  const key = await importKey(secret);

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(sig!),
    encoder.encode(payload),
  );
  if (!valid) return false;

  const expiry = parseInt(expiryStr!, 10);
  return !isNaN(expiry) && expiry >= Math.floor(Date.now() / 1000);
}
