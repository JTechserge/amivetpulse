// Push CalDAV vers iCloud — appelée en fire-and-forget depuis save-planning.
// Stratégie full-sync : regroupe les jours de présence consécutifs en un seul VEVENT
// par plage, compare avec l'état iCloud, supprime les obsolètes, re-PUT tous les
// événements désirés (ce qui écrase toute modification faite depuis iCloud).
//
// Actions exposées :
//   (défaut / "push") : sync complet pour les personnes listées dans `persons`
//   "clear"           : supprime tous les événements Amivet pour une personne (avant désactivation)
//   "discover"        : découverte des calendriers du compte (appelée depuis réglages)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://jtechserge.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PERSON_LABELS: Record<string, string> = { david: 'David', stephane: 'Stéphane' };

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotsRecord = Record<string, string>;
type Creds = { caldav_apple_id: string; caldav_app_password: string; caldav_calendar_url: string };
type Run = { start: string; end: string };

// ── Helpers iCalendar ────────────────────────────────────────────────────────

function isoToDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function isoNextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, '');
}

// Retourne le prochain jour non-dimanche après `iso` (pour grouper les runs consécutifs).
function nextNonSunday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  let dt = new Date(Date.UTC(y, m - 1, d + 1));
  while (dt.getUTCDay() === 0) dt = new Date(dt.getTime() + 86400000);
  return dt.toISOString().slice(0, 10);
}

// Regroupe les jours de présence d'une personne en plages consécutives (sans dimanche).
function computePresenceRuns(slots: SlotsRecord, personId: string): Run[] {
  const presenceDays = new Set<string>();
  const keyRe = /^(\d{4}-\d{2}-\d{2})_([^_]+)_(M|AM)$/;
  for (const [key, val] of Object.entries(slots)) {
    const m = key.match(keyRe);
    if (m && m[2] === personId && val === 'present') presenceDays.add(m[1]);
  }
  const sorted = [...presenceDays].sort();
  const runs: Run[] = [];
  for (const iso of sorted) {
    const last = runs[runs.length - 1];
    if (last && nextNonSunday(last.end) === iso) {
      last.end = iso;
    } else {
      runs.push({ start: iso, end: iso });
    }
  }
  return runs;
}

function caldavUid(personId: string, startIso: string): string {
  return `amivet-${personId}-${startIso}@amivet-pulse`;
}

function caldavHref(calendarUrl: string, personId: string, startIso: string): string {
  const base = calendarUrl.endsWith('/') ? calendarUrl : calendarUrl + '/';
  return `${base}${caldavUid(personId, startIso)}.ics`;
}

function buildVEvent(personId: string, startIso: string, endIso: string): string {
  const uid = caldavUid(personId, startIso);
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
    `DTSTART;VALUE=DATE:${isoToDate(startIso)}`,
    // DTEND exclusif (RFC 5545) : pour une plage Mon→Wed, DTEND = Thu
    `DTEND;VALUE=DATE:${isoNextDay(endIso)}`,
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
    headers: { Authorization: `Basic ${b64}`, 'Content-Type': 'text/calendar; charset=utf-8' },
    body: vcal,
  });
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
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`CalDAV DELETE HTTP ${res.status}`);
  }
}

// Liste tous les événements Amivet existants dans le calendrier pour cette personne.
async function listAmivetEvents(calendarUrl: string, personId: string, b64: string): Promise<string[]> {
  const base = calendarUrl.endsWith('/') ? calendarUrl : calendarUrl + '/';
  const res = await fetch(base, {
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:getetag/></D:prop></D:propfind>`,
  });
  if (!res.ok) throw new Error(`PROPFIND HTTP ${res.status}`);
  const xml = await res.text();
  const prefix = `amivet-${personId}-`;
  const hrefs: string[] = [];
  const hrefRe = /<[^>]*:?href[^>]*>\s*([^\s<]+)\s*<\/[^>]*:?href>/gi;
  for (const m of xml.matchAll(hrefRe)) {
    const path = m[1].trim();
    const filename = path.split('/').pop() ?? '';
    if (filename.startsWith(prefix) && filename.endsWith('.ics')) {
      hrefs.push(path.startsWith('http') ? path : `https://caldav.icloud.com${path}`);
    }
  }
  return hrefs;
}

// ── Credentials ──────────────────────────────────────────────────────────────

async function fetchCreds(personId: string): Promise<Creds | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/calendar_sync_tokens?person_id=eq.${personId}&select=caldav_apple_id,caldav_app_password,caldav_calendar_url`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
  );
  const rows = await res.json();
  const creds = rows?.[0];
  if (!creds?.caldav_apple_id || !creds?.caldav_app_password || !creds?.caldav_calendar_url) return null;
  return creds as Creds;
}

// ── Sync complet pour une personne ───────────────────────────────────────────

async function syncPerson(
  personId: string,
  slots: SlotsRecord,
  creds: Creds
): Promise<{ pushed: number; deleted: number; errors: string[] }> {
  const b64 = btoa(`${creds.caldav_apple_id}:${creds.caldav_app_password}`);
  const stat = { pushed: 0, deleted: 0, errors: [] as string[] };

  // 1. Plages de présence souhaitées
  const runs = computePresenceRuns(slots, personId);
  const desiredUids = new Set(runs.map((r) => caldavUid(personId, r.start)));

  // 2. Événements Amivet actuellement dans iCloud
  let existingHrefs: string[] = [];
  try {
    existingHrefs = await listAmivetEvents(creds.caldav_calendar_url, personId, b64);
  } catch (e) {
    stat.errors.push(`PROPFIND: ${String(e)}`);
  }

  const existingByUid = new Map<string, string>();
  for (const href of existingHrefs) {
    const uid = (href.split('/').pop() ?? '').replace('.ics', '');
    existingByUid.set(uid, href);
  }

  // 3. Suppression des événements obsolètes
  for (const [uid, href] of existingByUid) {
    if (!desiredUids.has(uid)) {
      try {
        await deleteEvent(href, b64);
        stat.deleted++;
      } catch (e) {
        stat.errors.push(`DELETE ${uid}: ${String(e)}`);
      }
    }
  }

  // 4. PUT de tous les événements désirés (crée les nouveaux, écrase les modifiés)
  for (const run of runs) {
    const href = caldavHref(creds.caldav_calendar_url, personId, run.start);
    try {
      await putEvent(href, buildVEvent(personId, run.start, run.end), b64);
      stat.pushed++;
    } catch (e) {
      stat.errors.push(`PUT ${run.start}: ${String(e)}`);
    }
  }

  return stat;
}

// ── Suppression totale (avant désactivation) ─────────────────────────────────

async function clearAllEvents(personId: string, creds: Creds): Promise<number> {
  const b64 = btoa(`${creds.caldav_apple_id}:${creds.caldav_app_password}`);
  let hrefs: string[] = [];
  try {
    hrefs = await listAmivetEvents(creds.caldav_calendar_url, personId, b64);
  } catch {
    return 0;
  }
  let deleted = 0;
  for (const href of hrefs) {
    try {
      await deleteEvent(href, b64);
      deleted++;
    } catch {
      // ignore les erreurs individuelles
    }
  }
  return deleted;
}

// ── Découverte des calendriers du compte ─────────────────────────────────────

async function discoverCalendars(appleId: string, appPassword: string) {
  const b64 = btoa(`${appleId}:${appPassword}`);

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const body = await req.json();

    // ── Découverte ───────────────────────────────────────────────────────────
    if (body.action === 'discover') {
      const { apple_id, app_password } = body as { apple_id: string; app_password: string };
      if (!apple_id || !app_password)
        return json({ error: 'apple_id et app_password requis.' }, 400);
      const calendars = await discoverCalendars(apple_id, app_password);
      return json({ calendars });
    }

    // ── Suppression totale avant désactivation ───────────────────────────────
    if (body.action === 'clear') {
      const { personId } = body as { personId: string };
      if (!personId) return json({ error: 'personId requis.' }, 400);
      const creds = await fetchCreds(personId);
      if (!creds) return json({ ok: true, deleted: 0, reason: 'non configuré' });
      const deleted = await clearAllEvents(personId, creds);
      return json({ ok: true, deleted });
    }

    // ── Sync complet (action par défaut, déclenché depuis save-planning) ─────
    const { persons } = body as { persons?: string[] };
    if (!Array.isArray(persons) || persons.length === 0)
      return json({ ok: true, skipped: 'no persons' });

    // Lecture du planning complet (une seule requête pour toutes les personnes)
    const dataRes = await fetch(`${SUPABASE_URL}/rest/v1/planning_data?id=eq.singleton&select=data`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const dataRows = await dataRes.json();
    const slots: SlotsRecord = dataRows?.[0]?.data ?? {};

    const results: Record<string, { pushed: number; deleted: number; errors: string[] }> = {};

    for (const personId of persons) {
      const creds = await fetchCreds(personId);
      if (!creds) continue;
      try {
        results[personId] = await syncPerson(personId, slots, creds);
      } catch (e) {
        results[personId] = { pushed: 0, deleted: 0, errors: [String(e)] };
        console.warn(`[caldav-push] sync ${personId}:`, e);
      }
    }

    return json({ ok: true, results });
  } catch (e) {
    console.error('[caldav-push]', e);
    return json({ error: String(e) }, 500);
  }
});
