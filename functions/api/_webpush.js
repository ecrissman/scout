// functions/api/_webpush.js
// Minimal Web Push implementation for Cloudflare Workers (Web Crypto only,
// no Node deps). Implements:
//   - VAPID JWT (RFC 8292) signed with ES256
//   - aes128gcm payload encryption (RFC 8291)
//
// Usage:
//   await sendWebPush({
//     subscription: { endpoint, keys: { p256dh, auth } },
//     payload: 'JSON or string',
//     vapid: { publicKey, privateKey, subject: 'mailto:you@example.com' },
//   });
//
// Returns the upstream Response from the push service. Caller decides what
// to do with 404/410 (subscription gone — delete from DB).
//
// References:
//   https://datatracker.ietf.org/doc/html/rfc8291
//   https://datatracker.ietf.org/doc/html/rfc8292
//   https://blog.mozilla.org/services/2016/04/04/using-vapid-with-webpush/

// ── base64url helpers ───────────────────────────────────────────────────────
const b64uEncode = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const b64uDecode = (s) => {
  const pad = (4 - (s.length % 4)) % 4;
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const concat = (...arrs) => {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
};

// ── JWK helpers (raw P-256 ↔ JWK) ───────────────────────────────────────────
// VAPID keys are typically distributed as raw 65-byte uncompressed EC points
// (public, 0x04 || X || Y) and 32-byte private scalars, base64url-encoded.
// Web Crypto wants JWK. These convert.
function rawPublicKeyToJwk(rawBytes) {
  if (rawBytes.length !== 65 || rawBytes[0] !== 0x04) {
    throw new Error('Expected uncompressed P-256 point (65 bytes, leading 0x04)');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(rawBytes.subarray(1, 33)),
    y: b64uEncode(rawBytes.subarray(33, 65)),
    ext: true,
  };
}
function rawPrivateKeyToJwk(rawPub, rawPriv) {
  const pub = rawPublicKeyToJwk(rawPub);
  return { ...pub, d: b64uEncode(rawPriv) };
}

async function importVapidPrivateKey(publicKeyB64u, privateKeyB64u) {
  const pubRaw = b64uDecode(publicKeyB64u);
  const privRaw = b64uDecode(privateKeyB64u);
  const jwk = rawPrivateKeyToJwk(pubRaw, privRaw);
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
}

// ── VAPID JWT (ES256) ───────────────────────────────────────────────────────
async function buildVapidJwt(audience, subject, vapidPub, vapidPriv) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12h, well under the 24h spec maximum
    sub: subject,
  };
  const encHeader = b64uEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;
  const key = await importVapidPrivateKey(vapidPub, vapidPriv);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  // Web Crypto returns raw r||s (64 bytes), which is exactly what JWS ES256 wants.
  return `${signingInput}.${b64uEncode(sig)}`;
}

// ── HKDF (RFC 5869) using Web Crypto ────────────────────────────────────────
async function hkdf(salt, ikm, info, length) {
  const baseKey = await crypto.subtle.importKey(
    'raw', ikm, { name: 'HKDF' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    length * 8
  );
  return new Uint8Array(bits);
}

// ── aes128gcm payload encryption (RFC 8291) ─────────────────────────────────
// Returns an aes128gcm content-coded body. Steps:
//   1. Generate ephemeral P-256 keypair (AS keypair).
//   2. ECDH(AS_priv, UA_pub) → IKM_ecdh.
//   3. PRK_key = HKDF(auth_secret, IKM_ecdh, "WebPush: info\0" || UA_pub || AS_pub, 32).
//   4. Salt (16 random bytes).
//   5. CEK = HKDF(salt, PRK_key, "Content-Encoding: aes128gcm\0", 16).
//   6. Nonce = HKDF(salt, PRK_key, "Content-Encoding: nonce\0", 12).
//   7. AES-GCM encrypt (plaintext || 0x02) with CEK + Nonce.
//   8. Body = salt(16) || rs(4 BE = 4096) || idlen(1 = 65) || keyid(AS_pub, 65) || ciphertext.
async function encryptAes128gcm(plaintext, uaPubRaw, authSecret) {
  // 1. Ephemeral AS keypair
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits']
  );
  const asPubJwk = await crypto.subtle.exportKey('jwk', asKeyPair.publicKey);
  const asPubRaw = concat(
    new Uint8Array([0x04]),
    b64uDecode(asPubJwk.x),
    b64uDecode(asPubJwk.y)
  );

  // 2. ECDH
  const uaPubKey = await crypto.subtle.importKey(
    'jwk', rawPublicKeyToJwk(uaPubRaw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );
  const ecdhBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPubKey },
    asKeyPair.privateKey,
    256
  );
  const ikmEcdh = new Uint8Array(ecdhBits);

  // 3. PRK_key
  const infoPrk = concat(
    new TextEncoder().encode('WebPush: info\0'),
    uaPubRaw,
    asPubRaw
  );
  const prkKey = await hkdf(authSecret, ikmEcdh, infoPrk, 32);

  // 4. Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5/6. CEK + Nonce
  const cek = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prkKey, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // 7. Encrypt (append 0x02 — final-record padding delimiter)
  const cekKey = await crypto.subtle.importKey(
    'raw', cek, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cekKey,
    padded
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // 8. Body header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlen = new Uint8Array([asPubRaw.length]);     // 65
  const header = concat(salt, rs, idlen, asPubRaw);

  return concat(header, ciphertext);
}

/**
 * Send a single Web Push notification.
 * @param {object} args
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} args.subscription
 * @param {string} args.payload — UTF-8 string (typically JSON.stringify(...))
 * @param {{publicKey:string, privateKey:string, subject:string}} args.vapid
 * @param {number} [args.ttl=86400]
 * @returns {Promise<Response>}
 */
export async function sendWebPush({ subscription, payload, vapid, ttl = 86400 }) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience, vapid.subject, vapid.publicKey, vapid.privateKey);

  const uaPub = b64uDecode(subscription.keys.p256dh);
  const auth = b64uDecode(subscription.keys.auth);
  const plaintext = new TextEncoder().encode(payload || '');
  const body = await encryptAes128gcm(plaintext, uaPub, auth);

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(ttl),
    },
    body,
  });
}
