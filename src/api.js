/* ================================================================
   AMIVET PLANNING — Couche API Supabase REST
   Fonctions data-in / data-out : retournent les données brutes.
   Les mutations d'état (DATA, SIGNATURES, renderCurrentView) restent dans app.js.
   ================================================================ */
import { SUPABASE_URL, SUPABASE_FUNCTIONS_URL } from './config.js';
import { supabaseHeaders } from './auth.js';

// ----------------------------------------------------------------
// Planning data (planning_data table — singleton JSON)
// ----------------------------------------------------------------

// Envoie les slots vers l'Edge Function save-planning (vérification des droits côté serveur).
// La RLS de planning_data bloque les PATCH directs authenticated depuis la migration 20260714.
// Fire-and-forget : les erreurs ne bloquent pas l'UI.
export function pushDataToSupabase(slots){
  fetch(`${SUPABASE_FUNCTIONS_URL}save-planning`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ slots }),
  }).catch(e=> console.warn('Synchronisation Supabase impossible (hors ligne ?), données conservées en local.', e));
}

// Retourne les slots distants, ou null en cas d'erreur réseau.
// {} (objet vide) signifie que la base est vide → app.js doit vider le localStorage aussi.
export async function syncFromSupabase(){
  try{
    const res = await fetch(`${SUPABASE_URL}planning_data?id=eq.singleton&select=data`, { headers: supabaseHeaders() });
    if(!res.ok) return null;
    const rows = await res.json();
    const remoteSlots = rows[0]?.data;
    if(remoteSlots === undefined) return null; // pas de ligne singleton
    return remoteSlots; // peut être {} (base vide) ou {...} (données existantes)
  }catch(e){
    console.warn('Supabase inaccessible, données locales conservées.', e);
    return null;
  }
}

// ----------------------------------------------------------------
// Signatures électroniques (monthly_signatures table)
// ----------------------------------------------------------------

// Retourne les lignes brutes ou null en cas d'erreur.
export async function fetchSignatures(){
  try{
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?select=*`, { headers: supabaseHeaders() });
    if(!res.ok) return null;
    return await res.json();
  }catch(e){
    console.warn('Signatures inaccessibles (hors ligne ?).', e);
    return null;
  }
}

// Crée une signature. Lance une exception en cas d'erreur HTTP.
export async function apiSignMonth(personId, year, month, signedName){
  const res = await fetch(`${SUPABASE_URL}monthly_signatures`, {
    method:'POST',
    headers: supabaseHeaders({ 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
    body: JSON.stringify({ person_id:personId, year, month, signed_name:signedName }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Supprime une signature. Lance une exception en cas d'erreur HTTP.
export async function apiRevokeSignature(personId, year, month){
  const res = await fetch(`${SUPABASE_URL}monthly_signatures?person_id=eq.${encodeURIComponent(personId)}&year=eq.${year}&month=eq.${month}`, {
    method:'DELETE',
    headers: supabaseHeaders({ Prefer:'return=minimal' }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
}
