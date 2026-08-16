/* ================================================================
   Signalements — logique pure de construction du signalement.
   Aucune dépendance DOM ni réseau : tout ce qui est testable vit ici,
   src/feedback.js ne garde que l'affichage et l'appel Supabase.
   ================================================================ */

// Miroir des CHECK de supabase/migrations/20260816000001_feedback.sql.
// Valider côté client ne protège rien (la RLS fait foi) : ça évite juste
// à l'utilisateur un 400 illisible à la place d'un message clair.
export const SEVERITIES = ['bloquant', 'normal', 'confort'];
export const ROLES = ['admin', 'vet', 'vet_employe', 'asv'];
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 2000;

const SCREEN_MAX = 200;
const UA_MAX = 400;

const VIEW_LABELS = {
  dashboard: 'Tableau de bord',
  vets: 'Vétérinaires',
  asv: 'ASV',
  annonces: 'Annonces',
};

const SUB_LABELS = {
  calendar: 'Calendrier mensuel',
  annual: 'Vue annuelle',
  forecast: 'Prévisionnel',
  week: 'Hebdomadaire',
  stats: 'Suivi vétérinaires',
  hours: 'Suivi ASV',
  requests: 'Demandes de congé',
  signatures: 'Feuilles signées',
  interviews: 'Entretiens annuels',
};

/**
 * Décrit l'écran où l'utilisateur se trouvait, en clair pour le triage.
 * Un onglet inconnu est conservé tel quel plutôt que masqué : mieux vaut un
 * libellé technique qu'un contexte perdu.
 */
export function describeScreen({ view, subTab, impersonating = false } = {}) {
  const parts = [];
  if (view) parts.push(VIEW_LABELS[view] || view);
  if (subTab) parts.push(SUB_LABELS[subTab] || subTab);
  let label = parts.join(' › ') || 'Écran inconnu';
  // Un admin qui consulte en vue ASV ne vit pas la même interface qu'une ASV :
  // sans cette mention, un signalement « je ne peux pas modifier » serait
  // interprété à l'envers.
  if (impersonating) label += ' (admin en vue ASV)';
  return label.slice(0, SCREEN_MAX);
}

/**
 * Valide le message saisi. Renvoie { ok } ou { ok:false, error } — un message
 * affichable tel quel, jamais un code.
 */
export function validateFeedbackMessage(message) {
  const trimmed = String(message ?? '').trim();
  if (trimmed.length < MESSAGE_MIN) {
    return { ok: false, error: `Décrivez le problème en ${MESSAGE_MIN} caractères au minimum.` };
  }
  if (trimmed.length > MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message trop long (${trimmed.length} caractères, maximum ${MESSAGE_MAX}).`,
    };
  }
  return { ok: true };
}

/**
 * Construit la ligne à insérer. Lève une Error porteuse d'un message
 * affichable si l'appel est invalide.
 *
 * `status`, `admin_note`, `resolved_at` et `clinic_id` sont volontairement
 * absents : leurs valeurs par défaut sont exactement ce que le WITH CHECK de
 * la politique d'insertion exige. Les envoyer ne pourrait que faire échouer
 * l'insertion.
 */
export function buildFeedbackPayload({
  user,
  screen,
  appVersion,
  userAgent,
  message,
  severity,
} = {}) {
  if (!user?.id) {
    throw new Error('Session expirée : reconnectez-vous pour envoyer un signalement.');
  }
  // Le rôle enregistré est le rôle RÉEL, pas le mode d'affichage : un admin en
  // vue ASV reste un admin. Le mode d'affichage est porté par `screen`.
  if (!ROLES.includes(user.role)) {
    throw new Error('Rôle utilisateur inconnu : signalement impossible.');
  }
  const check = validateFeedbackMessage(message);
  if (!check.ok) throw new Error(check.error);

  return {
    reported_by: user.id,
    role: user.role,
    screen: screen ? String(screen).slice(0, SCREEN_MAX) : null,
    app_version: appVersion ? String(appVersion) : null,
    user_agent: userAgent ? String(userAgent).slice(0, UA_MAX) : null,
    message: String(message).trim(),
    severity: SEVERITIES.includes(severity) ? severity : 'normal',
  };
}
