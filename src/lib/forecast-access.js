// Droits sur une fiche du prévisionnel annuel ASV (page 🐾 ASV > 🔮 Prévisionnel).
//
// Toutes les fiches sont visibles de tous. La modification suit la même règle
// que le planning (canEditSlot, src/app.js) : une ASV ne modifie que sa propre
// fiche, sauf droit « modifier toutes les lignes ASV ». Le serveur applique la
// même limite (validateAsvWrite, planning-auth.js, clés forecast_<pid>_…) ;
// l'interface ne fait que ne pas proposer ce qu'il refuserait.

/**
 * @param {object} p
 * @param {boolean} p.canEditPerson  canEditSlot(pid) pour l'utilisateur courant
 * @param {boolean} p.signed         fiche déjà signée pour l'année
 * @param {string|null|undefined} p.role  rôle réel (store.currentUser.role)
 * @returns {{ readOnly: boolean, consultOnly: boolean, canRequestSignature: boolean, canUnsign: boolean }}
 */
export function forecastAccess({ canEditPerson, signed, role }) {
  const manager = role === 'vet' || role === 'admin';
  return {
    // Une fiche signée est figée pour tout le monde ; sinon, seul qui peut
    // modifier la ligne de cette personne peut modifier sa fiche.
    readOnly: signed || !canEditPerson,
    // Fiche d'une collègue : l'écran le dit, plutôt que de laisser des
    // commandes grisées sans explication.
    consultOnly: !canEditPerson,
    // request-forecast-signature est réservée aux associés et à l'admin.
    canRequestSignature: manager && !signed,
    canUnsign: manager,
  };
}

/**
 * Fiche ouverte par défaut : la première qu'on peut modifier (pour une ASV, la
 * sienne), à défaut la première ASV active.
 * @param {Array<{id:string, archived?:boolean}>} people
 * @param {(pid:string) => boolean} canEditPerson
 */
export function defaultForecastPid(people, canEditPerson) {
  const active = people.filter((p) => !p.archived);
  return (active.find((p) => canEditPerson(p.id)) || active[0] || people[0])?.id;
}
