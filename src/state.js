/* ================================================================
   AMIVET PLANNING — Gestion d'état localStorage (sans DOM)
   Roster ASV + couleurs : localStorage uniquement, aucun appel DOM/réseau.
   Importé par app.js.
   ================================================================ */
import {
  ASV_PEOPLE,
  PEOPLE,
  PRESENT_SHADES,
  ASV_ROSTER_KEY,
  VET_ROSTER_KEY,
  PERSON_COLORS_KEY,
  allPeople,
} from './config.js';

// ----------------------------------------------------------------
// Roster ASV dynamique
// ----------------------------------------------------------------

// Réattribue les nuances de vert "présent" par position (à appeler après tout ajout/retrait).
export function reindexPresentShades(){
  ASV_PEOPLE.forEach((p,i)=> p.present = PRESENT_SHADES[i % PRESENT_SHADES.length]);
}

export function saveASVRoster(){
  localStorage.setItem(ASV_ROSTER_KEY, JSON.stringify(
    ASV_PEOPLE.map(p=>({
      id:p.id, name:p.name, short:p.short, initial:p.initial, color:p.color,
      timeFraction:p.timeFraction ?? 1.0,
      archived:p.archived ?? false,
      saturdayOnly:p.saturdayOnly ?? false,
      workingDays:p.workingDays ?? null,
      ...(p.lastName ? { lastName:p.lastName } : {}),
    }))
  ));
}

export function loadASVRoster(){
  try{
    const raw = localStorage.getItem(ASV_ROSTER_KEY);
    if(raw){
      const saved = JSON.parse(raw);
      if(Array.isArray(saved) && saved.length){
        ASV_PEOPLE.length = 0;
        saved.forEach(p=> ASV_PEOPLE.push({
          id:p.id, name:p.name, short:p.short, initial:p.initial, color:p.color, present:null,
          timeFraction:p.timeFraction ?? 1.0,
          archived:p.archived ?? false,
          saturdayOnly:p.saturdayOnly ?? false,
          workingDays:p.workingDays ?? null,
          ...(p.lastName ? { lastName:p.lastName } : {}),
        }));
        // Fusionner Carla si absente des données sauvegardées (migration)
        if(!ASV_PEOPLE.find(p=>p.id==='carla')){
          ASV_PEOPLE.push({ id:'carla', name:'Carla', short:'Carla', color:'#0EA5E9', initial:'Ca', present:null, timeFraction:7.25/35, saturdayOnly:true });
          saveASVRoster();
        }
      }
    }else{
      // Premier lancement : persister l'effectif par défaut
      saveASVRoster();
    }
  }catch(e){ console.warn('Effectif ASV personnalisé illisible, valeurs par défaut conservées.', e); }
  reindexPresentShades();
}

export function archiveASVPerson(id){
  const p = ASV_PEOPLE.find(x=>x.id===id);
  if(!p) return;
  p.archived = true;
  reindexPresentShades();
  saveASVRoster();
}

export function unarchiveASVPerson(id){
  const p = ASV_PEOPLE.find(x=>x.id===id);
  if(!p) return;
  p.archived = false;
  reindexPresentShades();
  saveASVRoster();
}

// ----------------------------------------------------------------
// Roster vétérinaire dynamique
// ----------------------------------------------------------------
// Contrairement au roster ASV (localStorage seul, donc par appareil), la source
// de vérité est la table partagée `vet_roster` : un vétérinaire salarié ajouté
// depuis un poste doit être visible de tous, à commencer par lui-même.
// localStorage ne sert que de cache d'amorçage / mode hors connexion.

export function reindexVetPresentShades() {
  PEOPLE.forEach((p, i) => (p.present = PRESENT_SHADES[i % PRESENT_SHADES.length]));
}

/** Forme sérialisable d'une personne du roster vétérinaire. */
function vetToCacheEntry(p) {
  return {
    id: p.id,
    name: p.name,
    short: p.short,
    initial: p.initial,
    color: p.color,
    partner: p.partner !== false,
    archived: p.archived ?? false,
    sortOrder: p.sortOrder ?? 0,
  };
}

export function saveVetRosterCache() {
  localStorage.setItem(VET_ROSTER_KEY, JSON.stringify(PEOPLE.map(vetToCacheEntry)));
}

/** Remplace PEOPLE en place à partir d'entrées déjà normalisées. */
function replaceVetPeople(entries) {
  PEOPLE.length = 0;
  entries.forEach((p) =>
    PEOPLE.push({
      id: p.id,
      name: p.name,
      short: p.short,
      initial: p.initial,
      color: p.color,
      present: null,
      // Défaut sûr : une entrée sans `partner` explicite est traitée comme
      // associée, donc sans workflow de validation (comportement historique).
      partner: p.partner !== false,
      archived: p.archived ?? false,
      sortOrder: p.sortOrder ?? 0,
    })
  );
  PEOPLE.sort((a, b) => a.sortOrder - b.sortOrder);
  reindexVetPresentShades();
}

/** Charge le cache local. Sans cache, l'effectif par défaut de config.js est conservé. */
export function loadVetRosterCache() {
  try {
    const raw = localStorage.getItem(VET_ROSTER_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length) replaceVetPeople(saved);
    } else {
      saveVetRosterCache();
    }
  } catch (e) {
    console.warn('Effectif vétérinaire en cache illisible, valeurs par défaut conservées.', e);
  }
  reindexVetPresentShades();
}

/**
 * Applique les lignes de la table `vet_roster` (snake_case) sur PEOPLE, puis
 * rafraîchit le cache. Ignore un jeu de lignes vide : mieux vaut garder
 * l'effectif courant que vider le calendrier sur une réponse incomplète.
 */
export function applyVetRosterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  replaceVetPeople(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      short: r.short,
      initial: r.initial,
      color: r.color,
      partner: r.partner !== false,
      archived: r.archived ?? false,
      sortOrder: r.sort_order ?? 0,
    }))
  );
  saveVetRosterCache();
  return true;
}

// ----------------------------------------------------------------
// Couleurs personnalisables (écriture localStorage uniquement)
// L'application des CSS vars (applyPersonColorVars) reste dans app.js (besoin du DOM).
// ----------------------------------------------------------------
export function savePersonColors(){
  const colors = {};
  allPeople().forEach(p=> colors[p.id] = p.color);
  localStorage.setItem(PERSON_COLORS_KEY, JSON.stringify(colors));
}
