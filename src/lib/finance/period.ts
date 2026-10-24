import type { Period } from "@/lib/finance/types";

export function resolvePeriod(days: number): Period {
  const safe = [30, 60, 90].includes(days) ? days : 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (safe - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to), days: safe };
}

/** Maior intervalo personalizado aceito (a Belvo guarda cerca de um ano). */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Data real no calendário (2026-02-30 não passa: o Date viraria 2 de março). */
const isValidDate = (s: string) => {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Intervalo personalizado (?de=YYYY-MM-DD&ate=YYYY-MM-DD). Inválido = null.
 * Datas futuras viram hoje e intervalos longos são cortados no início.
 */
export function resolveRange(
  from: string | null | undefined,
  to: string | null | undefined,
): Period | null {
  if (!from || !to || !isValidDate(from) || !isValidDate(to)) return null;
  const today = new Date().toISOString().slice(0, 10);
  let end = to > today ? today : to;
  let start = from;
  if (start > end) [start, end] = [end, start];
  const day = 86_400_000;
  const span = Math.round((Date.parse(end) - Date.parse(start)) / day) + 1;
  if (span > MAX_RANGE_DAYS) {
    start = new Date(Date.parse(end) - (MAX_RANGE_DAYS - 1) * day)
      .toISOString()
      .slice(0, 10);
  }
  const days = Math.min(span, MAX_RANGE_DAYS);
  return { from: start, to: end, days };
}
