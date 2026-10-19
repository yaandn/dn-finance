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
