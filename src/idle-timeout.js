/* ================================================================
   Déconnexion automatique après inactivité.
   Appeler setupIdleTimeout({ onTimeout, timeoutMs }) une seule fois.
   Le callback onTimeout doit vérifier lui-même si la session est active.
   ================================================================ */

const IDLE_EVENTS = ['mousemove', 'click', 'keydown', 'touchstart', 'scroll', 'pointerdown'];

export function setupIdleTimeout({ onTimeout, timeoutMs }) {
  let timer = null;

  function reset() {
    clearTimeout(timer);
    timer = setTimeout(onTimeout, timeoutMs);
  }

  IDLE_EVENTS.forEach(evt => window.addEventListener(evt, reset, { passive: true, capture: true }));
  reset();
}
