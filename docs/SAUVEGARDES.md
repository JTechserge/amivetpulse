# Sauvegardes — Amivet PULSE

Les données non reconstructibles (signatures à valeur juridique eIDAS, présences, congés, profils) sont exportées automatiquement chaque nuit et **chiffrées avant upload**.

---

## Architecture

**Déclencheur** : GitHub Actions cron quotidien (`0 2 * * *` = 04h00 Paris) + bouton "Run workflow" manuel.

**Destination** : artefacts GitHub Actions (rétention 90 jours), attachés à chaque run du workflow `backup.yml`.

**Chiffrement** : chaque sauvegarde est archivée (`tar.gz`) puis chiffrée avec [age](https://github.com/FiloSottile/age) (asymétrique, clé publique). Le fichier uploadé est `backup-YYYY-MM-DD.tar.gz.age` — aucun clair ne transite ni n'est stocké dans les artefacts GitHub.

**Pourquoi les artefacts plutôt qu'un dépôt privé ?**
- Aucun secret supplémentaire (le `GITHUB_TOKEN` intégré suffit pour les artefacts).
- 90 jours couvrent la fenêtre critique pour détecter un problème.
- Upgrade possible : voir §Prochaine évolution dans `EXPLOITATION.md`.

**⚠️  Les sauvegardes contiennent des données personnelles et de santé.** Même chiffrées, le dépôt GitHub doit rester privé et l'accès aux artefacts limité aux collaborateurs du dépôt.

---

## Clé de chiffrement age

| Élément | Emplacement | Qui |
|---|---|---|
| **Clé publique** (`age1...`) | GitHub Secret `AGE_PUBLIC_KEY` | Admin GitHub du dépôt |
| **Clé privée** (`AGE-SECRET-KEY-1...`) | Hors dépôt — coffre de mots de passe (Bitwarden, 1Password) **et/ou** NAS clinique | Admin uniquement |

**⚠️  La clé privée est le seul moyen de déchiffrer les sauvegardes.** Sa perte = inaccessibilité définitive des archives. La stocker dans au moins deux endroits distincts (ex. coffre numérique + copie imprimée dans un endroit sûr).

### Générer la paire de clés (action manuelle requise — une seule fois)

```bash
# macOS
brew install age
# Ubuntu / GitHub Actions
sudo apt-get install age

# Générer
age-keygen -o amivet-backup-key.txt
# Affiche : Public key: age1xxxx...
# Le fichier amivet-backup-key.txt contient la clé PRIVÉE — ne jamais le committer
```

Puis :
1. Copier la ligne `Public key: age1...` depuis la sortie ou le fichier
2. GitHub → Settings → Secrets → Actions → **New repository secret** → Nom : `AGE_PUBLIC_KEY`, valeur : `age1...`
3. Stocker `amivet-backup-key.txt` dans le coffre de mots de passe et/ou sur le NAS hors ligne

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
3. Le fichier téléchargé est `backup-YYYY-MM-DD.tar.gz.age` — chiffré, à déchiffrer avant usage

---

## Lancer une sauvegarde manuelle

GitHub → Actions → "Sauvegarde quotidienne Supabase" → **Run workflow** → Run workflow.

Ou en local (produit un dossier en clair — à chiffrer manuellement si archivé hors poste) :
```bash
SUPABASE_SERVICE_ROLE_KEY="..." node scripts/backup-supabase.mjs
# Produit ./backup-YYYY-MM-DD/ dans le répertoire courant (non chiffré)
```

---

## Restauration pas à pas

> **Règle d'or** : toujours faire un dry-run avant la restauration réelle.

### Étape 0 — Déchiffrer l'archive

```bash
# Prérequis : age installé (brew install age / apt install age)
# Prérequis : amivet-backup-key.txt (clé privée) disponible localement

age --decrypt --identity amivet-backup-key.txt backup-2026-07-14.tar.gz.age \
  | tar -xzf -

# Produit ./backup-2026-07-14/ avec les fichiers JSON
```

### Étape 1 — Dry-run (aucune écriture)

```bash
SUPABASE_SERVICE_ROLE_KEY="..." \
  node scripts/restore-supabase.mjs ./backup-2026-07-14
```

Lire la sortie : nombre de lignes par table, tables absentes du backup, erreurs éventuelles.

### Étape 2 — Préparer la base cible

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

### Étape 3 — Restauration réelle

```bash
SUPABASE_SERVICE_ROLE_KEY="..." \
  node scripts/restore-supabase.mjs ./backup-2026-07-14 --confirm-prod
```

> `--confirm-prod` est le flag de sécurité explicite sans lequel aucune écriture n'a lieu.

### Étape 4 — Vérification post-restauration

```bash
SUPABASE_SERVICE_ROLE_KEY="..." node scripts/verify-prod.mjs
```

Puis : ouvrir l'app, vérifier la connexion, le planning, les demandes de congé.

---

## Upgrade vers un dépôt privé (optionnel)

Pour une rétention supérieure à 90 jours :

1. Créer un dépôt privé `amivetpulse-backups` sur GitHub.
2. Créer un PAT (Personal Access Token) avec scope `contents:write` sur ce dépôt.
3. L'ajouter comme secret `BACKUP_REPO_TOKEN` dans les secrets GitHub Actions du dépôt principal.
4. Modifier `.github/workflows/backup.yml` : remplacer l'étape `upload-artifact` par un `git push` vers `amivetpulse-backups`.

Le chiffrement age reste compatible — les fichiers `.tar.gz.age` sont déposés dans le dépôt privé.

---

## Fréquence et rétention recommandées

| Fréquence | Rétention | Couverture |
|---|---|---|
| Quotidienne (en place) | 90 jours (artefacts GitHub, chiffrés) | Perte accidentelle récente |
| Mensuelle (manuelle) | Illimitée (télécharger + stocker hors GitHub) | Archivage long terme |

**Action recommandée** : télécharger manuellement le backup chiffré du premier de chaque mois et le stocker hors GitHub (NAS clinique, disque externe chiffré). La clé privée age permet de déchiffrer hors ligne en cas d'urgence.
