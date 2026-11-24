// Année de la clinique et verrous de fin d'année — runtime Deno (save-planning).
//
// MIROIR de src/lib/clinic-year.js : même logique, mêmes règles (voir son en-tête).
// tests/unit/clinic-year.test.js fait tourner les mêmes cas contre les deux.
// L'Edge Function tourne en UTC : ne JAMAIS utiliser getFullYear() sur la date
// du jour, toujours parisTodayIso().

type Slots = Record<string, unknown> | null | undefined;

/** Date du jour à Paris, 'YYYY-MM-DD', quel que soit le fuseau de la machine. */
export function parisTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function rolloverDate(_slots: Slots, year: number): string {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dow = jan1.getUTCDay();
  let shift: number;
  if (dow === 0) shift = 1;
  else if (dow === 6) shift = 2;
  else shift = 1 - dow;
  jan1.setUTCDate(jan1.getUTCDate() + shift);
  return jan1.toISOString().slice(0, 10);
}

export function clinicCurrentYear(todayIso: string, slots: Slots): number {
  const y = Number(todayIso.slice(0, 4));
  if (todayIso >= rolloverDate(slots, y + 1)) return y + 1;
  if (todayIso < rolloverDate(slots, y)) return y - 1;
  return y;
}

export function asvLockDate(_slots: Slots, year: number): string {
  return `${year}-01-15`;
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
