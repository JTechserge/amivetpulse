// Année de la clinique et verrous de fin d'année — runtime Deno (save-planning).
//
// MIROIR de src/lib/clinic-year.js : même logique, mêmes réglages, mêmes bornes.
// tests/unit/clinic-year.test.js fait tourner les mêmes cas contre les deux.
// L'Edge Function tourne en UTC : ne JAMAIS utiliser getFullYear() sur la date
// du jour, toujours parisTodayIso().

type Slots = Record<string, unknown> | null | undefined;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date du jour à Paris, 'YYYY-MM-DD', quel que soit le fuseau de la machine. */
export function parisTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function validIsoBetween(value: unknown, min: string, max: string): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(ISO_RE);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return value >= min && value <= max ? value : null;
}

export function rolloverDate(slots: Slots, year: number): string {
  const v = validIsoBetween(slots?.[`rollover_date_${year}`], `${year - 1}-12-01`, `${year}-01-31`);
  return v ?? `${year}-01-01`;
}

export function clinicCurrentYear(todayIso: string, slots: Slots): number {
  const y = Number(todayIso.slice(0, 4));
  if (todayIso >= rolloverDate(slots, y + 1)) return y + 1;
  if (todayIso < rolloverDate(slots, y)) return y - 1;
  return y;
}

export function asvLockDate(slots: Slots, year: number): string {
  const v = validIsoBetween(slots?.[`asv_lock_date_${year}`], `${year}-01-01`, `${year}-03-31`);
  const lock = v ?? `${year}-01-31`;
  const roll = rolloverDate(slots, year);
  return lock > roll ? lock : roll;
}

export function isAsvMonthLocked(slots: Slots, todayIso: string, year: number, month0: number): boolean {
  const flag = slots?.[`closed_month_${year}_${month0}`];
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return todayIso >= asvLockDate(slots, year + 1);
}

export function isForecastYearLocked(slots: Slots, todayIso: string, year: number): boolean {
  const flag = slots?.[`forecast_closed_${year}`];
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return clinicCurrentYear(todayIso, slots) >= year;
}

export function forecastWeekYear(mondayIso: string): number {
  const [y, m, d] = mondayIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 3)).getUTCFullYear();
}
