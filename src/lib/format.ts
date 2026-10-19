const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => (n == null ? "—" : brl.format(n));
export const moneyCompact = (n: number) => brlCompact.format(n);
export const percent = (n: number | null | undefined) => (n == null ? "—" : pct.format(n));

export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function longDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function weekday(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" });
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" -> "out/26" */
export function monthShort(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}

/** "2026-10" -> "Outubro de 2026" */
export function monthLong(month: string) {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}
