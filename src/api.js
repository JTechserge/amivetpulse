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

// Envoie UNIQUEMENT les clés modifiées vers l'Edge Function save-planning, qui les
// applique sur l'état frais du serveur. Envoyer le document entier faisait que la
// sauvegarde du dernier écrasait celle de l'autre, même sur des cases différentes.
// La RLS de planning_data bloque les PATCH directs authenticated depuis la migration 20260714.
// Lève une exception si l'Edge Function répond avec un statut non-2xx ou en cas d'erreur réseau.
export async function pushChangesToSupabase(changes) {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}save-planning`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ changes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

// Retourne les slots distants, ou null en cas d'erreur réseau.
// {} (objet vide) signifie que la base est vide → app.js doit vider le localStorage aussi.
export async function syncFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}planning_data?id=eq.singleton&select=data`, { headers: supabaseHeaders() });
    if (!res.ok) return null;
    const rows = await res.json();
    const remoteSlots = rows[0]?.data;
    if (remoteSlots === undefined) return null; // pas de ligne singleton
    return remoteSlots; // peut être {} (base vide) ou {...} (données existantes)
  } catch (e) {
    console.warn('Supabase inaccessible, données locales conservées.', e);
    return null;
  }
}

// ----------------------------------------------------------------
// Roster vétérinaire (vet_roster table)
// ----------------------------------------------------------------

// Lecture ouverte à tout compte authentifié : un ASV doit pouvoir afficher le
// calendrier vétérinaire. Retourne null en cas d'erreur → le cache local prend le relais.
export async function fetchVetRoster() {
  try {
    const res = await fetch(`${SUPABASE_URL}vet_roster?select=*&order=sort_order.asc`, {
      headers: supabaseHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Roster vétérinaire inaccessible (hors ligne ?), cache local conservé.', e);
    return null;
  }
}

// Création / mise à jour d'une ligne. La RLS réserve l'écriture à vet et admin.
export async function apiUpsertVetPerson(person) {
  const res = await fetch(`${SUPABASE_URL}vet_roster`, {
    method: 'POST',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
    }),
    body: JSON.stringify({
      id: person.id,
      name: person.name,
      short: person.short,
      initial: person.initial,
      color: person.color,
      partner: person.partner !== false,
      archived: person.archived ?? false,
      sort_order: person.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
}

// Archivage / désarchivage. On ne supprime jamais : les clés de planning
// historiques référencent le person_id et doivent rester lisibles.
export async function apiSetVetArchived(personId, archived) {
  const res = await fetch(`${SUPABASE_URL}vet_roster?id=eq.${encodeURIComponent(personId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ archived, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ----------------------------------------------------------------
// Signatures électroniques (monthly_signatures table)
// ----------------------------------------------------------------

// Retourne uniquement les signatures actives (status='signed') ou null en cas d'erreur.
// Les feuilles rejetées (status='rejected') ne sont pas visibles dans le calendrier —
// seul le dashboard en Lot 6 les affiche via une requête dédiée.
export async function fetchSignatures() {
  try {
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?status=eq.signed&select=*`, {
      headers: supabaseHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Signatures inaccessibles (hors ligne ?).', e);
    return null;
  }
}

// Crée une signature. Lance une exception en cas d'erreur HTTP.
export async function apiSignMonth(personId, year, month, signedName) {
  const res = await fetch(`${SUPABASE_URL}monthly_signatures`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ person_id: personId, year, month, signed_name: signedName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Toutes les lignes de monthly_signatures pour une année (signed + rejected), pour l'archive PDF.
export async function fetchSignatureArchive(year) {
  try {
    const fields = 'person_id,year,month,status,signed_name,signed_at,pdf_path,rejected_at';
    const res = await fetch(`${SUPABASE_URL}monthly_signatures?year=eq.${year}&select=${fields}`, {
      headers: supabaseHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Archive PDF inaccessible (hors ligne ?).', e);
    return null;
  }
}

// Télécharge le PDF via l'EF get-signed-pdf-url (proxy service_role)
// et retourne un object URL local utilisable dans window.open.
export async function fetchSignedStorageUrl(pdfPath) {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}get-signed-pdf-url`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pdf_path: pdfPath }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Rejette une signature (soft-delete : status → 'rejected', conservé en historique).
// Passe par l'Edge Function reject-signature (service_role) — réservé vet/admin.
export async function apiRevokeSignature(personId, year, month) {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}reject-signature`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ person_id: personId, year, month }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erreur inconnue');
}

// ── Signatures prévisionnel ─────────────────────────────────────────────────

export async function fetchForecastSignatures() {
  try {
    const res = await fetch(`${SUPABASE_URL}forecast_signatures?select=*`, { headers: supabaseHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Signatures prévisionnel inaccessibles (hors ligne ?).', e);
    return null;
  }
}

// Suppression directe via REST (RLS autorise vet/admin authentifiés).
export async function apiRevokeForecastSignature(personId, year) {
  const res = await fetch(
    `${SUPABASE_URL}forecast_signatures?person_id=eq.${encodeURIComponent(personId)}&year=eq.${year}`,
    { method: 'DELETE', headers: supabaseHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
