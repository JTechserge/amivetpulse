# Sauvegardes — Amivet PULSE

Les données non reconstructibles (signatures à valeur juridique eIDAS, présences, congés, profils) sont exportées automatiquement chaque nuit.

---

## Architecture

**Déclencheur** : GitHub Actions cron quotidien (`0 2 * * *` = 04h00 Paris) + bouton "Run workflow" manuel.

**Destination** : artefacts GitHub Actions (rétention 90 jours), attachés à chaque run du workflow `backup.yml`.

**Pourquoi les artefacts plutôt qu'un dépôt privé ?**
- Aucun secret supplémentaire (le `GITHUB_TOKEN` intégré suffit pour les artefacts).
- 90 jours couvrent la fenêtre critique pour détecter un problème.
- Upgrade possible : créer un dépôt privé `amivetpulse-backups` et pousser les fichiers JSON avec un PAT (`BACKUP_REPO_TOKEN`) — voir §Upgrade ci-dessous.

**⚠️  Les sauvegardes contiennent des données personnelles** (noms, rôles, données de présence). Le dépôt GitHub doit rester privé (ou les artefacts accessibles uniquement aux collaborateurs du dépôt).

---

## Tables sauvegardées

| Table | Contenu | Critique |
|---|---|---|
| `planning_data` | Grille de présences (JSON singleton) | ⭐ oui |
| `monthly_signatures` | Signatures mensualles ASV | ⭐ oui (valeur juridique) |
| `signature_tokens` | Tokens one-shot email | non (régénérables) |
| `user_profiles` | Profils + rôles employés | ⭐ oui |
| `email_settings` | Destinataire récapitulatif | non |
| `annual_interviews` | Entretiens annuels | oui |
| `cp_adjustments` | Ajustements congés payés | oui |
| `medical_visits` | Visites médicales | ⭐ oui (données de santé) |
| `announcements` | Annonces internes | non |
| `announcement_reads` | Lectures d'annonces | non |
| `calendar_sync_tokens` | Hash tokens synchronisation calendrier | non (régénérables) |
| `push_subscriptions` | Abonnements notifications push | non (régénérables) |
| `app_security` | Réglages de sécurité applicative | non |

**Exclues** : `rate_limit_log` (éphémère, sans valeur de restauration).

---

## Accéder aux sauvegardes

1. GitHub → dépôt `amivetpulse` → **Actions** → workflow **"Sauvegarde quotidienne Supabase"**
2. Cliquer sur un run → section **Artifacts** → télécharger `backup-<run_id>-<attempt>`
3. Décompresser : contient un dossier `backup-YYYY-MM-DD/` avec un fichier JSON par table + `manifest.json`

---

## Lancer une sauvegarde manuelle

GitHub → Actions → "Sauvegarde quotidienne Supabase" → **Run workflow** → Run workflow.

Ou en local :
```bash
SUPABASE_SERVICE_ROLE_KEY="..." node scripts/backup-supabase.mjs
# Produit ./backup-YYYY-MM-DD/ dans le répertoire courant
```

---

## Restauration pas à pas

> **Règle d'or** : toujours faire un dry-run avant la restauration réelle.

### Étape 1 — Récupérer le backup

Télécharger l'artefact souhaité depuis GitHub Actions et décompresser :
```
backup-2026-07-14/
  planning_data.json
  monthly_signatures.json
  ...
  manifest.json
```

### Étape 2 — Dry-run (aucune écriture)

```bash
SUPABASE_SERVICE_ROLE_KEY="..." \
  node scripts/restore-supabase.mjs ./backup-2026-07-14
```

Lire la sortie : nombre de lignes par table, tables absentes du backup, erreurs éventuelles.

### Étape 3 — Préparer la base cible

Pour une restauration complète (base corrompue ou nouvelle instance) :
- Ouvrir Supabase SQL Editor et vider les tables concernées **dans l'ordre inverse des dépendances** :
  ```sql
  TRUNCATE announcement_reads, announcements, cp_adjustments, annual_interviews,
           medical_visits, monthly_signatures, signature_tokens,
           calendar_sync_tokens, push_subscriptions, app_security,
           email_settings, user_profiles, planning_data;
  ```
  ⚠️ Cette opération est irréversible. Ne l'effectuer que sur une base de restauration.

Pour une restauration partielle (ré-injecter des données manquantes) :
- Le script utilise UPSERT — les lignes existantes sont écrasées si la clé primaire correspond.
- Les lignes présentes en base mais absentes du backup **ne sont pas supprimées**.

### Étape 4 — Restauration réelle

```bash
SUPABASE_SERVICE_ROLE_KEY="..." \
  node scripts/restore-supabase.mjs ./backup-2026-07-14 --confirm-prod
```

> `--confirm-prod` est le flag de sécurité explicite sans lequel aucune écriture n'a lieu.

### Étape 5 — Vérification post-restauration

```bash
node scripts/verify-prod.mjs   # vérifie les invariants de sécurité
```

Puis : ouvrir l'app, vérifier la connexion, le planning, les demandes de congé.

---

## Upgrade vers un dépôt privé (optionnel)

Pour une rétention supérieure à 90 jours :

1. Créer un dépôt privé `amivetpulse-backups` sur GitHub.
2. Créer un PAT (Personal Access Token) avec scope `contents:write` sur ce dépôt.
3. L'ajouter comme secret `BACKUP_REPO_TOKEN` dans les secrets GitHub Actions du dépôt principal.
4. Modifier `.github/workflows/backup.yml` : remplacer l'étape `upload-artifact` par un `git push` vers `amivetpulse-backups`.

---

## Fréquence et rétention recommandées

| Fréquence | Rétention | Couverture |
|---|---|---|
| Quotidienne (en place) | 90 jours (artefacts GitHub) | Perte accidentelle récente |
| Mensuelle (manuelle) | Illimitée (télécharger localement) | Archivage long terme |

**Action recommandée** : télécharger manuellement le backup du premier de chaque mois et le stocker hors GitHub (disque local chiffré, NAS, etc.).
