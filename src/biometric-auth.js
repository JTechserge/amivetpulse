/* ================================================================
   Connexion biométrique — WebAuthn platform authenticator
   residentKey:'discouraged' = credential non-discoverable stocké
   dans l'enclave sécurisée de l'appareil sans passer par un
   gestionnaire de mots de passe (Dashlane, iCloud Keychain…).
   Face ID sur iPhone X+, Touch ID sur autres iPhone/iPad/Mac,
   biométrie Android (empreinte / face / iris).
   ================================================================ */

const KEY_CRED_ID  = 'bio_cred_id';
const KEY_REFRESH  = 'bio_refresh';
const KEY_EMAIL    = 'bio_email';
const KEY_ENROLLED = 'bio_enrolled';

export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return 'Face ID / Touch ID';
  if (/Macintosh/i.test(ua))   return 'Touch ID';
  if (/Android/i.test(ua))     return 'Empreinte digitale';
  return 'Connexion biométrique';
}

export async function isBiometricAvailable() {
  try {
    return !!(window.PublicKeyCredential &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export function isBiometricEnrolled() {
  return !!(localStorage.getItem(KEY_ENROLLED) && localStorage.getItem(KEY_REFRESH));
}

export function getBiometricEmail() {
  return localStorage.getItem(KEY_EMAIL) || '';
}

function _randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

function _b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _fromB64url(s) {
  return Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );
}

export async function registerBiometric(email, refreshToken) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: _randomBytes(32),
      rp: { name: 'Amivet Pulse', id: location.hostname },
      user: { id: _randomBytes(16), name: email, displayName: email },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7   }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',       // évite gestionnaires de mots de passe
        requireResidentKey: false,
      },
      timeout: 60000,
    },
  });

  localStorage.setItem(KEY_CRED_ID,  _b64url(credential.rawId));
  localStorage.setItem(KEY_ENROLLED, '1');
  localStorage.setItem(KEY_REFRESH,  refreshToken);
  localStorage.setItem(KEY_EMAIL,    email);
}

export function updateBiometricToken(refreshToken) {
  if (isBiometricEnrolled()) localStorage.setItem(KEY_REFRESH, refreshToken);
}

export async function authenticateWithBiometric() {
  const credIdB64 = localStorage.getItem(KEY_CRED_ID);
  const storedToken = localStorage.getItem(KEY_REFRESH);
  if (!localStorage.getItem(KEY_ENROLLED) || !storedToken) return null;

  const allowCredentials = credIdB64 ? [{
    type: 'public-key',
    id: _fromB64url(credIdB64),
    transports: ['internal'],
  }] : [];

  await navigator.credentials.get({
    publicKey: {
      challenge: _randomBytes(32),
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    },
  });

  return storedToken;
}

export function clearBiometric() {
  [KEY_ENROLLED, KEY_REFRESH, KEY_EMAIL, KEY_CRED_ID, 'bio_cred'].forEach(k =>
    localStorage.removeItem(k)
  );
}
