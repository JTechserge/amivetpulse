import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Version jointe aux signalements. Elle vient de CACHE_VERSION (public/sw.js),
// seule valeur réellement incrémentée à chaque déploiement — package.json est
// figé à 1.0.0 depuis l'origine et ne dirait rien.
function appVersion() {
  try {
    const sw = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8');
    return sw.match(/CACHE_VERSION\s*=\s*'([^']+)'/)?.[1] || 'inconnue';
  } catch {
    return 'inconnue';
  }
}

export default defineConfig({
  root: 'src',
  base: '/amivetpulse/',
  publicDir: '../public',
  // Exposée via import.meta.env plutôt qu'en global : pas de nouveau nom à
  // déclarer dans eslint.config.js, qui est protégé en écriture.
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()) },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
