/* ================================================================
   Authentification biométrique — WebAuthn platform authenticator
   (Face ID / Touch ID sur iOS, empreinte digitale sur Android)
   ================================================================ */

const KEY_CRED    = 'bio_cred';
const KEY_REFRESH = 'bio_refresh';
const KEY_EMAIL   = 'bio_email';

export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return 'Face ID / Touch ID';
  if (/Android/i.test(ua))     return 'Empreinte digitale';
  return 'Authentification biométrique';
}

export async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

export function isBiometricEnrolled() {
  return !!(localStorage.getItem(KEY_CRED) && localStorage.getItem(KEY_REFRESH));
}

export function getBiometricEmail() {
  return localStorage.getItem(KEY_EMAIL) || '';
}

export async function registerBiometric(email, refreshToken) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Amivet PULSE', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  });
  localStorage.setItem(KEY_CRED, btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
  localStorage.setItem(KEY_REFRESH, refreshToken);
  localStorage.setItem(KEY_EMAIL, email);
}

export function updateBiometricToken(refreshToken) {
  if (isBiometricEnrolled()) localStorage.setItem(KEY_REFRESH, refreshToken);
}

export async function authenticateWithBiometric() {
  const credId      = localStorage.getItem(KEY_CRED);
  const storedToken = localStorage.getItem(KEY_REFRESH);
  if (!credId || !storedToken) return null;

  const rawId = Uint8Array.from(atob(credId), c => c.charCodeAt(0));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: rawId.buffer, transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return assertion ? storedToken : null;
}

export function clearBiometric() {
  localStorage.removeItem(KEY_CRED);
  localStorage.removeItem(KEY_REFRESH);
  localStorage.removeItem(KEY_EMAIL);
}
