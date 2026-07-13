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
  person_id: string | null;
}

/** Extrait le person_id d'une clé de planning "YYYY-MM-DD_personId[_suffixe]". */
export function extractPersonIdFromKey(key: string): string | null {
  if (!key || key.length <= 11) return null;
  const afterDate = key.slice(11);
  if (!afterDate) return null;
  const idx = afterDate.indexOf('_');
  const personId = idx === -1 ? afterDate : afterDate.slice(0, idx);
  return personId || null;
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
  return (
    profile.role === 'admin' ||
    profile.role === 'vet' ||
    profile.can_edit_vet_calendar === true ||
    profile.can_edit_all_asv === true
  );
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
