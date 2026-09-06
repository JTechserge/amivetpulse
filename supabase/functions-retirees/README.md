# Fonctions retirées de la production

Ce dossier **n'est jamais déployé**. `supabase functions deploy` ne lit que
`supabase/functions/`. Il conserve le code d'Edge Functions supprimées de
production, pour la traçabilité et pour pouvoir les redéployer si le besoin
revenait.

## Pourquoi elles sont ici (06/09/2026)

Découvertes au lendemain du chantier « surfaces anon », en levant la dette
« `send-leave-recap` est déclarée déployée mais n'a pas de source dans le dépôt »
(`docs/DETTE.md`). Un `npx supabase functions list` a montré **15 fonctions
déployées pour 13 sources au dépôt**.

Leur `entrypoint_path` explique l'écart : elles avaient été déployées depuis
`~/Documents/projet claude/CalendrierAmivet/`, l'ancien emplacement iCloud. Leurs
sources n'ont pas suivi le déménagement vers `~/Projets/`. Invisibles au dépôt,
elles ont donc échappé aux cinq lots du chantier — qui n'a fermé que les treize
fonctions dont il voyait le code.

**Les deux étaient appelables avec la seule clé publique `anon`.** Leur
`verify_jwt: true` ne protégeait rien : pour Supabase, la clé `anon` *est* un JWT
valide. C'est la même faille que le chantier venait de fermer ailleurs, restée
ouverte faute de source à lire.

### `send-leave-recap`

Récapitulatif des congés ASV en attente, envoyé par Brevo. Lisait `planning_data`,
écrivait `email_settings.last_run_at` en `service_role`, envoyait l'email.
Rate-limitée à 5 requêtes/heure par IP — ce qui bornait l'abus sans le fermer.

Supprimée parce qu'**orpheline** : le bouton « Envoyer maintenant » qu'elle cite
n'existe plus dans `src/`, et le `scripts/send-weekly-recap.mjs` qu'elle cite
n'existe pas non plus. Ni `pg_cron` ni les workflows GitHub ne l'appelaient.

### `send-password-reset`

Réinitialisation du mot de passe **partagé** du tableau de bord, système remplacé
depuis par les comptes individuels. Écrivait `reset_token` et
`reset_token_expires_at` dans `app_security`, envoyait le lien par Resend.

Le lot 4 du chantier a supprimé ces deux colonnes le 06/09/2026 : la fonction
répondait donc déjà HTTP 500 avant sa suppression, neutralisée **par effet de
bord** et non par intention. Aucun appelant nulle part.

## Si vous les redéployez un jour

Le code ci-joint est celui **téléchargé depuis la production**
(`npx supabase functions download`), donc transpilé — pas le source d'origine,
perdu avec l'ancien répertoire.

Deux points avant tout redéploiement :

1. **Ajouter un garde d'identité.** Aucune des deux n'en a. Le patron à suivre est
   `isAuthorizedCaller()` dans `supabase/functions/push-server/index.ts` (lot 3) :
   JWT validé auprès de `/auth/v1/user`, puis profil relu côté serveur. Tester le
   **rôle**, jamais le `person_id` seul — le compte admin de la clinique n'en a
   pas, et c'est ce qui a failli casser le déploiement du 06/09.
2. **Vérifier `_shared/email-template.ts`.** La version du dépôt diffère de celle
   avec laquelle ces fonctions avaient été déployées. Elle exporte bien les quatre
   symboles attendus (`wrapEmailHtml`, `buttonHtml`, `APP_URL`, `COLORS`), mais le
   rendu des emails peut avoir changé.
