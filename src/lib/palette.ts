// Paleta das categorias, compartilhada entre servidor e cliente.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.6 0.12 250)",
  "oklch(0.65 0.12 30)",
  "oklch(0.6 0.08 120)",
];

export function categoryColor(index: number) {
  return index < PALETTE.length ? PALETTE[index] : "var(--muted-foreground)";
}
