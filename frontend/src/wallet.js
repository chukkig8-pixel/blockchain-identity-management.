// Browser wallet. The private key is generated with WebCrypto and never sent to the server.
const KEY = "bcid.wallet.v1";
const ALGO = { name: "ECDSA", namedCurve: "P-256" };

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function loadWallet() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function saveWallet(w) { localStorage.setItem(KEY, JSON.stringify(w)); }
export function clearWallet() { localStorage.removeItem(KEY); }

export async function createKeys() {
  const pair = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateJwk: priv,
    publicJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
  };
}

export async function sign(privateJwk, message) {
  const key = await crypto.subtle.importKey("jwk", privateJwk, ALGO, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(message));
  return b64u(sig); // raw r||s, which the backend accepts
}

// Must match IdentityService.holder_message on the server.
export const presentationMessage = (nonce, credentialId, root, keys) =>
  `${nonce}|${credentialId}|${root}|${[...keys].sort().join(",")}`;

export const SHARED_KEY = "bcid.shared.presentation";
export const PENDING_KEY = "bcid.pending.nonce";
