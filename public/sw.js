// Amivet Pulse RH — Service Worker
// Incrémenter CACHE_VERSION à chaque déploiement : Safari purge le SW après 7 jours
// sans visite, donc un iOS qui revient après une coupure doit retrouver une version
// fraîche plutôt qu'un cache figé indéfiniment.
const CACHE_VERSION = 'amivet-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const PRECACHE_URLS = [
  './amivet-pulse.html',
  './manifest.json',
  './logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('.supabase.co');
}

function isAuthRequest(url) {
  return url.pathname.includes('/auth/');
}

// Google Fonts n'est plus utilisé (Inter auto-hébergé depuis Lot 4).
function isGoogleFontsRequest(_url) { return false; }

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      if (isSupabaseRequest(new URL(request.url))) {
        const headers = new Headers(cached.headers);
        headers.set('X-From-Cache', 'true');
        return new Response(await cached.clone().blob(), {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
      return cached;
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ne jamais mettre en cache les requêtes d'authentification Supabase.
  if (isSupabaseRequest(url) && isAuthRequest(url)) {
    return;
  }

  if (url.pathname.endsWith('/amivet-pulse.html') || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  if (isSupabaseRequest(url)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  if (isGoogleFontsRequest(url) || request.destination === 'style' || request.destination === 'image' || url.pathname.endsWith('manifest.json')) {
    event.respondWith(cacheFirst(request, url.origin === self.location.origin ? STATIC_CACHE : DYNAMIC_CACHE));
    return;
  }
});

// Message du client : purger le DYNAMIC_CACHE au logout pour que les données
// RH (planning_data) ne soient plus lisibles depuis le cache après déconnexion.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PURGE_DYNAMIC_CACHE') {
    event.waitUntil(caches.delete(DYNAMIC_CACHE));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }

  const title = payload.title || 'Amivet Pulse RH';
  const options = {
    body: payload.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    requireInteraction: !!payload.requireInteraction,
    tag: payload.data && payload.data.type ? payload.data.type : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

function urlForNotificationType(type) {
  switch (type) {
    case 'leave_request':
    case 'leave_approved':
    case 'leave_rejected':
      return './amivet-pulse.html?action=dashboard-requests';
    case 'medical_visit':
      return './amivet-pulse.html?action=dashboard-medical';
    case 'interview':
      return './amivet-pulse.html?action=dashboard-interviews';
    case 'announcement':
      return './amivet-pulse.html?action=announcements';
    default:
      return './amivet-pulse.html';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const type = event.notification.data && event.notification.data.type;
  const targetUrl = new URL(urlForNotificationType(type), self.location.href).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'pwa-notification-click', notificationType: type });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
