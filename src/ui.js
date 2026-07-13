/* ================================================================
   AMIVET PLANNING — Composants UI génériques (DOM seulement)
   Pas de dépendance sur l'état global ou le réseau.
   Importé par app.js.
   ================================================================ */
import { allPeople, PERSON_COLORS_KEY } from './config.js';

// ----------------------------------------------------------------
// Toasts
// ----------------------------------------------------------------
export function showToast(message, icon='✓'){
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(()=> el.remove(), 15000);
}
export function showSavedToast(){ showToast('Sauvegardé'); }

// ----------------------------------------------------------------
// Modale de confirmation générique
// ----------------------------------------------------------------
export function openConfirmModal({title, message, confirmLabel='Confirmer', danger=true, onConfirm}){
  const backdrop = document.getElementById('modal-backdrop');
  const box = document.getElementById('modal-box');
  box.className = 'modal-box';
  box.innerHTML = `
    <h3>${title}</h3>
    <p>${message}</p>
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
