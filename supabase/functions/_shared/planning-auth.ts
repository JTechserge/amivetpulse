// Logique d'autorisation pour les écritures de planning_data — runtime Deno.
// Miroir TypeScript de src/lib/planning-auth.js (même logique, même règles).
// Tout changement dans l'un doit être répercuté dans l'autre.

export type SlotsRecord = Record<string, unknown>;

export interface ChangedKey {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface UserProfile {
  role: string;
  can_edit_vet_calendar: boolean;
  can_edit_all_asv: boolean;
  can_edit_asv_calendar?: boolean;
  person_id: string | null;
}

/**
 * Extrait le person_id d'une clé de planning.
 * Formats reconnus :
 *  - "YYYY-MM-DD_<personId>[_suffixe]" (format classique)
 *  - "forecast_<personId>_<YYYY-MM-DD>"  (clé prévisionnel hebdo)
 *  - "forecast_sig_<personId>_<year>"    (clé signature prévisionnel)
 * Contrainte : les person_id ne doivent jamais contenir `_` (voir config.js côté front).
 */
export function extractPersonIdFromKey(key: string): string | null {
  if (!key) return null;
  // Format forecast_<pid>_YYYY-MM-DD ou forecast_sig_<pid>_<year>
  const fm = key.match(/^forecast(?:_sig)?_([^_]+)_/);
  if (fm) return fm[1];
  // Format date classique YYYY-MM-DD_<pid>_...
  const dm = key.match(/^\d{4}-\d{2}-\d{2}_([^_]+)/);
  return dm ? dm[1] : null;
}

/** Renvoie les clés dont la valeur diffère entre deux états. */
export function findChangedKeys(oldSlots: SlotsRecord, newSlots: SlotsRecord): ChangedKey[] {
  const old_ = oldSlots ?? {};
  const new_ = newSlots ?? {};
  const allKeys = new Set([...Object.keys(old_), ...Object.keys(new_)]);
  const changed: ChangedKey[] = [];
  for (const key of allKeys) {
    if (old_[key] !== new_[key]) {
      changed.push({ key, oldValue: old_[key], newValue: new_[key] });
    }
  }
  return changed;
}

/** Renvoie true si le profil a accès complet en écriture. */
export function hasFullAccess(profile: UserProfile): boolean {
  // Le vétérinaire salarié n'a JAMAIS l'accès complet : il passe toujours par
  // validateVetEmployeWrite. Test placé avant les flags, sinon un
  // can_edit_vet_calendar posé par erreur sur son profil lui ouvrirait l'ASV.
  if (profile.role === 'vet_employe') return false;
  return (
    profile.role === 'admin' ||
    profile.role === 'vet' ||
    profile.can_edit_vet_calendar === true ||
    profile.can_edit_all_asv === true
  );
}

/**
 * Valide les écritures d'un vétérinaire non associé (salarié).
 *
 * Règles :
 *  1. Il édite l'ensemble du calendrier vétérinaire (toutes les lignes du roster),
 *     pas seulement la sienne — c'est ce qui le distingue d'un ASV.
 *  2. Les lignes ASV lui sont fermées tant que can_edit_asv_calendar est false.
 *  3. Clés _decision : il peut soumettre (`pending`) ou annuler une demande en
 *     attente, jamais approuver ni rejeter, ni toucher une décision déjà arrêtée.
 *     L'arbitrage appartient aux associés.
 */
export function validateVetEmployeWrite(
  changedKeys: ChangedKey[],
  vetPersonIds: Set<string> | string[],
  canEditAsvCalendar: boolean
): string | null {
  const vetIds = vetPersonIds instanceof Set ? vetPersonIds : new Set(vetPersonIds || []);
  // Fail-closed : sans roster connu, impossible de distinguer une ligne vét d'une
  // ligne ASV — on refuse plutôt que d'autoriser trop large.
  if (!vetIds.size) return 'Roster vétérinaire indisponible — écriture impossible.';

  for (const { key, oldValue, newValue } of changedKeys) {
    const keyPersonId = extractPersonIdFromKey(key);

    // Règles 1 & 2 — périmètre des lignes autorisées
    if (!keyPersonId) {
      return `Permission refusée : clé de planning non reconnue ("${key}").`;
    }
    if (!vetIds.has(keyPersonId) && canEditAsvCalendar !== true) {
      return `Permission refusée : la clé "${key}" ne relève pas du calendrier vétérinaire.`;
    }

    // Règle 3 — clés de décision de congé
    if (key.endsWith('_decision')) {
      if (oldValue === 'approved' || oldValue === 'rejected') {
        return `Seul un associé peut modifier une décision déjà approuvée ou rejetée (clé "${key}").`;
      }
      if (newValue !== undefined && newValue !== 'pending') {
        return `Seul un associé peut définir une décision autre que "pending" (clé "${key}").`;
      }
    }
  }
  return null;
}

/**
 * Valide qu'un ASV basique est autorisé à appliquer ses changements.
 * Retourne un message d'erreur ou null si autorisé.
 */
export function validateAsvWrite(changedKeys: ChangedKey[], callerPersonId: string | null): string | null {
  if (!callerPersonId) return 'Profil ASV sans person_id — écriture impossible.';

  for (const { key, oldValue, newValue } of changedKeys) {
    const keyPersonId = extractPersonIdFromKey(key);

    if (keyPersonId !== callerPersonId) {
      return `Permission refusée : la clé "${key}" appartient à "${keyPersonId ?? '?'}", pas à "${callerPersonId}".`;
    }

    if (key.endsWith('_decision')) {
      if (oldValue === 'approved' || oldValue === 'rejected') {
        return `Seul un admin peut modifier une décision déjà approuvée ou rejetée (clé "${key}").`;
      }
      if (newValue !== undefined && newValue !== 'pending') {
        return `Seul un admin peut définir une décision autre que "pending" (clé "${key}").`;
      }
    }
  }
  return null;
}
