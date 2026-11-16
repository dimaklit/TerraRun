const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function importKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function createPkcePair() {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  return { verifier, challenge };
}

// The OAuth state carries the user and PKCE verifier, so it is encrypted and expires quickly.
export async function sealState(payload, secret, now = Date.now()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = encoder.encode(JSON.stringify({ ...payload, exp: now + 10 * 60_000 }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(secret), body));
  return `${toBase64Url(iv)}.${toBase64Url(cipher)}`;
}

export async function openState(state, secret, now = Date.now()) {
  const [iv, cipher] = String(state).split('.');
  if (!iv || !cipher) throw new Error('Invalid state.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await importKey(secret), fromBase64Url(cipher));
  const payload = JSON.parse(decoder.decode(plain));
  if (!(payload.exp > now)) throw new Error('State expired.');
  return payload;
}
