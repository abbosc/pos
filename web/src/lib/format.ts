const nf = new Intl.NumberFormat('ru-RU');

/** 125000 → "125 000" */
export function num(v: number | null | undefined): string {
  return nf.format(v ?? 0).replace(/ | /g, ' ');
}

/** 125000 → "125 000 soʻm" */
export function som(v: number | null | undefined): string {
  return `${num(v)} soʻm`;
}

/** Signed amount for differences: +5 000 / −5 000 / 0 */
export function signedSom(v: number): string {
  if (v === 0) return '0 soʻm';
  return `${v > 0 ? '+' : '−'}${num(Math.abs(v))} soʻm`;
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

/** "2026-11-16" → "16-noyabr" */
export function dayLabel(iso: string, withWeekday = false): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const base = `${d}-${MONTHS[m - 1]}`;
  if (!withWeekday) return base;
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${base}, ${wd}`;
}

const TZ = 'Asia/Tashkent';

/** Today in Tashkent as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO timestamp → "16-noyabr, 14:05" (Tashkent time) */
export function dateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  const label = day === todayIso() ? 'Bugun' : day === addDays(todayIso(), -1) ? 'Kecha' : dayLabel(day);
  return `${label}, ${time}`;
}

export function relativeDay(iso: string): string {
  const t = todayIso();
  if (iso === t) return 'Bugun';
  if (iso === addDays(t, -1)) return 'Kecha';
  return dayLabel(iso, true);
}
