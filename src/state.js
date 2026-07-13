/* ================================================================
   AMIVET PLANNING — Gestion d'état localStorage (sans DOM)
   Roster ASV + couleurs : localStorage uniquement, aucun appel DOM/réseau.
   Importé par app.js.
   ================================================================ */
import { ASV_PEOPLE, PRESENT_SHADES, ASV_ROSTER_KEY, PERSON_COLORS_KEY, allPeople } from './config.js';

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
// Couleurs personnalisables (écriture localStorage uniquement)
// L'application des CSS vars (applyPersonColorVars) reste dans app.js (besoin du DOM).
// ----------------------------------------------------------------
export function savePersonColors(){
  const colors = {};
  allPeople().forEach(p=> colors[p.id] = p.color);
  localStorage.setItem(PERSON_COLORS_KEY, JSON.stringify(colors));
}
