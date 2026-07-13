# Amivet PULSE

PWA de gestion du planning vétérinaire — Clinique Amivet.

**Production** : https://jtechserge.github.io/amivetpulse/
**Backend** : Supabase (projet `ubowqtowyqmpraoxbaoo`)

---

## Stack

- **Frontend** : Vite + vanilla ES2022, PWA (Service Worker, manifest)
- **Backend** : Supabase (Auth, PostgreSQL + RLS, Edge Functions Deno)
- **CI** : GitHub Actions (tests Playwright + Vitest, CodeQL, gitleaks, npm audit)
- **Déploiement** : GitHub Pages (push sur `main` → déploiement automatique via CI)

## Développement

```bash
npm install
npm run dev        # Vite dev server
npm run build      # Build de production
npm run lint       # ESLint (0 warning autorisé)
npm run test:unit  # Vitest (tests unitaires)
npm test           # Playwright (tests E2E)
```

## Documentation

- [SECURITE.md](SECURITE.md) — Architecture de défense, règles immuables, actions manuelles requises
- [supabase/README.md](supabase/README.md) — Edge Functions, migrations, variables d'environnement
- [supabase/migrations/README.md](supabase/migrations/README.md) — Ordre d'application des migrations
