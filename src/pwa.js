import { SUPABASE_URL, SUPABASE_FUNCTIONS_URL } from './config.js';
import { supabaseHeaders } from './auth.js';
import { store } from './store.js';
import { showToast } from './ui.js';

// Clé PUBLIQUE VAPID uniquement — la clé privée ne vit que dans les secrets Supabase
// (VAPID_PRIVATE_KEY), jamais ici.
const VAPID_PUBLIC_KEY = 'BD8PsjUf5CnogfRdI81PvKKHT9C7OGV7tqPQ29Ic8kkcarkqyFRa-YbUQam_OHI8xZWnz1rzkFhicB_UMb5CMHI';
const PWA_PROMPT_INTERVAL_DAYS = 14;
const PWA_IOS_PROMPT_KEY = 'pwa_ios_prompt_ts';
const PWA_ANDROID_PROMPT_KEY = 'pwa_android_prompt_ts';

export const PWA = {
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent); },
  isInstalled() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; },
  supportsPush() { return 'PushManager' in window && 'serviceWorker' in navigator; },
};

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/* ---------- Service Worker : enregistrement + bandeau de mise à jour ---------- */
let swRegistration = null;

export function showPwaUpdateBanner() {
  const banner = document.getElementById('pwa-update-banner');
  if (!banner) return;
  banner.innerHTML = `Mise à jour disponible <button id="pwa-reload-btn">Recharger</button>`;
  banner.style.display = 'block';
  banner.querySelector('#pwa-reload-btn').onclick = () => window.location.reload();
}

export function initServiceWorker(onNotificationClick) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    swRegistration = reg;
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showPwaUpdateBanner();
        }
      });
    });
  }).catch((err) => console.warn('Échec enregistrement Service Worker', err));

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'pwa-notification-click') {
      onNotificationClick?.(event.data.notificationType);
    }
  });
}

/* ---------- Bandeau d'installation iOS ---------- */
function shouldShowInstallPrompt(key) {
  const last = parseInt(localStorage.getItem(key), 10);
  if (!Number.isFinite(last)) return true;
  return (Date.now() - last) / 86400000 >= PWA_PROMPT_INTERVAL_DAYS;
}
function markInstallPromptShown(key) { localStorage.setItem(key, String(Date.now())); }

export function showIOSInstallTip() {
  if (!PWA.isIOS() || PWA.isInstalled()) return;
  if (!shouldShowInstallPrompt(PWA_IOS_PROMPT_KEY)) return;
  const tip = document.getElementById('pwa-ios-install-tip');
  if (!tip) return;
  tip.innerHTML = `
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Appuyez sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong> pour installer l'app et activer les notifications.
  `;
  tip.style.display = 'block';
  tip.querySelector('.pwa-tip-close').onclick = () => {
    tip.style.display = 'none';
    markInstallPromptShown(PWA_IOS_PROMPT_KEY);
  };
}

/* ---------- Bandeau d'installation Android ---------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!shouldShowInstallPrompt(PWA_ANDROID_PROMPT_KEY)) return;
  const banner = document.getElementById('pwa-android-install-banner');
  if (!banner) return;
  banner.innerHTML = `
    <button class="pwa-tip-close" aria-label="Fermer">✕</button>
    <strong>Installez Amivet RH</strong><br>
    Ajoutez l'app à votre écran d'accueil pour un accès rapide et les notifications.
    <div><button id="pwa-android-install-btn">Installer l'app</button></div>
  `;
  banner.style.display = 'block';
  banner.querySelector('.pwa-tip-close').onclick = () => {
    banner.style.display = 'none';
    markInstallPromptShown(PWA_ANDROID_PROMPT_KEY);
  };
  banner.querySelector('#pwa-android-install-btn').onclick = async () => {
    banner.style.display = 'none';
    markInstallPromptShown(PWA_ANDROID_PROMPT_KEY);
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
  };
});

/* ---------- Indicateur hors-ligne ---------- */
export function updatePwaOfflineBanner() {
  const banner = document.getElementById('pwa-offline-banner');
  if (!banner) return;
  banner.textContent = 'Mode hors-ligne — données du dernier chargement';
  banner.style.display = navigator.onLine ? 'none' : 'block';
}

/* ---------- Abonnement push ---------- */
export function currentPushPersonId() { return store.currentUser?.person_id || null; }

export async function savePushSubscription(sub) {
  const user_name = currentPushPersonId();
  if (!user_name) return;
  await fetch(`${SUPABASE_URL}push_subscriptions`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      user_name,
      subscription_json: sub.toJSON(),
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function deletePushSubscription() {
  const user_name = currentPushPersonId();
  if (!user_name) return;
  await fetch(`${SUPABASE_URL}push_subscriptions?user_name=eq.${encodeURIComponent(user_name)}`, {
    method: 'DELETE',
    headers: supabaseHeaders(),
  });
}

export async function subscribeToPush() {
  if (!PWA.supportsPush()) throw new Error('Notifications non supportées sur cet appareil.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission refusée.');
  const reg = swRegistration || await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await savePushSubscription(sub);
  return sub;
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = swRegistration || await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await deletePushSubscription();
}

// Envoi fire-and-forget vers l'Edge Function : ne bloque jamais l'UI.
export function triggerPushNotification({ type, title, body, targetUsers = [], data = {}, requireInteraction = false }) {
  fetch(`${SUPABASE_FUNCTIONS_URL}push-server`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ type, title, body, targetUsers, data, requireInteraction }),
  }).catch((e) => console.warn('Envoi notification push impossible (ignoré)', e));
}

/* ---------- Section "Notifications" du menu réglages ---------- */
export function notificationStatusLabel() {
  if (!PWA.supportsPush()) return { text: 'Non disponible sur cet appareil', tone: 'muted' };
  if (PWA.isIOS() && !PWA.isInstalled()) return { text: 'Installez l\'app pour activer les notifications', tone: 'muted' };
  if (Notification.permission === 'granted') return { text: 'Activées', tone: 'ok' };
  if (Notification.permission === 'denied') return { text: 'Bloquées', tone: 'danger' };
  return { text: 'Non configurées', tone: 'muted' };
}

export async function openNotificationSettingsModal() {
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';

  const renderBody = () => {
    const status = notificationStatusLabel();
    const isIOSNotInstalled = PWA.isIOS() && !PWA.isInstalled();
    const isBlocked = Notification.permission === 'denied';
    const canOffer = PWA.supportsPush() && !isIOSNotInstalled && Notification.permission !== 'granted';
    box.innerHTML = `
      <h3>🔔 Notifications</h3>
      <p>Statut actuel : <strong>${status.text}</strong></p>
      ${isIOSNotInstalled ? `<p class="text-muted" style="font-size:12.5px;">Sur iPhone/iPad, les notifications ne fonctionnent que si l'app est installée : Partager → Sur l'écran d'accueil.</p>` : ''}
      ${isBlocked ? `<p class="text-muted" style="font-size:12.5px;">Les notifications sont bloquées par le navigateur. Autorisez-les dans Réglages &gt; Safari &gt; Amivet RH (ou l'équivalent sur votre navigateur), puis revenez ici.</p>` : ''}
      ${canOffer ? `<button class="btn btn-primary" id="notif-enable-btn" style="width:100%;justify-content:center;margin-top:10px;">Activer les notifications</button>` : ''}
      ${status.tone === 'ok' ? `<button class="btn" id="notif-disable-btn" style="width:100%;justify-content:center;margin-top:10px;">Désactiver les notifications</button>` : ''}
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn" id="modal-cancel">Fermer</button>
      </div>
    `;
    const enableBtn = box.querySelector('#notif-enable-btn');
    if (enableBtn) enableBtn.onclick = async () => {
      enableBtn.disabled = true; enableBtn.textContent = 'Activation…';
      try {
        await subscribeToPush();
        showToast('Notifications activées', '🔔');
        renderBody();
      } catch (e) {
        // iOS 17.4+ (UE, DMA) supprime le mode standalone : la souscription échoue
        // silencieusement côté OS — on l'explique plutôt que de laisser une erreur brute.
        showToast(e.message || 'Impossible d\'activer les notifications sur cet appareil', '⚠️');
        renderBody();
      }
    };
    const disableBtn = box.querySelector('#notif-disable-btn');
    if (disableBtn) disableBtn.onclick = async () => {
      disableBtn.disabled = true;
      await unsubscribeFromPush();
      showToast('Notifications désactivées', '🔕');
      renderBody();
    };
    box.querySelector('#modal-cancel').onclick = () => backdrop.classList.remove('open');
  };
  renderBody();
  backdrop.classList.add('open');
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.classList.remove('open'); };
}
