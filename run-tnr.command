#!/bin/bash
# TNR runner pour Amivet Pulse (CalendrierAmivet).
# Ordre : lint -> tests unitaires -> build -> tests E2E Playwright.
# Ecrit le resultat dans .tnr/ pour que Claude le lise.
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

  echo "--- npm run lint ---"
  npm run lint
  LINT_EXIT=$?
  echo "lint_exit=$LINT_EXIT"

  if [ "$LINT_EXIT" -ne 0 ]; then
    echo "Lint en echec — arret anticipe."
    UNIT_EXIT=1
    BUILD_EXIT=1
    TEST_EXIT=1
  else
    echo ""
    echo "--- npm run test:unit ---"
    npm run test:unit
    UNIT_EXIT=$?
    echo "unit_exit=$UNIT_EXIT"

    if [ "$UNIT_EXIT" -ne 0 ]; then
      echo "Tests unitaires en echec — arret anticipe."
      BUILD_EXIT=1
      TEST_EXIT=1
    else
      echo ""
      echo "--- npm run build ---"
      npm run build
      BUILD_EXIT=$?
      echo "build_exit=$BUILD_EXIT"

      if [ "$BUILD_EXIT" -ne 0 ]; then
        echo "Build en echec — arret anticipe."
        TEST_EXIT=1
      else
        lsof -ti:4173 | xargs kill -9 2>/dev/null || true
        echo ""
        echo "--- npx playwright test ---"
        npx playwright test
        TEST_EXIT=$?
        echo "test_exit=$TEST_EXIT"
      fi
    fi
  fi

  echo ""
  echo "=== RESUME ==="
  echo "lint_exit=$LINT_EXIT"
  echo "unit_exit=$UNIT_EXIT"
  echo "build_exit=$BUILD_EXIT"
  echo "test_exit=$TEST_EXIT"
  if [ "$LINT_EXIT" -eq 0 ] && [ "$UNIT_EXIT" -eq 0 ] && [ "$BUILD_EXIT" -eq 0 ] && [ "$TEST_EXIT" -eq 0 ]; then
    echo "status=OK"
  else
    echo "status=FAIL"
  fi
} > "$OUT" 2>&1

cp "$OUT" "$LATEST"

echo "Resultats ecrits dans $OUT"
echo "Cette fenetre se fermera dans 5 secondes..."
sleep 5
