// Push CalDAV vers iCloud — appelée en fire-and-forget depuis save-planning.
// Pousse les jours de présence (M ou AM = 'present') dans le calendrier iCloud
// de chaque vétérinaire qui a configuré ses identifiants Apple.
// Pas de dépendance externe : uniquement fetch + btoa (disponibles dans Deno).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PERSON_LABELS: Record<string, string> = { david: 'David', stephane: 'Stéphane' };

// ── Helpers iCalendar ────────────────────────────────────────────────────────

function caldavUid(personId: string, iso: string) {
  return `amivet-${personId}-${iso}@amivet-pulse`;
}

function caldavHref(calendarUrl: string, personId: string, iso: string) {
  const base = calendarUrl.endsWith('/') ? calendarUrl : calendarUrl + '/';
  return `${base}${caldavUid(personId, iso)}.ics`;
}

function isoToDate(iso: string) {
  return iso.replace(/-/g, '');
}

function isoNextDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildVEvent(personId: string, iso: string): string {
  const uid = caldavUid(personId, iso);
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const label = PERSON_LABELS[personId] ?? personId;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amivet PULSE//CalDAV Push//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${isoToDate(iso)}`,
    // DTEND exclusif (RFC 5545) : jour réel = J, DTEND = J+1
    `DTEND;VALUE=DATE:${isoNextDay(iso)}`,
    `SUMMARY:Présent — Clinique Amivet (${label})`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ── CalDAV HTTP ──────────────────────────────────────────────────────────────

async function putEvent(href: string, vcal: string, b64: string): Promise<void> {
  const res = await fetch(href, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: vcal,
  });
  // 201 Created, 204 No Content → succès
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`CalDAV PUT HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function deleteEvent(href: string, b64: string): Promise<void> {
  const res = await fetch(href, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${b64}` },
  });
  // 404 / 410 → déjà supprimé ou jamais existé, pas une erreur
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`CalDAV DELETE HTTP ${res.status}`);
  }
}

// ── Découverte des calendriers du compte ─────────────────────────────────────

async function discoverCalendars(appleId: string, appPassword: string) {
  const b64 = btoa(`${appleId}:${appPassword}`);

  // Étape 1 : principal URL
  const r1 = await fetch('https://caldav.icloud.com/', {
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '0',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`,
  });
  if (!r1.ok) {
    if (r1.status === 401)
      throw new Error("Identifiants invalides — vérifiez votre Apple ID et le mot de passe d'application.");
    throw new Error(`Connexion iCloud impossible (HTTP ${r1.status}).`);
  }
  const xml1 = await r1.text();
  const principalMatch = xml1.match(
    /<[^:>]*:?current-user-principal[^>]*>[\s\S]*?<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^>]+>/i
  );
  if (!principalMatch) throw new Error('Réponse iCloud inattendue — principal introuvable.');
  const principalPath = principalMatch[1].trim();
  const principalUrl = principalPath.startsWith('http') ? principalPath : `https://caldav.icloud.com${principalPath}`;

  // Étape 2 : calendar-home-set
  const r2 = await fetch(principalUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '0',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>`,
  });
  if (!r2.ok) throw new Error(`Lecture du compte iCloud impossible (HTTP ${r2.status}).`);
  const xml2 = await r2.text();
  const homeMatch = xml2.match(/<[^:>]*:?calendar-home-set[^>]*>[\s\S]*?<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (!homeMatch) throw new Error('Aucun calendrier domestique trouvé sur ce compte iCloud.');
  const homePath = homeMatch[1].trim();
  const homeUrl = homePath.startsWith('http') ? homePath : `https://caldav.icloud.com${homePath}`;

  // Étape 3 : liste des calendriers (Depth:1)
  const r3 = await fetch(homeUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:displayname/><D:resourcetype/></D:prop></D:propfind>`,
  });
  if (!r3.ok) throw new Error(`Liste des calendriers impossible (HTTP ${r3.status}).`);
  const xml3 = await r3.text();

  // Parsing permissif : iCloud peut omettre le préfixe namespace sur <calendar/>.
  // Filtre fiable : les collections calendrier iCloud ont toujours "/calendars/" dans l'URL
  // et ne terminent pas par "/calendars/" (qui serait le home lui-même).
  const calendars: Array<{ name: string; url: string }> = [];
  const hrefRe = /<[^>]*:?href[^>]*>\s*([^\s<]+)\s*<\/[^>]*:?href>/gi;
  for (const m of xml3.matchAll(hrefRe)) {
    const path = m[1].trim();
    if (!path.includes('/calendars/') || path.endsWith('/calendars/')) continue;
    const idx = m.index!;
    const ctx = xml3.slice(Math.max(0, idx - 100), idx + 600);
    const nameM = ctx.match(/<[^>]*:?displayname[^>]*>([\s\S]*?)<\/[^>]*:?displayname>/i);
    const name = nameM ? nameM[1].trim() : (path.split('/').filter(Boolean).pop() ?? path);
    const url = path.startsWith('http') ? path : `https://caldav.icloud.com${path}`;
    if (!calendars.some((c) => c.url === url)) calendars.push({ name, url });
  }
  return calendars;
}

// ── Endpoint principal ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const body = await req.json();

    // ── Action découverte : appelée depuis les réglages utilisateur ──────────
    if (body.action === 'discover') {
      const { apple_id, app_password } = body as { apple_id: string; app_password: string };
      if (!apple_id || !app_password) {
        return new Response(JSON.stringify({ error: 'apple_id et app_password requis.' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      const calendars = await discoverCalendars(apple_id, app_password);
      return new Response(JSON.stringify({ calendars }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Action push : déclenchée en fire-and-forget depuis save-planning ─────
    const { changes } = body as {
      changes: Array<{ personId: string; iso: string; isPresent: boolean }>;
    };
    if (!Array.isArray(changes) || changes.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no changes' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Grouper par personId pour lire les credentials une seule fois par personne
    const byPerson: Record<string, Array<{ iso: string; isPresent: boolean }>> = {};
    for (const c of changes) {
      (byPerson[c.personId] ??= []).push({ iso: c.iso, isPresent: c.isPresent });
    }

    const results: Record<string, { pushed: number; deleted: number; errors: string[] }> = {};

    for (const [personId, dates] of Object.entries(byPerson)) {
      // Lecture credentials via service_role — le mot de passe n'est jamais exposé au frontend
      const credsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/calendar_sync_tokens?person_id=eq.${personId}&select=caldav_apple_id,caldav_app_password,caldav_calendar_url`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const credsRows = await credsRes.json();
      const creds = credsRows?.[0];
      if (!creds?.caldav_apple_id || !creds?.caldav_app_password || !creds?.caldav_calendar_url) {
        continue; // CalDAV non configuré pour cette personne → skip silencieux
      }

      const b64 = btoa(`${creds.caldav_apple_id}:${creds.caldav_app_password}`);
      const stat = { pushed: 0, deleted: 0, errors: [] as string[] };
      results[personId] = stat;

      for (const { iso, isPresent } of dates) {
        const href = caldavHref(creds.caldav_calendar_url, personId, iso);
        try {
          if (isPresent) {
            await putEvent(href, buildVEvent(personId, iso), b64);
            stat.pushed++;
          } else {
            await deleteEvent(href, b64);
            stat.deleted++;
          }
        } catch (e) {
          stat.errors.push(String(e));
          console.warn(`[caldav-push] ${personId} ${iso}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[caldav-push]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
