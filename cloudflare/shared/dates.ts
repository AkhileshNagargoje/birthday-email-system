/**
 * Date handling for birthdays.
 *
 * Ported from the Python version, including the two rules that took real
 * bother to get right there: day-first parsing (Indian forms overwhelmingly
 * write DD/MM/YYYY) and wishing 29 February people on the 28th in non-leap
 * years so they are not skipped three years out of four.
 */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

export interface ParsedDob {
  iso: string; // YYYY-MM-DD
  month: number; // 1-12
  day: number; // 1-31
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > new Date().getUTCFullYear()) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function build(y: number, m: number, d: number): ParsedDob | null {
  if (!valid(y, m, d)) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, month: m, day: d };
}

/**
 * Best-effort parse of whatever a human typed. Returns null rather than
 * guessing when the text cannot be read confidently.
 */
export function parseDob(input: string | null | undefined): ParsedDob | null {
  if (!input) return null;
  const text = String(input).trim();
  if (!text) return null;

  // ISO first - unambiguous.
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  // Numeric with separators. Day-first, falling back to month-first only when
  // day-first is impossible (e.g. 03/25/2004).
  const num = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (num) {
    const a = +num[1];
    const b = +num[2];
    let y = +num[3];
    if (num[3].length === 2) y += y > 30 ? 1900 : 2000;
    return build(y, b, a) ?? build(y, a, b);
  }

  // "13 August 2004" / "13 Aug 2004"
  const dmy = text.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmy) {
    const m = monthNumber(dmy[2]);
    if (m) return build(+dmy[3], m, +dmy[1]);
  }

  // "August 13, 2004" / "Aug 13 2004"
  const mdy = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const m = monthNumber(mdy[1]);
    if (m) return build(+mdy[3], m, +mdy[2]);
  }

  return null;
}

function monthNumber(word: string): number | null {
  const w = word.toLowerCase();
  const full = MONTHS.indexOf(w);
  if (full >= 0) return full + 1;
  const short = SHORT_MONTHS.indexOf(w.slice(0, 3));
  return short >= 0 ? short + 1 : null;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * The (month, day) pairs to wish on a given date. Normally just that date,
 * plus 29 February when the 28th falls in a non-leap year.
 */
export function celebrantKeysFor(date: Date): Array<{ month: number; day: number }> {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const keys = [{ month, day }];

  if (month === 2 && day === 28 && !isLeapYear(date.getUTCFullYear())) {
    keys.push({ month: 2, day: 29 });
  }
  return keys;
}

/** The date in a fixed IANA zone, as a UTC-anchored Date at midnight. */
export function todayIn(timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fullName;
}

/** 'PRAJWAL shete' -> 'Prajwal Shete', but MixedCase names are left alone. */
export function tidyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(" ")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
  }
  return trimmed;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}
