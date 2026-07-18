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
// Lève une exception si l'Edge Function répond avec un statut non-2xx ou en cas d'erreur réseau.
export async function pushDataToSupabase(slots){
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}save-planning`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ slots }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
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

// Retourne uniquement les signatures actives (status='signed') ou null en cas d'erreur.
// Les feuilles rejetées (status='rejected') ne sont pas visibles dans le calendrier —
// seul le dashboard en Lot 6 les affiche via une requête dédiée.
export async function fetchSignatures(){
  try{
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?status=eq.signed&select=*`, { headers: supabaseHeaders() });
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

// Toutes les lignes de monthly_signatures pour une année (signed + rejected), pour l'archive PDF.
export async function fetchSignatureArchive(year){
  try{
    const fields = 'person_id,year,month,status,signed_name,signed_at,pdf_path,rejected_at';
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?year=eq.${year}&select=${fields}`, {
      headers: supabaseHeaders(),
    });
    if(!res.ok) return null;
    return await res.json();
  }catch(e){
    console.warn('Archive PDF inaccessible (hors ligne ?).', e);
    return null;
  }
}

// Télécharge le PDF via l'EF get-signed-pdf-url (proxy service_role)
// et retourne un object URL local utilisable dans window.open.
export async function fetchSignedStorageUrl(pdfPath){
  const res = await fetch(
    `${SUPABASE_FUNCTIONS_URL}get-signed-pdf-url`,
    {
      method: 'POST',
      headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pdf_path: pdfPath }),
    });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Rejette une signature (soft-delete : status → 'rejected', conservé en historique).
// Passe par l'Edge Function reject-signature (service_role) — réservé vet/admin.
export async function apiRevokeSignature(personId, year, month){
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}reject-signature`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ person_id: personId, year, month }),
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || 'Erreur inconnue');
}
