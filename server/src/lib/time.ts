import { config } from '../config.js';

/** Today's date (YYYY-MM-DD) in Tashkent. */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
