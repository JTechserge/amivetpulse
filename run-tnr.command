#!/bin/bash
# TNR runner pour Amivet Pulse (CalendrierAmivet) - smoke tests Playwright.
# Installe les dependances au premier lancement (necessite internet, une seule fois),
# puis lance les tests et ecrit un resultat horodate dans .tnr/ pour que Claude le lise.
set -uo pipefail
cd "$(dirname "$0")"

mkdir -p .tnr
STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUT=".tnr/results-${STAMP}.log"
LATEST=".tnr/latest.log"

{
  echo "=== TNR CalendrierAmivet - $STAMP ==="
  echo ""

  if [ ! -d node_modules ]; then
    echo "--- Premiere installation (npm install) ---"
    npm install
  fi

  if [ ! -d node_modules/.cache/ms-playwright ] && [ ! -d "$HOME/Library/Caches/ms-playwright" ]; then
    echo "--- Installation des navigateurs Playwright (premiere fois, peut prendre quelques minutes) ---"
    npx playwright install --with-deps chromium
  fi

  echo "--- npm run build ---"
  npm run build
  BUILD_EXIT=$?
  echo "build_exit=$BUILD_EXIT"

  if [ "$BUILD_EXIT" -ne 0 ]; then
    TEST_EXIT=1
  else
    lsof -ti:4173 | xargs kill -9 2>/dev/null || true
    echo "--- npx playwright test ---"
    npx playwright test
    TEST_EXIT=$?
  fi

  echo ""
  echo "=== RESUME ==="
  echo "test_exit=$TEST_EXIT"
  if [ "$TEST_EXIT" -eq 0 ]; then
    echo "status=OK"
  else
    echo "status=FAIL"
  fi
} > "$OUT" 2>&1

cp "$OUT" "$LATEST"

echo "Resultats ecrits dans $OUT"
echo "Cette fenetre se fermera dans 5 secondes..."
sleep 5
