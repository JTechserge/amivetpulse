/* ================================================================
   Connexion rapide — token stocké en localStorage
   WebAuthn retiré : il passait par Dashlane / iCloud Keychain,
   rendant la UX confuse (prompt gestionnaire de mots de passe
   au lieu d'un prompt Face ID natif).
   Modèle de sécurité : "seul l'appareil physique connaît le token".
   ================================================================ */

const KEY_REFRESH  = 'bio_refresh';
const KEY_EMAIL    = 'bio_email';
const KEY_ENROLLED = 'bio_enrolled';

export function biometricLabel() {
  return 'Connexion rapide';
}

export async function isBiometricAvailable() {
  return typeof Storage !== 'undefined';
}

export function isBiometricEnrolled() {
  return !!(localStorage.getItem(KEY_ENROLLED) && localStorage.getItem(KEY_REFRESH));
}

export function getBiometricEmail() {
  return localStorage.getItem(KEY_EMAIL) || '';
}

export async function registerBiometric(email, refreshToken) {
  localStorage.setItem(KEY_ENROLLED, '1');
  localStorage.setItem(KEY_REFRESH, refreshToken);
  localStorage.setItem(KEY_EMAIL, email);
}

export function updateBiometricToken(refreshToken) {
  if (isBiometricEnrolled()) localStorage.setItem(KEY_REFRESH, refreshToken);
}

export async function authenticateWithBiometric() {
  const storedToken = localStorage.getItem(KEY_REFRESH);
  if (!storedToken || !localStorage.getItem(KEY_ENROLLED)) return null;
  return storedToken;
}

export function clearBiometric() {
  localStorage.removeItem(KEY_ENROLLED);
  localStorage.removeItem(KEY_REFRESH);
  localStorage.removeItem(KEY_EMAIL);
  localStorage.removeItem('bio_cred'); // ancienne clé WebAuthn
}
