import { escapeHTML } from './utils.js';
import { authSignIn, authUpdatePassword, authSendPasswordReset, authRefreshSession } from './auth.js';
import {
  isBiometricAvailable,
  isBiometricEnrolled,
  authenticateWithBiometric,
  updateBiometricToken,
  biometricLabel,
} from './biometric-auth.js';

let _loadCurrentUser, _initApp;
export function setupLogin({ loadCurrentUser, initApp }) {
  _loadCurrentUser = loadCurrentUser;
  _initApp = initApp;
}

export function renderLoginContent(html) {
  // eslint-disable-next-line no-unsanitized/property
  document.getElementById('login-content').innerHTML = html;
}

/* ── Bouton biométrique (injecté de façon asynchrone après le rendu du form) ── */
function _makeBiometricSVG() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // Icône Face ID : 4 coins + yeux + sourire
  [
    'M7 3H5a2 2 0 0 0-2 2v2',
    'M17 3h2a2 2 0 0 1 2 2v2',
    'M7 21H5a2 2 0 0 1-2-2v-2',
    'M17 21h2a2 2 0 0 0 2-2v-2',
    'M9 10h.01',
    'M15 10h.01',
    'M9 15a3.5 3.5 0 0 0 6 0',
  ].forEach((d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

function _injectBiometricButton() {
  if (!isBiometricEnrolled()) return;
  isBiometricAvailable().then((avail) => {
    if (!avail) return;
    const footer = document.querySelector('#login-content .login-footer');
    if (!footer) return;
    const sep = document.createElement('div');
    sep.className = 'biometric-separator';
    sep.appendChild(document.createTextNode('ou'));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'biometric-btn';
    btn.className = 'btn-biometric';
    btn.appendChild(_makeBiometricSVG());
    btn.appendChild(document.createTextNode(' ' + biometricLabel()));
    btn.addEventListener('click', _handleBiometricLogin);
    footer.before(sep);
    footer.before(btn);
  });
}

async function _handleBiometricLogin() {
  const btn = document.getElementById('biometric-btn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
  try {
    const storedToken = await authenticateWithBiometric();
    if (!storedToken) throw new Error('cancelled');
    const session = await authRefreshSession(storedToken);
    updateBiometricToken(session.refresh_token);
    const user = await _loadCurrentUser();
    if (!user) throw new Error('Profil introuvable — contactez un administrateur.');
    _initApp();
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
    }
    if (err?.name === 'NotAllowedError' || err?.message === 'cancelled') return;
    renderLoginScreen(err.message || "Échec de la connexion par clé d'accès.");
  }
}

export function renderLoginScreen(errorMsg = '') {
  document.getElementById('login-overlay').classList.remove('hidden');
  renderLoginContent(`
    <form class="login-form" id="login-form" novalidate>
      <input type="email" id="login-email" placeholder="Adresse email" required autocomplete="email">
      <input type="password" id="login-password" placeholder="Mot de passe" required autocomplete="current-password">
      ${errorMsg ? `<p class="login-error">${escapeHTML(errorMsg)}</p>` : ''}
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:2px;">Se connecter</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="forgot-btn">Mot de passe oublié ?</button>
    </div>
  `);
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pwd = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Connexion…';
    try {
      const session = await authSignIn(email, pwd);
      updateBiometricToken(session.refresh_token);
      const user = await _loadCurrentUser();
      if (!user) throw new Error('Profil introuvable — contactez un administrateur.');
      _initApp();
    } catch (err) {
      renderLoginScreen(err.message || 'Identifiants incorrects.');
    }
  };
  document.getElementById('forgot-btn').onclick = renderForgotPasswordScreen;
  _injectBiometricButton();
}

export function renderForgotPasswordScreen() {
  renderLoginContent(`
    <form class="login-form" id="forgot-form" novalidate>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
        Saisissez votre adresse email pour recevoir un lien de réinitialisation.
      </p>
      <input type="email" id="forgot-email" placeholder="Adresse email" required autocomplete="email">
      <p id="forgot-msg" style="font-size:12.5px;display:none;margin-bottom:8px;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Envoyer le lien</button>
    </form>
    <div class="login-footer">
      <button type="button" class="link-button" id="back-login">← Retour</button>
    </div>
  `);
  document.getElementById('forgot-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = e.target.querySelector('button[type=submit]');
    const msg = document.getElementById('forgot-msg');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
      await authSendPasswordReset(email);
      msg.textContent = 'Email envoyé ! Vérifiez votre boîte de réception.';
      msg.style.color = 'var(--color-primary)';
      msg.style.display = 'block';
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = '#B91C1C';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Envoyer le lien';
    }
  };
  document.getElementById('back-login').onclick = renderLoginScreen;
}

export function renderSetPasswordScreen(accessToken, isFirstLogin = false) {
  document.getElementById('login-overlay').classList.remove('hidden');
  renderLoginContent(`
    <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px;text-align:left;">
      ${isFirstLogin ? 'Bienvenue ! Choisissez votre mot de passe pour activer votre compte.' : 'Choisissez votre nouveau mot de passe.'}
    </p>
    <form class="login-form" id="set-pwd-form" novalidate>
      <input type="password" id="set-pwd-new" placeholder="Nouveau mot de passe (8 car. min.)" autocomplete="new-password">
      <input type="password" id="set-pwd-confirm" placeholder="Confirmer le mot de passe" autocomplete="new-password">
      <p id="set-pwd-error" class="login-error" style="display:none;"></p>
      <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;">Définir le mot de passe</button>
    </form>
  `);
  document.getElementById('set-pwd-form').onsubmit = async (e) => {
    e.preventDefault();
    const next = document.getElementById('set-pwd-new').value;
    const conf = document.getElementById('set-pwd-confirm').value;
    const errEl = document.getElementById('set-pwd-error');
    const btn = e.target.querySelector('button[type=submit]');
    if (next.length < 8) {
      errEl.textContent = 'Au moins 8 caractères.';
      errEl.style.display = 'block';
      return;
    }
    if (next !== conf) {
      errEl.textContent = 'Les mots de passe ne correspondent pas.';
      errEl.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    try {
      await authUpdatePassword(accessToken, next);
      history.replaceState(null, '', window.location.pathname);
      const user = await _loadCurrentUser();
      if (user) {
        _initApp();
      } else {
        renderLoginScreen('Mot de passe défini. Connectez-vous.');
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Définir le mot de passe';
    }
  };
}
