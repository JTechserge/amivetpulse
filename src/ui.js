/* ================================================================
   AMIVET PLANNING — Composants UI génériques (DOM seulement)
   Pas de dépendance sur l'état global ou le réseau.
   Importé par app.js.
   ================================================================ */
import { allPeople, PERSON_COLORS_KEY } from './config.js';

// ----------------------------------------------------------------
// Toasts — utilise textContent pour les arguments afin d'éviter
// toute injection XSS via e.message ou réponses réseau.
// ----------------------------------------------------------------
export function showToast(message, icon='✓'){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  const iconSpan = document.createElement('span');
  const msgSpan  = document.createElement('span');
  iconSpan.textContent = icon;
  msgSpan.textContent  = message;
  el.appendChild(iconSpan);
  el.appendChild(msgSpan);
  container.appendChild(el);
  setTimeout(()=> el.remove(), 15000);
}
export function showSavedToast(){ showToast('Sauvegardé'); }

// ----------------------------------------------------------------
// Modale de confirmation — arguments injectés via textContent (safe).
// Pour les rares modales dont le contenu est un template HTML interne
// constant (sans donnée utilisateur), utiliser openConfirmModalHtml.
// ----------------------------------------------------------------
export function openConfirmModal({title, message, confirmLabel='Confirmer', danger=true, onConfirm}){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // Structure sûre : pas de donnée utilisateur dans ce template.
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3></h3>
    <p></p>
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="modal-confirm"></button>
    </div>
  `;
  // Injection via textContent : XSS-proof quels que soient les arguments.
  box.querySelector('h3').textContent          = title;
  box.querySelector('p').textContent           = message;
  box.querySelector('#modal-confirm').textContent = confirmLabel;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#modal-confirm').onclick = ()=>{ onConfirm(); close(); };
  backdrop.onclick = (e)=>{ if(e.target === backdrop) close(); };
}

// Variante réservée aux templates HTML internes constants (pas de donnée utilisateur).
// Ne JAMAIS passer de contenu réseau, e.message ou donnée saisie par l'utilisateur.
export function openConfirmModalHtml({titleHtml, messageHtml, confirmLabel='Confirmer', danger=true, onConfirm}){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  // eslint-disable-next-line no-unsanitized/property
  box.innerHTML = `
    <h3>${titleHtml}</h3>
    ${messageHtml}
    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Annuler</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'}" id="modal-confirm">${confirmLabel}</button>
    </div>
  `;
  backdrop.classList.add('open');
  const close = ()=> backdrop.classList.remove('open');
  box.querySelector('#modal-cancel').onclick = close;
  box.querySelector('#modal-confirm').onclick = ()=>{ onConfirm(); close(); };
  backdrop.onclick = (e)=>{ if(e.target === backdrop) close(); };
}

// ----------------------------------------------------------------
// Couleurs CSS des personnes
// ----------------------------------------------------------------
export function applyPersonColorVars(){
  allPeople().forEach(p=> document.documentElement.style.setProperty(`--color-${p.id}`, p.color));
}

export function loadPersonColors(){
  try{
    const raw = localStorage.getItem(PERSON_COLORS_KEY);
    if(raw){
      const colors = JSON.parse(raw);
      allPeople().forEach(p=>{ if(colors[p.id]) p.color = colors[p.id]; });
    }
  }catch(e){ console.warn('Couleurs personnalisées illisibles, valeurs par défaut conservées.', e); }
  applyPersonColorVars();
}
