#!/bin/bash
# Job quotidien des signalements : digest, puis purge à 15 jours.
# Appelé par l'agent launchd com.jeremie.feedback-daily, ou à la main.
#
# Même mécanique que run-tnr.command et que le job de vérification Closerie :
# la clé vit HORS du dépôt, dans un fichier de configuration à créer une fois.
#
#   ~/.amivet-feedback.env  →  SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#   chmod 600 ~/.amivet-feedback.env
#
# Ordre volontaire : le digest AVANT la purge. L'inverse effacerait des
# signalements de plus de 15 jours sans qu'ils soient jamais apparus dans un
# digest.

# pipefail est indispensable : la sortie passe par « | tee », dont le code de
# retour masquerait celui du job. Sans lui, un échec remonterait à launchd
# comme un succès — exactement le silence qu'on cherche à éviter.
set -u -o pipefail

PROJET="/Users/jeremie/Projets/CalendrierAmivet"
SORTIE="$HOME/Projets/.feedback"
CONF="$HOME/.amivet-feedback.env"
JOUR="$(date '+%Y-%m-%d')"
LOG="$SORTIE/run-$JOUR.log"

mkdir -p "$SORTIE"

{
  echo "=== SIGNALEMENTS $(date '+%Y-%m-%d %H:%M:%S') ==="

  if [ ! -f "$CONF" ]; then
    echo "✗ $CONF absent — créer le fichier avec SUPABASE_SERVICE_ROLE_KEY=\"...\" (chmod 600)."
    exit 1
  fi
  # shellcheck disable=SC1090
  . "$CONF"

  if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    echo "✗ SUPABASE_SERVICE_ROLE_KEY vide dans $CONF."
    exit 1
  fi
  export SUPABASE_SERVICE_ROLE_KEY

  cd "$PROJET" || { echo "✗ $PROJET introuvable."; exit 1; }

  DIGEST="$SORTIE/digest-$JOUR.md"
  echo "--- digest ---"
  if node scripts/feedback-digest.mjs --out "$DIGEST"; then
    echo "digest_exit=0 → $DIGEST"
  else
    echo "digest_exit=$? — purge annulée : on ne supprime rien qu'on n'a pas su lire."
    exit 1
  fi

  echo "--- purge (rétention 15 jours) ---"
  node scripts/feedback-purge.mjs
  echo "purge_exit=$?"

  echo "=== fin $(date '+%H:%M:%S') ==="
} 2>&1 | tee -a "$LOG"

# Le digest du jour reste dans ~/Projets/.feedback/ : c'est lui qu'on colle
# dans une session Claude Code pour le triage.
