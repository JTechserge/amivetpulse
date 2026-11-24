// Horloge simulée — OUTIL DE DÉVELOPPEMENT, absent du build de production
// (import.meta.env.DEV vaut false au build : tout le corps est éliminé).
//
// Usage, sur http://localhost:5173/amivetpulse/ :
//   ?today=2027-01-15   fait croire à toute l'appli qu'on est le 15/01/2027
//                       (l'heure continue de tourner). Retenu au rechargement.
//   ?today=off          revient à la vraie date.
//
// Le front local parle à la VRAIE base Supabase. Tant que l'horloge est simulée,
// toute écriture (requête autre que GET/HEAD, hors authentification) est bloquée
// comme une panne réseau : l'appli garde la modification en local et ne l'envoie
// pas. À la sortie (?today=off), le cache local du planning est purgé pour que
// ces modifications fictives ne partent jamais vers la base.

import { STORAGE_KEY, SYNC_BASELINE_KEY } from './config.js';

const KEY = 'amivet_dev_today';

if (import.meta.env.DEV) {
  const param = new URLSearchParams(location.search).get('today');
  if (param === 'off') {
    if (localStorage.getItem(KEY)) {
      localStorage.removeItem(KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SYNC_BASELINE_KEY);
    }
  } else if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    localStorage.setItem(KEY, param);
  }

  const fakeToday = localStorage.getItem(KEY);
  if (fakeToday) {
    const RealDate = Date;
    const offset = new RealDate(`${fakeToday}T10:00:00`).getTime() - RealDate.now();
    class SimulatedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offset);
        else super(...args);
      }
      static now() {
        return RealDate.now() + offset;
      }
    }
    globalThis.Date = SimulatedDate;

    const realFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (method !== 'GET' && method !== 'HEAD' && !url.includes('/auth/v1/')) {
        console.warn(`[horloge simulée] écriture bloquée : ${method} ${url}`);
        return Promise.reject(new TypeError('Écriture bloquée : horloge simulée'));
      }
      return realFetch(input, init);
    };

    const showBanner = () => {
      const el = document.createElement('div');
      el.textContent = `🕒 Horloge simulée : ${fakeToday.split('-').reverse().join('/')} — écritures vers la base bloquées. Sortir : ?today=off`;
      el.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#B91C1C;color:#fff;font:600 13px system-ui;padding:6px 12px;text-align:center;';
      document.body.appendChild(el);
    };
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner);
  }
}
